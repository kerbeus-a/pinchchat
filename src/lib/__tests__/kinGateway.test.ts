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

  it('connects without Authorization when the LAN gateway provides identity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ member_id: 'yuri', name: 'Yuri', is_admin: true }));
    const client = new KinGatewayClient('http://localhost/kinchat/v1');

    await client.connect();

    expect(client.memberId).toBe('yuri');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.stringify(init?.headers ?? {})).not.toContain('Authorization');
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

describe('KinGatewayClient — agents.list', () => {
  it('returns the connected member without warning about an unsupported method', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1');
    await connectClient(client, 'yuri');
    vi.restoreAllMocks();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await client.send('agents.list', {}) as { agents: Array<Record<string, unknown>> };

    expect(res.agents).toEqual([{ id: 'yuri', agentId: 'yuri' }]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('KinGatewayClient — command center', () => {
  it('uses the workspace, scope, and source REST routes', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await connectClient(client, 'yuri');
    vi.restoreAllMocks();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ workspaces: [] }))
      .mockResolvedValueOnce(jsonResponse({ scope: { workspaceId: 'tasterra', mode: 'query', sourceIds: [] } }))
      .mockResolvedValueOnce(jsonResponse({ scope: { workspaceId: 'home', mode: 'action', sourceIds: ['mail-home'] } }))
      .mockResolvedValueOnce(jsonResponse({ sources: [] }))
      .mockResolvedValueOnce(jsonResponse({ evidence: [] }));

    await client.send('workspaces.list', {});
    await client.send('session.scope.get', { sessionKey: 'session/with spaces' });
    await client.send('session.scope.set', {
      sessionKey: 's1',
      workspaceId: 'home',
      mode: 'action',
      sourceIds: ['mail-home'],
    });
    await client.send('sources.list', { workspaceId: 'other-company' });
    await client.send('evidence.list', { sessionKey: 'session/with spaces', workspaceId: 'tasterra' });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost/kinchat/v1/api/workspaces');
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('http://localhost/kinchat/v1/api/sessions/session%2Fwith%20spaces/scope');
    expect(fetchSpy.mock.calls[2]?.[0]).toBe('http://localhost/kinchat/v1/api/sessions/s1/scope');
    const scopeInit = fetchSpy.mock.calls[2]?.[1] as RequestInit;
    expect(scopeInit.method).toBe('PUT');
    expect(JSON.parse(String(scopeInit.body))).toEqual({
      workspace_id: 'home',
      mode: 'action',
      source_ids: ['mail-home'],
    });
    expect(fetchSpy.mock.calls[3]?.[0]).toBe('http://localhost/kinchat/v1/api/sources?workspace=other-company');
    expect(fetchSpy.mock.calls[4]?.[0]).toBe('http://localhost/kinchat/v1/api/sessions/session%2Fwith%20spaces/evidence?workspace=tasterra');
  });
});

describe('KinGatewayClient — streaming', () => {
  it('posts chat attachments as multipart form data', async () => {
    const client = new KinGatewayClient('http://localhost/kinchat/v1', 'tok');
    await connectClient(client);
    vi.restoreAllMocks();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      { type: 'final', content: 'ok' },
    ]));
    const file = new File(['%PDF-1.4'], 'first.pdf', { type: 'application/pdf' });

    await client.send('chat.send', {
      sessionKey: 's1',
      message: 'compare docs',
      attachments: [{ file, fileName: 'first.pdf', mimeType: 'application/pdf' }],
    });

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://localhost/kinchat/v1/api/chat');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Content-Type']).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init!.body as FormData;
    expect(body.get('agent')).toBe('yuri');
    expect(body.get('session_id')).toBe('s1');
    expect(body.get('message')).toBe('compare docs');
    const files = body.getAll('files');
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect((files[0] as File).name).toBe('first.pdf');
    expect((files[0] as File).type).toBe('application/pdf');
    expect((files[0] as File).size).toBe(8);
  });

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
