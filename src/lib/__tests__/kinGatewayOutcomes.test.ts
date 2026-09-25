// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KinGatewayClient } from '../kinGateway';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('Kin background outcome cursor', () => {
  it('replays outcomes independently from chat final events and advances its cursor', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ member_id: 'yuri' }))
      .mockResolvedValueOnce(json({ cursor: 42, outcomes: [{ id: '42', sessionKey: 'report', deliveryId: 'delivery', content: 'Ready.', timestamp: 1 }] }))
      .mockResolvedValueOnce(json({ cursor: 42, outcomes: [] }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'private-token');
    const events: Array<[string, Record<string, unknown>]> = [];
    client.onEvent((event, payload) => events.push([event, payload]));
    await client.connect();
    await client.pollBackgroundOutcomes(); await client.pollBackgroundOutcomes();
    expect(events).toEqual([['background_message', expect.objectContaining({ id: '42', sessionKey: 'report', content: 'Ready.' })]]);
    expect(fetcher.mock.calls[2]?.[0]).toBe('http://localhost/kinchat/v1/api/gm/outcomes?after=42');
    expect(String(fetcher.mock.calls[1]?.[0])).not.toContain('private-token');
    expect(events.some(([event]) => event === 'chat')).toBe(false);
    client.disconnect();
  });
  it('does not publish delayed outcomes after disconnect', async () => {
    let finish!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ member_id: 'yuri' }))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'private-token');
    const listener = vi.fn(); client.onEvent(listener);
    await client.connect();
    const pending = client.pollBackgroundOutcomes();
    client.disconnect();
    finish(json({ cursor: 43, outcomes: [{ id: '43', sessionKey: 'report', content: 'Late', timestamp: 1 }] }));
    await pending;
    expect(listener).not.toHaveBeenCalled();
  });
  it('refuses file paths and uses the authenticated endpoint for a document id', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ member_id: 'yuri' }))
      .mockResolvedValueOnce(json({ error: 'forbidden' }, 403));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'private-token');
    await client.connect();
    await expect(client.downloadArtifact('../../etc/passwd')).rejects.toThrow('unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const id = '00000000-0000-0000-0000-000000000001';
    await expect(client.downloadArtifact(id)).rejects.toThrow('revoked');
    expect(fetcher.mock.calls[1]).toEqual([`http://localhost/kinchat/v1/api/gm/artifacts/${id}`,
      { headers: { Authorization: 'Bearer private-token' }, signal: expect.any(AbortSignal) }]);
    client.disconnect();
  });
  it.each(['fetch', 'blob'] as const)('does not finish a document after disconnect during %s', async stage => {
    const createObjectURL = vi.fn(() => 'blob:forbidden');
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createObjectURL; });
    const append = vi.spyOn(document.body, 'append');
    let finish!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    let signal: AbortSignal | undefined;
    const response = new Response('Private document');
    if (stage === 'blob') vi.spyOn(response, 'blob').mockImplementation(() => new Promise(resolve => {
      finish = () => resolve(new Blob(['Private document'])); started();
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ member_id: 'yuri' }))
      .mockImplementationOnce(async (_url, init) => {
        signal = init?.signal ?? undefined;
        if (stage === 'fetch') await new Promise<void>(resolve => { finish = resolve; started(); });
        return response;
      });
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'private-token');
    await client.connect();
    const download = client.downloadArtifact('00000000-0000-0000-0000-000000000001');
    await waiting;
    client.disconnect();
    expect(signal?.aborted).toBe(true);
    finish();
    await expect(download).rejects.toThrow(/cancelled|unavailable/);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});
