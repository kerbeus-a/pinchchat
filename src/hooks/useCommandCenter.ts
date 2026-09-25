import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_WORKSPACE_SCOPE,
  parseEvidenceReferences,
  parseSessionContext,
  parseSourceConnections,
  parseWorkspaces,
  parseWorkspaceScope,
  sourceHealthSummary,
  type CommandCenterSend,
  type EvidenceReference,
  type InteractionMode,
  type SourceConnection,
  type SessionContextSnapshot,
  type WorkspaceDefinition,
  type WorkspaceId,
  type WorkspaceSessionScope,
} from '../lib/commandCenter';

export function useCommandCenter(
  send: CommandCenterSend,
  sessionKey: string,
  enabled: boolean,
  privateSourceAccess = true,
) {
  const [workspaces, setWorkspaces] = useState<WorkspaceDefinition[]>([]);
  const [scope, setScope] = useState<WorkspaceSessionScope>({ ...DEFAULT_WORKSPACE_SCOPE });
  const [sources, setSources] = useState<SourceConnection[]>([]);
  const [evidence, setEvidence] = useState<EvidenceReference[]>([]);
  const [sessionContext, setSessionContext] = useState<SessionContextSnapshot | null>(null);
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
      setSessionContext(null);
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
      if (!privateSourceAccess) {
        setSources([]);
        setEvidence([]);
        setSessionContext(null);
        setEvidenceContext(`${sessionKey}:${nextScope.workspaceId}`);
        return;
      }
      const [sourceResult, evidenceResult, contextResult] = await Promise.allSettled([
        send('sources.list', { workspaceId: nextScope.workspaceId }),
        send('evidence.list', { sessionKey, workspaceId: nextScope.workspaceId }),
        send('session.context.get', { sessionKey }),
      ]);
      if (!cancelled) {
        setSources(sourceResult.status === 'fulfilled'
          ? parseSourceConnections(sourceResult.value.sources)
          : []);
        setEvidence(evidenceResult.status === 'fulfilled'
          ? parseEvidenceReferences(evidenceResult.value.evidence)
          : []);
        setSessionContext(contextResult.status === 'fulfilled'
          ? parseSessionContext(contextResult.value.context)
          : null);
        setEvidenceContext(`${sessionKey}:${nextScope.workspaceId}`);
        if (contextResult.status === 'rejected') {
          setError('Session context is unavailable');
        }
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
  }, [enabled, privateSourceAccess, send, sessionKey]);

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
      const response = await send('session.scope.set', {
        sessionKey,
        ...candidate,
        resetContext: candidate.workspaceId !== scope.workspaceId,
      });
      const persisted = parseWorkspaceScope(response.scope);
      setScope(persisted);
      if (persisted.workspaceId !== scope.workspaceId) {
        if (!privateSourceAccess) {
          setSources([]);
          setEvidence([]);
          setSessionContext(null);
          setEvidenceContext(`${sessionKey}:${persisted.workspaceId}`);
          return persisted;
        }
        const [sourceResult, evidenceResult, contextResult] = await Promise.allSettled([
          loadSources(persisted.workspaceId),
          loadEvidence(persisted.workspaceId),
          send('session.context.get', { sessionKey }),
        ]);
        if (sourceResult.status === 'rejected') setSources([]);
        if (evidenceResult.status === 'rejected') {
          setEvidence([]);
          setEvidenceContext(`${sessionKey}:${persisted.workspaceId}`);
        }
        if (contextResult.status === 'fulfilled') {
          setSessionContext(parseSessionContext(contextResult.value.context));
        } else {
          setSessionContext(null);
          setError('Scope saved, but session context is unavailable');
        }
      } else if (persisted.mode !== scope.mode && privateSourceAccess) {
        try {
          const contextResponse = await send('session.context.get', { sessionKey });
          setSessionContext(parseSessionContext(contextResponse.context));
        } catch {
          setSessionContext(null);
          setError('Scope saved, but session context is unavailable');
        }
      }
      return persisted;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save scope');
      return null;
    } finally {
      setSaving(false);
    }
  }, [loadEvidence, loadSources, privateSourceAccess, scope, send, sessionKey]);

  const health = useMemo(() => sourceHealthSummary(sources), [sources]);
  const visibleEvidence = evidenceContext === `${sessionKey}:${scope.workspaceId}` ? evidence : [];

  const refreshSources = useCallback(async () => {
    if (!privateSourceAccess) {
      setSources([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await loadSources(scope.workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sources');
    } finally {
      setLoading(false);
    }
  }, [loadSources, privateSourceAccess, scope.workspaceId]);

  const refreshEvidence = useCallback(async () => {
    if (!privateSourceAccess) {
      setEvidence([]);
      setEvidenceContext(`${sessionKey}:${scope.workspaceId}`);
      setError(null);
      setEvidenceLoading(false);
      return;
    }
    setEvidenceLoading(true);
    try {
      await loadEvidence(scope.workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load evidence');
    } finally {
      setEvidenceLoading(false);
    }
  }, [loadEvidence, privateSourceAccess, scope.workspaceId, sessionKey]);

  const refreshWorkspaces = useCallback(async () => {
    const response = await send('workspaces.list', {});
    const next = parseWorkspaces(response.workspaces);
    setWorkspaces(next);
    return next;
  }, [send]);

  const createWorkspace = useCallback(async (input: { label: string; description: string }) => {
    await send('workspaces.create', input);
    return refreshWorkspaces();
  }, [refreshWorkspaces, send]);

  const updateWorkspace = useCallback(async (workspaceId: WorkspaceId, input: { label: string; description: string }) => {
    await send('workspaces.update', { workspaceId, ...input });
    const next = await refreshWorkspaces();
    if (workspaceId === scope.workspaceId && privateSourceAccess) {
      const contextResponse = await send('session.context.get', { sessionKey });
      setSessionContext(parseSessionContext(contextResponse.context));
    }
    return next;
  }, [privateSourceAccess, refreshWorkspaces, scope.workspaceId, send, sessionKey]);

  return {
    workspaces, scope, sources, evidence: visibleEvidence, sessionContext, health, loading, evidenceLoading, saving, error,
    updateScope, refreshSources, refreshEvidence, refreshWorkspaces, createWorkspace, updateWorkspace,
  };
}
