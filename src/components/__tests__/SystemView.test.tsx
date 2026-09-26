// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemView } from '../SystemView';

const data = () => ({ checkedAt: new Date().toISOString(), staleAfterMs: 180_000,
  services: [{ id: 'qwen', name: 'Qwen', reachable: true, readiness: 'ready', detail: 'Health ready', lastSuccessAt: null },
    { id: 'sure', name: 'Sure', reachable: true, readiness: 'not_integrated', detail: 'Not configured', lastSuccessAt: null, applicationUrl: 'http://192.168.1.14:5082' }],
  storage: [{ id: 'archive', path: '/mnt/archive', mounted: false, freeBytes: null, totalBytes: null, state: 'blocked', detail: 'Archive mount missing' }],
  localInference: { inFlight: 1, waiting: 2 }, documentProcessing: { queueDepth: null, lastSuccessAt: null, readiness: 'not_enabled' },
  backup: { sameDiskSnapshotAt: null, independentCopy: 'unknown', restoreVerified: 'unknown', detail: 'No verified restore' } });

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('System view', () => {
  it('shows separate readiness, missing mount and honest unknown queue/backups', async () => {
    const send = vi.fn().mockResolvedValue(data());
    render(<SystemView send={send} accessAvailable />);
    expect(await screen.findByText('Qwen')).toBeTruthy();
    expect(screen.getByText('Not connected to Kin')).toBeTruthy();
    expect(screen.getByText('Archive mount missing')).toBeTruthy();
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.getByText('No verified restore')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Sure' }).getAttribute('href')).toBe('http://192.168.1.14:5082');
    expect(send).toHaveBeenCalledWith('system.status', {});
  });
  it('does not request host data without owner access', async () => {
    const send = vi.fn();
    render(<SystemView send={send} accessAvailable={false} />);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(send).not.toHaveBeenCalled();
  });
  it('retains last readings and scroll container after refresh failure', async () => {
    const send = vi.fn().mockResolvedValueOnce(data()).mockRejectedValue(new Error('offline'));
    render(<SystemView send={send} accessAvailable />);
    await screen.findByText('Qwen');
    const pane = screen.getByRole('region', { name: 'System status' });
    pane.scrollTop = 180;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh system status' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Qwen')).toBeTruthy();
    expect(pane.scrollTop).toBe(180);
    expect(screen.getByRole('region', { name: 'System status' })).toBe(pane);
  });
  it('marks readings stale after three minutes without a successful check', async () => {
    const old = data(); old.checkedAt = new Date(Date.now() - 180_001).toISOString();
    render(<SystemView send={vi.fn().mockResolvedValue(old)} accessAvailable />);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
  });
  it('does not overlap requests or update an unmounted view', async () => {
    let resolve!: (value: ReturnType<typeof data>) => void;
    const send = vi.fn(() => new Promise<ReturnType<typeof data>>(r => { resolve = r; }));
    const { unmount } = render(<SystemView send={send} accessAvailable />);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh system status' }));
    expect(send).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => resolve(data()));
  });
});
