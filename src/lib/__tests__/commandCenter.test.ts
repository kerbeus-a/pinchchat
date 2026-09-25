import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_SCOPE, parseSourceConnections, parseWorkspaceScope, parseWorkspaces, sourceHealthSummary } from '../commandCenter';

describe('command center contracts', () => {
  it('parses valid workspace and scope payloads', () => {
    expect(parseWorkspaces([
      { id: 'tasterra', label: 'TasTerra', description: 'Operations', ownerOnly: false },
      { id: 'invalid', label: 'Bad', description: 'Bad', ownerOnly: false },
    ])).toEqual([{ id: 'tasterra', label: 'TasTerra', description: 'Operations', ownerOnly: false }]);
    expect(parseWorkspaceScope({ workspaceId: 'home', mode: 'action', sourceIds: ['mail-home'], persisted: true })).toEqual({
      workspaceId: 'home',
      mode: 'action',
      sourceIds: ['mail-home'],
      persisted: true,
    });
  });

  it('falls back to the safe TasTerra Query scope for invalid payloads', () => {
    expect(parseWorkspaceScope({ workspaceId: 'everything', mode: 'write-now' })).toEqual(DEFAULT_WORKSPACE_SCOPE);
  });

  it('parses source capabilities and reports the worst enabled health', () => {
    const sources = parseSourceConnections([
      {
        id: 'mail-tasterra', workspaceId: 'tasterra', connectorId: 's1t5', displayName: 'Mail archive',
        capabilities: ['search', 'get', 'execute', 'bad'], enabled: true,
        health: { status: 'degraded', message: 'Index delayed', lastCheckedAt: null, lastSuccessAt: null },
      },
      {
        id: 'docs-tasterra', workspaceId: 'tasterra', connectorId: 'paperless', displayName: 'Documents',
        capabilities: ['search', 'get'], enabled: true,
        health: { status: 'healthy', message: null, lastCheckedAt: null, lastSuccessAt: null },
      },
    ]);

    expect(sources[0]?.capabilities).toEqual(['search', 'get', 'execute']);
    expect(sourceHealthSummary(sources)).toEqual({ label: '1 degraded', status: 'degraded' });
  });
});
