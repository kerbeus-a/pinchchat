/**
 * @vitest-environment jsdom
 *
 * SessionPreview adversarial tests.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { SessionPreview } from '../SessionPreview';
void React;

const gatewaySend = vi.fn();
vi.mock('../../hooks/useGateway', () => ({
  useGateway: () => ({ send: gatewaySend }),
}));

beforeEach(() => {
  gatewaySend.mockReset();
});

describe('SessionPreview', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SessionPreview sessionKey="abc" open={false} />);
    expect(container.firstChild).toBeNull();
    expect(gatewaySend).not.toHaveBeenCalled();
  });

  it('shows loader while fetching', () => {
    gatewaySend.mockImplementation(() => new Promise(() => { /* never resolves */ }));
    render(<SessionPreview sessionKey="abc" open={true} />);
    expect(screen.getByText(/Loading preview/)).toBeTruthy();
  });

  it('renders the tail of messages capped at limit', async () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }));
    gatewaySend.mockResolvedValue({ messages: msgs });
    render(<SessionPreview sessionKey="abc" open={true} limit={5} />);
    await waitFor(() => expect(screen.getByText(/m24/)).toBeTruthy());
    expect(screen.getByText(/m20/)).toBeTruthy();
    expect(screen.queryByText(/m19/)).toBeNull();
  });

  it('truncates long message bodies', async () => {
    gatewaySend.mockResolvedValue({ messages: [{ role: 'user', content: 'x'.repeat(300) }] });
    render(<SessionPreview sessionKey="abc" open={true} />);
    await waitFor(() => expect(screen.getByText(/x.*…/)).toBeTruthy());
    const text = screen.getByText(/x.*…/);
    expect(text.textContent?.length).toBeLessThan(220);
  });

  it('handles missing content fields gracefully', async () => {
    gatewaySend.mockResolvedValue({ messages: [{ role: 'user' }, { role: 'assistant', text: 'hi' }] });
    render(<SessionPreview sessionKey="abc" open={true} />);
    await waitFor(() => expect(screen.getByText('hi')).toBeTruthy());
  });

  it('shows empty-state when no messages', async () => {
    gatewaySend.mockResolvedValue({ messages: [] });
    render(<SessionPreview sessionKey="abc" open={true} />);
    await waitFor(() => expect(screen.getByText(/No messages yet/)).toBeTruthy());
  });

  it('shows error on gateway failure', async () => {
    gatewaySend.mockRejectedValue(new Error('boom'));
    render(<SessionPreview sessionKey="abc" open={true} />);
    await waitFor(() => expect(screen.getByText(/Preview failed: boom/)).toBeTruthy());
  });
});
