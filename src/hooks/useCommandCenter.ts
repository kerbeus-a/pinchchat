import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_WORKSPACE_SCOPE,
  parseSourceConnections,
  parseWorkspaces,
  parseWorkspaceScope,
  sourceHealthSummary,
  type CommandCenterSend,
  type InteractionMode,
  type SourceConnection,
  type WorkspaceDefinition,
  type WorkspaceId,
  type WorkspaceSessionScope,
} from '../lib/commandCenter';

export function useCommandCenter(send: CommandCenterSend, sessionKey: string, enabled: boolean) {
  const [workspaces, setWorkspaces] = useState<WorkspaceDefinition[]>([]);
  const [scope, setScope] = useState<WorkspaceSessionScope>({ ...DEFAULT_WORKSPACE_SCOPE });
  const [sources, setSources] = useState<SourceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async (workspaceId: WorkspaceId) => {
    const response = await send('sources.list', { workspaceId });
    const next = parseSourceConnections(response.sources);
    setSources(next);
    return next;
  }, [send]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      send('workspaces.list', {}),
      send('session.scope.get', { sessionKey }),
    ]).then(async ([workspaceResponse, scopeResponse]) => {
      if (cancelled) return;
      const nextScope = parseWorkspaceScope(scopeResponse.scope);
      setWorkspaces(parseWorkspaces(workspaceResponse.workspaces));
      setScope(nextScope);
      const sourceResponse = await send('sources.list', { workspaceId: nextScope.workspaceId });
      if (!cancelled) setSources(parseSourceConnections(sourceResponse.sources));
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Command center unavailable');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled, send, sessionKey]);

  const updateScope = useCallback(async (next: {
    workspaceId?: WorkspaceId;
    mode?: InteractionMode;
    sourceIds?: string[];
  }) => {
    const candidate = {
      workspaceId: next.workspaceId ?? scope.workspaceId,
      mode: next.mode ?? scope.mode,
      sourceIds: next.sourceIds ?? (next.workspaceId && next.workspaceId !== scope.workspaceId ? [] : scope.sourceIds),
    };
    setSaving(true);
    setError(null);
    try {
      const response = await send('session.scope.set', { sessionKey, ...candidate });
      const persisted = parseWorkspaceScope(response.scope);
      setScope(persisted);
      if (persisted.workspaceId !== scope.workspaceId) {
        try {
          await loadSources(persisted.workspaceId);
        } catch {
          setSources([]);
          setError('Scope saved, but source health is unavailable');
        }
      }
      return persisted;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save scope');
      return null;
    } finally {
      setSaving(false);
    }
  }, [loadSources, scope, send, sessionKey]);

  const health = useMemo(() => sourceHealthSummary(sources), [sources]);

  const refreshSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadSources(scope.workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sources');
    } finally {
      setLoading(false);
    }
  }, [loadSources, scope.workspaceId]);

  return { workspaces, scope, sources, health, loading, saving, error, updateScope, refreshSources };
}
