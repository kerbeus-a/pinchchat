// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessingView } from '../ProcessingView';
import { AuthError } from '../../lib/kinGateway';

const workspaces = [{ id: 'home', label: 'Home' }, { id: 'tasterra', label: 'TasTerra' }];
const listing = (state: string = 'queued') => ({ documents: [{ documentId: 'd1', receiptId: 'r1', name: 'synthetic.pdf', bytes: 1867,
  receivedAt: '2026-09-26 10:00:00', job: { id: 'j1', state, attempt: 1, revision: 2, error_code: null } }], nextCursor: null,
  capabilities: { intakeEnabled: true, processingEnabled: true, halted: false, extractionEnabled: false } });
afterEach(() => cleanup());

describe('Processing view', () => {
  it('does not request private data without owner access', async () => {
    const send = vi.fn(); render(<ProcessingView send={send} workspaces={workspaces} accessAvailable={false} />);
    expect(screen.getByText('Document processing is available to the owner.')).toBeTruthy(); expect(send).not.toHaveBeenCalled();
  });
  it('renders actual state and sends scoped revision-checked controls', async () => {
    const send = vi.fn().mockResolvedValue(listing());
    render(<ProcessingView send={send} workspaces={workspaces} accessAvailable />);
    await screen.findByText('Queued');
    fireEvent.click(screen.getByRole('button', { name: 'Pause synthetic.pdf' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('processing.control', expect.objectContaining({ workspaceId: 'home', jobId: 'j1', revision: 2, action: 'pause' })));
  });
  it('uploads raw File with a stable replay key after an uncertain request, then enqueues the receipt', async () => {
    let attempts = 0;
    const send = vi.fn(async (method: string) => {
      if (method === 'processing.upload') { if (++attempts === 1) throw new Error('Connection interrupted.'); return { receipt: { id: 'durable' } }; }
      if (method === 'processing.enqueue') return { job: {} };
      return listing();
    });
    render(<ProcessingView send={send} workspaces={workspaces} accessAvailable />);
    await screen.findByText('Queued');
    const file = new File(['%PDF-synthetic'], 'new.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Choose PDF', { selector: 'input' }), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Process as record' }));
    await screen.findByText('Connection interrupted.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Process as record' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Process as record' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('processing.enqueue', { workspaceId: 'home', receiptId: 'durable' }));
    const calls = send.mock.calls as unknown as Array<[string, { file: File; requestId: string }]>;
    const uploads = calls.filter(([method]) => method === 'processing.upload');
    expect(uploads[0]![1].file).toBe(file); expect(uploads[0]![1].requestId).toBe(uploads[1]![1].requestId);
  });
  it('keeps disabled admission honest but permits stopping existing work', async () => {
    const data = listing(); data.capabilities.processingEnabled = false;
    render(<ProcessingView send={vi.fn().mockResolvedValue(data)} workspaces={workspaces} accessAvailable />);
    await screen.findByText('Document processing is not enabled.');
    expect(screen.getByRole('button', { name: 'Choose PDF' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel synthetic.pdf' }).hasAttribute('disabled')).toBe(false);
  });
  it('renders document text literally without active images, links or HTML', async () => {
    const send = vi.fn(async (method: string) => method === 'processing.preview'
      ? { markdown: '<script>bad()</script> ![external](https://example.com/a) [link](https://example.com)', truncated: false }
      : listing('parsed'));
    render(<ProcessingView send={send} workspaces={workspaces} accessAvailable />);
    fireEvent.click(await screen.findByRole('button', { name: 'Preview synthetic.pdf' }));
    await screen.findByText(/<script>bad/);
    const preview = screen.getByRole('complementary', { name: 'Parsed text preview' });
    expect(preview.querySelector('script, img, a')).toBeNull();
    expect(within(preview).getByText('Parsed text. Financial extraction not enabled.')).toBeTruthy();
  });
  it('preserves its scroll container on refresh and clears private data when access is revoked', async () => {
    const send = vi.fn().mockResolvedValueOnce(listing()).mockResolvedValueOnce(listing()).mockRejectedValue(new AuthError('Access revoked.'));
    render(<ProcessingView send={send} workspaces={workspaces} accessAvailable />);
    await screen.findByText('Queued');
    const pane = screen.getByLabelText('Processing records'); pane.scrollTop = 160;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh documents' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh documents' }).hasAttribute('disabled')).toBe(false));
    expect(pane.scrollTop).toBe(160);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh documents' }));
    await screen.findByText('Access revoked.'); expect(screen.queryByText('synthetic.pdf')).toBeNull();
  });
  it('switches workspace without moving documents or chat scope', async () => {
    const send = vi.fn().mockResolvedValue(listing());
    render(<ProcessingView send={send} workspaces={workspaces} accessAvailable />);
    await screen.findByText('Queued');
    fireEvent.change(screen.getByRole('combobox', { name: 'Processing workspace' }), { target: { value: 'tasterra' } });
    await waitFor(() => expect(send).toHaveBeenCalledWith('processing.list', { workspaceId: 'tasterra', before: null }));
    expect(send.mock.calls.every(([method]) => method === 'processing.list')).toBe(true);
  });
});
