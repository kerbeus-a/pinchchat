import { ChevronDown, Database, LockKeyhole, PanelRight, Settings2, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { WorkspaceManagerDialog } from './WorkspaceManagerDialog';
import type {
  InteractionMode,
  SourceConnection,
  WorkspaceDefinition,
  WorkspaceId,
  WorkspaceSessionScope,
  ConnectorHealthStatus,
} from '../lib/commandCenter';

const HEALTH_CLASS: Record<ConnectorHealthStatus, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  offline: 'bg-red-400',
  unknown: 'bg-zinc-500',
};

export function CommandCenterBar({
  workspaces,
  scope,
  sources,
  health,
  loading,
  saving,
  error,
  evidenceOpen,
  actionAvailable,
  onToggleEvidence,
  onRequestActionAccess,
  onUpdateScope,
  onCreateWorkspace,
  onUpdateWorkspace,
}: {
  workspaces: WorkspaceDefinition[];
  scope: WorkspaceSessionScope;
  sources: SourceConnection[];
  health: { label: string; status: ConnectorHealthStatus };
  loading: boolean;
  saving: boolean;
  error: string | null;
  evidenceOpen: boolean;
  actionAvailable: boolean;
  onToggleEvidence: () => void;
  onRequestActionAccess: () => void;
  onUpdateScope: (next: { workspaceId?: WorkspaceId; mode?: InteractionMode; sourceIds?: string[] }) => Promise<unknown>;
  onCreateWorkspace: (input: { label: string; description: string }) => Promise<unknown>;
  onUpdateWorkspace: (workspaceId: string, input: { label: string; description: string }) => Promise<unknown>;
}) {
  const sourceMenuRef = useRef<HTMLDetailsElement>(null);
  const [workspaceManagerOpen, setWorkspaceManagerOpen] = useState(false);
  const [pendingWorkspace, setPendingWorkspace] = useState<string | null>(null);
  const disabled = loading || saving;
  const sourceLabel = scope.sourceIds.length === 0
    ? 'All sources'
    : `${scope.sourceIds.length} source${scope.sourceIds.length === 1 ? '' : 's'}`;

  const changeWorkspace = (workspaceId: WorkspaceId) => {
    if (workspaceId === scope.workspaceId) return;
    setPendingWorkspace(workspaceId);
  };

  const toggleSource = async (sourceId: string) => {
    const sourceIds = scope.sourceIds.includes(sourceId)
      ? scope.sourceIds.filter((id) => id !== sourceId)
      : [...scope.sourceIds, sourceId];
    await onUpdateScope({ sourceIds });
  };

  return (
    <div className="shrink-0 border-b border-pc-border bg-[var(--pc-bg-surface)] px-3 py-2" aria-label="Conversation scope">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative min-w-0">
          <span className="sr-only">Workspace</span>
          <select
            value={scope.workspaceId}
            disabled={disabled}
            onChange={(event) => { void changeWorkspace(event.target.value as WorkspaceId); }}
            className="h-8 max-w-[180px] appearance-none rounded-md border border-pc-border bg-[var(--pc-bg-input)] pl-2.5 pr-7 text-xs font-medium text-pc-text outline-none focus:border-pc-accent disabled:opacity-60"
            title="Workspace"
          >
            {workspaces.length === 0 && <option value={scope.workspaceId}>{scope.workspaceId}</option>}
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label}</option>)}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-pc-text-muted" />
        </label>
        <button type="button" onClick={() => setWorkspaceManagerOpen(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-pc-border text-pc-text-muted hover:text-pc-text" aria-label="Manage workspaces" title="Manage workspaces">
          <Settings2 size={14} />
        </button>

        <div className="flex h-8 shrink-0 rounded-md border border-pc-border bg-[var(--pc-bg-input)] p-0.5" aria-label="Interaction mode">
          {(['query', 'action'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (mode === 'action' && !actionAvailable) {
                  onRequestActionAccess();
                  return;
                }
                void onUpdateScope({ mode });
              }}
              className={`min-w-[62px] rounded px-2 text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
                scope.mode === mode ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light' : 'text-pc-text-muted hover:text-pc-text'
              }`}
              aria-pressed={scope.mode === mode}
              title={mode === 'action' && !actionAvailable ? 'Sign in to use Action mode' : `${mode[0].toUpperCase()}${mode.slice(1)} mode`}
            >
              {mode === 'action' && !actionAvailable && <LockKeyhole size={11} className="mr-1 inline" aria-hidden="true" />}
              {mode}
            </button>
          ))}
        </div>

        {sources.length > 0 && <details ref={sourceMenuRef} className="relative">
          <summary className="list-none h-8 flex cursor-pointer items-center gap-1.5 rounded-md border border-pc-border bg-[var(--pc-bg-input)] px-2.5 text-xs text-pc-text-secondary hover:text-pc-text [&::-webkit-details-marker]:hidden">
            <Database size={13} />
            <span className="max-w-[110px] truncate">{sourceLabel}</span>
            <ChevronDown size={12} />
          </summary>
          <div className="absolute left-0 top-10 z-50 w-64 rounded-md border border-pc-border bg-[var(--pc-bg-elevated)] p-1 shadow-xl">
            <button
              type="button"
              disabled={disabled}
              onClick={() => { void onUpdateScope({ sourceIds: [] }); sourceMenuRef.current?.removeAttribute('open'); }}
              className={`w-full rounded px-2 py-2 text-left text-xs ${scope.sourceIds.length === 0 ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light' : 'text-pc-text-secondary hover:bg-[var(--pc-hover)]'}`}
            >
              All enabled sources
            </button>
            {sources.length === 0 ? (
              <p className="px-2 py-2 text-xs text-pc-text-muted">No sources configured</p>
            ) : sources.map((source) => (
              <label key={source.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)]">
                <input
                  type="checkbox"
                  disabled={disabled || !source.enabled}
                  checked={scope.sourceIds.includes(source.id)}
                  onChange={() => { void toggleSource(source.id); }}
                  className="accent-[var(--pc-accent)]"
                />
                <span className="min-w-0 flex-1 truncate">{source.displayName}</span>
              </label>
            ))}
          </div>
        </details>}

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {sources.length > 0 && <div className="hidden sm:flex h-8 items-center gap-2 px-2 text-xs text-pc-text-muted" title={error ?? health.label}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${error ? 'bg-red-400' : HEALTH_CLASS[health.status]}`} />
            <span className="max-w-[110px] truncate">{error ? 'Scope unavailable' : health.label}</span>
          </div>}
          {scope.mode === 'query' && <ShieldCheck size={15} className="text-emerald-400" aria-label="Read-only mode" />}
          <button
            type="button"
            onClick={onToggleEvidence}
            className={`h-8 w-8 flex items-center justify-center rounded-md border transition-colors ${evidenceOpen ? 'border-pc-accent text-pc-accent-light bg-[var(--pc-accent-glow)]' : 'border-pc-border text-pc-text-muted hover:text-pc-text'}`}
            aria-label={evidenceOpen ? 'Close session context' : 'Open session context'}
            aria-pressed={evidenceOpen}
            title="Session context"
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      {pendingWorkspace && (
        <div role="dialog" aria-modal="true" aria-label="Move conversation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onKeyDown={event => { if (event.key === 'Escape' && !saving) setPendingWorkspace(null); }}>
          <div className="w-full max-w-md rounded-lg border border-pc-border bg-[var(--pc-bg-surface)] p-5 shadow-xl">
            <h2 className="text-sm font-semibold">Move to {workspaces.find(w => w.id === pendingWorkspace)?.label}?</h2>
            <p className="mt-3 text-sm text-pc-text-secondary">Chat history stays visible. Kin starts a fresh model context in the new workspace.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button autoFocus type="button" disabled={saving} onClick={() => setPendingWorkspace(null)} className="rounded-md border border-pc-border px-3 py-2 text-sm">Cancel move</button>
              <button type="button" disabled={saving} onClick={async () => { const result = await onUpdateScope({ workspaceId: pendingWorkspace }); if (result !== null) setPendingWorkspace(null); }} className="rounded-md bg-pc-accent px-3 py-2 text-sm text-white">Move conversation</button>
            </div>
          </div>
        </div>
      )}
      <WorkspaceManagerDialog
        open={workspaceManagerOpen}
        workspaces={workspaces}
        onClose={() => setWorkspaceManagerOpen(false)}
        onCreate={onCreateWorkspace}
        onUpdate={onUpdateWorkspace}
      />
    </div>
  );
}
