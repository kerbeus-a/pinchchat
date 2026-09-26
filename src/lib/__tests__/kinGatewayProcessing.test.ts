// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KinGatewayClient } from '../kinGateway';

afterEach(() => vi.restoreAllMocks());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('Processing transport', () => {
  it('uploads original bytes separately from chat with a stable request id', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ receipt: { id: 'receipt' } }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1');
    const file = new File(['%PDF-synthetic'], 'invoice & quote.pdf', { type: 'application/pdf' });
    await client.send('processing.upload', { workspaceId: 'home', file, requestId: 'stable-id' });
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost/kinchat/v1/api/intake/home?action=process_as_record&request_id=stable-id&name=invoice%20%26%20quote.pdf',
      expect.objectContaining({ method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf' } }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sends only revision and action for controls, never caller-provided member identity', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ job: {} }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'synthetic-token');
    await client.send('processing.control', { workspaceId: 'home', jobId: 'job', revision: 4,
      action: 'pause', memberId: 'other-member', receiptId: 'ignored' });
    expect(fetcher).toHaveBeenCalledWith('http://localhost/kinchat/v1/api/processing/home/job/control',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'pause', revision: 4 }),
        headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' } }));
  });

  it.each([401, 403])('surfaces %s as access revocation', async status => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'denied' }, status));
    const client = new KinGatewayClient('http://localhost/kinchat/v1');
    await expect(client.send('processing.list', { workspaceId: 'home' })).rejects.toMatchObject({ name: 'AuthError' });
  });

  it('does not upload empty files', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const client = new KinGatewayClient('http://localhost/kinchat/v1');
    await expect(client.send('processing.upload', { workspaceId: 'home', file: new File([], 'empty.pdf') })).rejects.toThrow('PDF');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces server failures without retrying or falling back', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Kin emergency stop is active.' }, 409));
    const client = new KinGatewayClient('http://localhost/kinchat/v1');
    await expect(client.send('processing.enqueue', { workspaceId: 'home', receiptId: 'receipt' })).rejects.toThrow('emergency stop');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
