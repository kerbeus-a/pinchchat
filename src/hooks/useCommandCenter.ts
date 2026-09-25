import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_WORKSPACE_SCOPE,
  parseEvidenceReferences,
  parseSourceConnections,
  parseWorkspaces,
  parseWorkspaceScope,
  sourceHealthSummary,
  type CommandCenterSend,
  type EvidenceReference,
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
  const [evidence, setEvidence] = useState<EvidenceReference[]>([]);
  const [evidenceContext, setEvidenceContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async (workspaceId: WorkspaceId) => {
    const response = await send('sources.list', { workspaceId });
    const next = parseSourceConnections(response.sources);
    setSources(next);
    return next;
  }, [send]);

  const loadEvidence = useCallback(async (workspaceId: WorkspaceId) => {
    const response = await send('evidence.list', { sessionKey, workspaceId });
    const next = parseEvidenceReferences(response.evidence);
    setEvidence(next);
    setEvidenceContext(`${sessionKey}:${workspaceId}`);
    return next;
  }, [send, sessionKey]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setEvidenceLoading(false);
      setEvidence([]);
      setEvidenceContext('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEvidenceLoading(true);
    setError(null);
    void Promise.all([
      send('workspaces.list', {}),
      send('session.scope.get', { sessionKey }),
    ]).then(async ([workspaceResponse, scopeResponse]) => {
      if (cancelled) return;
      const nextScope = parseWorkspaceScope(scopeResponse.scope);
      setWorkspaces(parseWorkspaces(workspaceResponse.workspaces));
      setScope(nextScope);
      const [sourceResponse, evidenceResponse] = await Promise.all([
        send('sources.list', { workspaceId: nextScope.workspaceId }),
        send('evidence.list', { sessionKey, workspaceId: nextScope.workspaceId }),
      ]);
      if (!cancelled) {
        setSources(parseSourceConnections(sourceResponse.sources));
          setEvidence(parseEvidenceReferences(evidenceResponse.evidence));
          setEvidenceContext(`${sessionKey}:${nextScope.workspaceId}`);
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Command center unavailable');
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setEvidenceLoading(false);
      }
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
          await Promise.all([loadSources(persisted.workspaceId), loadEvidence(persisted.workspaceId)]);
        } catch {
          setSources([]);
          setEvidence([]);
          setEvidenceContext('');
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
  }, [loadEvidence, loadSources, scope, send, sessionKey]);

  const health = useMemo(() => sourceHealthSummary(sources), [sources]);
  const visibleEvidence = evidenceContext === `${sessionKey}:${scope.workspaceId}` ? evidence : [];

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

  const refreshEvidence = useCallback(async () => {
    setEvidenceLoading(true);
    try {
      await loadEvidence(scope.workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load evidence');
    } finally {
      setEvidenceLoading(false);
    }
  }, [loadEvidence, scope.workspaceId]);

  return {
    workspaces, scope, sources, evidence: visibleEvidence, health, loading, evidenceLoading, saving, error,
    updateScope, refreshSources, refreshEvidence,
  };
}
