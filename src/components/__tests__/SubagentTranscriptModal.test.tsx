/**
 * @vitest-environment jsdom
 *
 * Adversarial tests for SubagentTranscriptModal — focus on close paths,
 * loading/empty/error states, and that no write surface exists.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { SubagentTranscriptModal } from '../SubagentTranscriptModal';
import type { SubagentSummary } from '../../types';

function makeSubagent(overrides: Partial<SubagentSummary> = {}): SubagentSummary {
  return {
    id: 'agent-deadbeef',
    parentSessionKey: 'd7c5ab92-22a1-4b09-9f81-27397249953e',
    agentType: 'general-purpose',
    description: 'test subagent',
    startedAt: 1_700_000_000_000,
    lastActive: 1_700_000_001_000,
    messageCount: 2,
    preview: 'hi',
    ...overrides,
  };
}

const fakeMessages = [
  { id: 'u1', role: 'user' as const, content: [{ type: 'text' as const, text: 'first user msg' }], timestamp: 1_700_000_000_000 },
  { id: 'a1', role: 'assistant' as const, content: [{ type: 'text' as const, text: 'first assistant reply' }], timestamp: 1_700_000_001_000 },
];

describe('SubagentTranscriptModal', () => {
  it('renders the description in the header', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    expect(screen.getByText('test subagent')).toBeDefined();
  });

  it('falls back to subagent id when description is null', () => {
    const loader = vi.fn(async () => []);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal
      subagent={makeSubagent({ description: null })}
      loadMessages={loader}
      onClose={onClose}
    />);
    expect(screen.getByText('agent-deadbeef')).toBeDefined();
  });

  it('renders loading state before the fetch resolves', () => {
    let resolveLoader: (v: typeof fakeMessages) => void = () => {};
    const loader = vi.fn(() => new Promise<typeof fakeMessages>(resolve => { resolveLoader = resolve; }));
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    expect(screen.getByText(/Loading transcript/i)).toBeDefined();
    // resolve so cleanup doesn't warn about unhandled promise
    act(() => { resolveLoader(fakeMessages); });
  });

  it('renders messages with both roles', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('first user msg')).toBeDefined());
    expect(screen.getByText('first assistant reply')).toBeDefined();
  });

  it('shows the empty-transcript message when fetch returns []', async () => {
    const loader = vi.fn(async () => []);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Empty transcript.')).toBeDefined());
    // Empty success must NOT claim auth/network failure. [Audit transcript-modal / L2]
    expect(screen.queryByText(/Failed to load/i)).toBeNull();
  });

  it('distinguishes fetch failure from empty success', async () => {
    const loader = vi.fn(async () => { throw new Error('network down'); });
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Failed to load transcript.')).toBeDefined());
    expect(screen.queryByText('Empty transcript.')).toBeNull();
  });

  it('calls onClose when Escape is pressed', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the X button is clicked', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    const backdrop = screen.getByLabelText('Close transcript');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not crash when loadMessages rejects', async () => {
    const loader = vi.fn(async () => { throw new Error('network down'); });
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/Failed to load|Empty/i)).toBeDefined());
  });

  it('exposes no input controls (read-only surface)', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    const { container } = render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('first user msg')).toBeDefined());
    const dialog = within(container).getByRole('dialog');
    // Only the close button should be a button inside the dialog.
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.length).toBe(1);
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(within(dialog).queryByRole('searchbox')).toBeNull();
  });

  it('refetches when the subagent prop changes', async () => {
    const loader = vi.fn(async () => fakeMessages);
    const onClose = vi.fn();
    const { rerender } = render(<SubagentTranscriptModal subagent={makeSubagent()} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    rerender(<SubagentTranscriptModal subagent={makeSubagent({ id: 'agent-other' })} loadMessages={loader} onClose={onClose} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    const lastCall = loader.mock.calls[loader.mock.calls.length - 1];
    expect(lastCall[1]).toBe('agent-other');
  });

  it('renders the message count and agent type in the subheader', () => {
    const loader = vi.fn(async () => []);
    const onClose = vi.fn();
    render(<SubagentTranscriptModal subagent={makeSubagent({ messageCount: 7 })} loadMessages={loader} onClose={onClose} />);
    expect(screen.getByText(/general-purpose/)).toBeDefined();
    expect(screen.getByText(/7 msg/)).toBeDefined();
  });
});
