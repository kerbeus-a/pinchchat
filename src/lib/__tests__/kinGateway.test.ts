import { describe, it, expect, vi, afterEach } from 'vitest';
import { KinGatewayClient, AuthError } from '../kinGateway';

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(lines: unknown[]): Response {
  const body = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(line)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

// Helper: connect a client by mocking the /api/identity response.
async function connectClient(client: KinGatewayClient, memberId = 'yuri') {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ member_id: memberId, name: 'Yuri', is_admin: true }));
  await client.connect();
}

describe('KinGatewayClient — connect()', () => {
  it('sets agent from identity member_id on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ member_id: 'yuri', name: 'Yuri', is_admin: true }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    let connectedStatus = '';
    client.onStatus(s => { connectedStatus = s; });
    await client.connect();
    expect(client.memberId).toBe('yuri');
    expect(connectedStatus).toBe('connected');
  });

  it('derives agent per member: artem gets artem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ member_id: 'artem', name: 'Artem', is_admin: false }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await client.connect();
    expect(client.memberId).toBe('artem');
  });

  it('throws AuthError on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'bad-token');
    let status = '';
    client.onStatus(s => { status = s; });
    await expect(client.connect()).rejects.toBeInstanceOf(AuthError);
    expect(status).toBe('disconnected');
  });

  it('throws AuthError on 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await expect(client.connect()).rejects.toBeInstanceOf(AuthError);
  });

  it('sets disconnected (not throw) on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    let status = '';
    client.onStatus(s => { status = s; });
    await client.connect(); // should NOT throw
    expect(status).toBe('disconnected');
    expect(client.memberId).toBe('');
  });

  it('sets disconnected when identity has no member_id (old server)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ name: 'Yuri', is_admin: true }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    let status = '';
    client.onStatus(s => { status = s; });
    await client.connect();
    expect(status).toBe('disconnected');
  });
});

describe('KinGatewayClient — sessions.list', () => {
  it('maps active_context_tokens to totalTokens for the context meter', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await connectClient(client);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      sessions: [{
        id: 's1',
        title: 'Simple chat',
        message_count: 2,
        active_context_tokens: 77_190,
        context_window: 258_400,
        total_input_tokens: 1_155_184,
        output_tokens: 8_511,
      }],
    }));

    const res = await client.send('sessions.list', {}) as { sessions: Array<Record<string, unknown>> };

    expect(res.sessions[0]).toMatchObject({
      key: 's1',
      totalTokens: 77_190,
      contextTokens: 258_400,
      inputTokens: 1_155_184,
      outputTokens: 8_511,
    });
  });

  it('uses the resolved member_id (not a persona id) as agent param', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    // connectClient uses mockResolvedValueOnce which is consumed by connect().
    // We set up the sessions.list mock AFTER connecting.
    await connectClient(client, 'yuri');
    vi.restoreAllMocks();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ sessions: [] }));
    await client.send('sessions.list', {});
    expect(fetchSpy.mock.calls).toHaveLength(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('agent=yuri');
    expect(url).not.toContain('agent=kerbeus');
    expect(url).not.toContain('agent=beatrice');
  });

  it('throws AuthError on 401 instead of returning empty array', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await connectClient(client);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(client.send('sessions.list', {})).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await connectClient(client);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    await expect(client.send('sessions.list', {})).rejects.toBeInstanceOf(AuthError);
  });
});

describe('KinGatewayClient — streaming', () => {
  it('treats delta content as a full snapshot, not an incremental append', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await connectClient(client);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      { type: 'delta', content: 'Hel' },
      { type: 'delta', content: 'Hello' },
      { type: 'final', content: 'Hello' },
    ]));

    const deltas: string[] = [];
    client.onEvent((event, payload) => {
      if (event !== 'chat' || payload.state !== 'delta') return;
      const message = payload.message as { content?: Array<{ text?: string }> } | undefined;
      deltas.push(message?.content?.[0]?.text ?? '');
    });

    await client.send('chat.send', { sessionKey: 's1', message: 'hi' });

    await vi.waitFor(() => {
      expect(deltas).toEqual(['Hel', 'Hello']);
    });
  });
});
