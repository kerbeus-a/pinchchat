// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DocumentActivity } from '../DocumentActivity';
import type { JsonPayload } from '../../lib/kinGateway';
afterEach(cleanup);
void React;
const data = { task: { id: 'job-1', state: 'parsed', attempt: 1, pipeline: 'docling_pdf_v1' },
  executor: 'gm-private-document', worker: 'Docling CPU', model: null,
  context: { documentId: 'doc-1', receiptId: 'receipt-1', bytes: 123 },
  events: [{ id: 1, state: 'queued', attempt: 0, kind: 'snapshot', error_code: null, created_at: '2026-09-26 12:00:00' }], truncated: false };
describe('private task inspector', () => {
  it('shows truthful worker, context and migration history', async () => {
    const send = vi.fn().mockResolvedValue(data);
    render(<DocumentActivity send={send} workspace="home" jobId="job-1" name="synthetic.pdf" onClose={() => {}} />);
    await screen.findByText('Docling CPU');
    expect(send).toHaveBeenCalledWith('processing.activity', { workspaceId: 'home', jobId: 'job-1' });
    expect(screen.getByText('Not applicable (PDF parser)')).toBeTruthy();
    expect(screen.getByText('Migration snapshot')).toBeTruthy();
    expect(screen.getByText('Verified original PDF, 123 bytes')).toBeTruthy();
  });
  it('clears stale private details when a refreshed request loses access', async () => {
    const send = vi.fn().mockResolvedValue(data);
    const view = render(<DocumentActivity send={send} workspace="home" jobId="job-1" name="synthetic.pdf" onClose={() => {}} />);
    await screen.findByText('Docling CPU');
    view.rerender(<DocumentActivity send={vi.fn().mockRejectedValue(new Error('revoked'))} workspace="home" jobId="job-1" name="synthetic.pdf" onClose={() => {}} />);
    await screen.findByRole('alert');
    expect(screen.queryByText('doc-1')).toBeNull();
  });
  it('ignores a response that arrives after leaving the inspector', async () => {
    let resolve!: (value: JsonPayload) => void;
    const send = vi.fn(() => new Promise<JsonPayload>(done => { resolve = done; }));
    const view = render(<DocumentActivity send={send} workspace="home" jobId="job-1" name="synthetic.pdf" onClose={() => {}} />);
    await waitFor(() => expect(send).toHaveBeenCalled());
    view.unmount(); resolve(data);
    expect(screen.queryByText('Docling CPU')).toBeNull();
  });
});
