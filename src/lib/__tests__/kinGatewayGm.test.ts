import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KinGatewayClient } from '../kinGateway';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('KinGatewayClient GM methods', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('bootstraps a short-lived GM bearer and never sends the web token to GM command routes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ member_id: 'yuri' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'gm-token', token_type: 'Bearer', expires_at: Date.now() + 60_000 }))
      .mockResolvedValueOnce(jsonResponse({ mission: { id: 'm1', goal: 'Build controls' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new KinGatewayClient('http://127.0.0.1:3142/kinchat/v1', 'web-token');
    await client.connect();
    const res = await client.send('gm.command', {
      command: 'Build controls',
      acceptanceCriteria: ['visible'],
      sourceSessionId: 'session-1',
    });

    expect(res.mission).toMatchObject({ id: 'm1' });
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'http://127.0.0.1:3142/kinchat/v1/api/gm/auth/bootstrap?agent=yuri',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer web-token' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3,
      'http://127.0.0.1:3142/kinchat/v1/api/gm/command?agent=yuri',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer gm-token' }),
        body: JSON.stringify({
          command: 'Build controls',
          acceptance_criteria: ['visible'],
          source_session_id: 'session-1',
        }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[2])).not.toContain('web-token');
  });

  it('bootstraps GM without a web token on the LAN no-auth path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ member_id: 'yuri' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'gm-token', token_type: 'Bearer', expires_at: Date.now() + 60_000 }))
      .mockResolvedValueOnce(jsonResponse({ mission: { id: 'm1', goal: 'Build controls' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new KinGatewayClient('http://127.0.0.1:3142/kinchat/v1');
    await client.connect();
    const res = await client.send('gm.command', {
      command: 'Build controls',
      acceptanceCriteria: ['visible'],
    });

    expect(res.mission).toMatchObject({ id: 'm1' });
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'http://127.0.0.1:3142/kinchat/v1/api/gm/auth/bootstrap?agent=yuri',
      expect.objectContaining({
        method: 'POST',
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3,
      'http://127.0.0.1:3142/kinchat/v1/api/gm/command?agent=yuri',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer gm-token' }),
      }),
    );
  });

  it('reuses an unexpired GM bearer for subsequent GM reads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ member_id: 'yuri' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'gm-token', token_type: 'Bearer', expires_at: Date.now() + 60_000 }))
      .mockResolvedValueOnce(jsonResponse({ missions: [] }))
      .mockResolvedValueOnce(jsonResponse({ missions: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new KinGatewayClient('http://127.0.0.1:3142/kinchat/v1', 'web-token');
    await client.connect();
    await client.send('gm.missions.list', {});
    await client.send('gm.missions.list', {});

    const bootstrapCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/gm/auth/bootstrap'));
    expect(bootstrapCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:3142/kinchat/v1/api/gm/missions?agent=yuri',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer gm-token' }),
      }),
    );
  });

  it('sends only policy-safe task fields to the GM gateway', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ member_id: 'yuri' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'gm-token', token_type: 'Bearer', expires_at: Date.now() + 60_000 }))
      .mockResolvedValueOnce(jsonResponse({ task: { id: 't1' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new KinGatewayClient('http://127.0.0.1:3142/kinchat/v1', 'web-token');
    await client.connect();
    await client.send('gm.task.create', {
      missionId: 'm1',
      title: 'Safe task',
      objective: 'Return a summary',
      acceptanceCriteria: ['Answer only'],
      role: 'analyst',
      risk: 'low',
      expectedArtifact: 'summary',
      runner: 'codex',
      agentId: 'attacker',
      cwd: '/etc',
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:3142/kinchat/v1/api/gm/missions/m1/tasks?agent=yuri',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Safe task',
          objective: 'Return a summary',
          acceptance_criteria: ['Answer only'],
          role: 'analyst',
          risk: 'low',
          expected_artifact: 'summary',
        }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls.at(-1))).not.toContain('attacker');
    expect(JSON.stringify(fetchMock.mock.calls.at(-1))).not.toContain('/etc');
  });

  it('sends acceptance and reopen requests through the short-lived GM bearer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ member_id: 'yuri' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'gm-token', token_type: 'Bearer', expires_at: Date.now() + 60_000 }))
      .mockResolvedValueOnce(jsonResponse({ mission: { id: 'm1', status: 'completed' } }))
      .mockResolvedValueOnce(jsonResponse({ mission: { id: 'm1', status: 'active' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new KinGatewayClient('http://127.0.0.1:3142/kinchat/v1', 'web-token');
    await client.connect();
    await client.send('gm.mission.accept_completion', { missionId: 'm1', reason: 'Verified' });
    await client.send('gm.mission.reopen', { missionId: 'm1', reason: 'Follow-up needed' });

    expect(fetchMock).toHaveBeenNthCalledWith(3,
      'http://127.0.0.1:3142/kinchat/v1/api/gm/missions/m1/accept-completion?agent=yuri',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer gm-token' }),
        body: JSON.stringify({ reason: 'Verified' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4,
      'http://127.0.0.1:3142/kinchat/v1/api/gm/missions/m1/reopen?agent=yuri',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer gm-token' }),
        body: JSON.stringify({ reason: 'Follow-up needed' }),
      }),
    );
  });
});
