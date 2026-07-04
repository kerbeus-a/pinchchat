/**
 * @vitest-environment jsdom
 *
 * SessionRecall adversarial tests. Focus on the gateway-facing behavior:
 * debounce, empty/short queries, error paths, result rendering.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SessionRecall } from '../SessionRecall';
void React; // keep import for JSX runtime

// Mock the gateway hook
const gatewaySend = vi.fn();
vi.mock('../../hooks/useGateway', () => ({
  useGateway: () => ({ send: gatewaySend }),
}));

beforeEach(() => {
  gatewaySend.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function openInput() {
  fireEvent.click(screen.getByRole('button', { name: /Recall a past session/i }));
}

describe('SessionRecall', () => {
  it('starts collapsed showing the trigger button', () => {
    render(<SessionRecall onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Recall a past session/i })).toBeTruthy();
  });

  it('does NOT call gateway for queries shorter than 3 chars', async () => {
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'ab' } });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(gatewaySend).not.toHaveBeenCalled();
  });

  it('debounces and calls gateway after 400ms idle', async () => {
    gatewaySend.mockResolvedValue({ sessions: [] });
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(gatewaySend).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(gatewaySend).toHaveBeenCalledOnce();
    expect(gatewaySend.mock.calls[0]![0]).toBe('sessions.searchNL');
    expect((gatewaySend.mock.calls[0]![1] as { q: string }).q).toBe('hello');
  });

  it('coalesces rapid keystrokes into a single call', async () => {
    gatewaySend.mockResolvedValue({ sessions: [] });
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.change(input, { target: { value: 'abcd' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(gatewaySend).toHaveBeenCalledOnce();
    expect((gatewaySend.mock.calls[0]![1] as { q: string }).q).toBe('abcd');
  });

  it('renders ranked results and calls onPick on click', async () => {
    gatewaySend.mockResolvedValue({
      sessions: [
        { key: 'k1', sessionKey: 'k1', label: 'Tuesday supplier chat', lastMessagePreview: 'ordered 5 tonnes' },
        { key: 'k2', sessionKey: 'k2', label: 'Friday review', lastMessagePreview: 'all done' },
      ],
    });
    const onPick = vi.fn();
    render(<SessionRecall onPick={onPick} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'supplier' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Tuesday supplier chat')).toBeTruthy();
    fireEvent.click(screen.getByText('Tuesday supplier chat'));
    expect(onPick).toHaveBeenCalledWith('k1');
  });

  it('shows empty-state message when results are empty', async () => {
    gatewaySend.mockResolvedValue({ sessions: [] });
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'nonsense xyz' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/No matching sessions/i)).toBeTruthy();
  });

  it('shows an error message when the gateway throws', async () => {
    gatewaySend.mockRejectedValue(new Error('gateway down'));
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'whatever' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('gateway down')).toBeTruthy();
  });

  it('handles missing sessions field in response (defaults to empty array)', async () => {
    gatewaySend.mockResolvedValue({});
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'something' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/No matching sessions/i)).toBeTruthy();
  });

  it('clears state when the X button is clicked', async () => {
    gatewaySend.mockResolvedValue({
      sessions: [{ key: 'k', sessionKey: 'k', label: 'something' }],
    });
    render(<SessionRecall onPick={vi.fn()} />);
    openInput();
    const input = screen.getByLabelText(/Natural-language/i);
    fireEvent.change(input, { target: { value: 'foo' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByRole('button', { name: /Close recall/i }));
    // Collapsed again
    expect(screen.queryByLabelText(/Natural-language/i)).toBeNull();
  });
});
