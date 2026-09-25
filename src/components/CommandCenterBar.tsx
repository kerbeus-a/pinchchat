import { ChevronDown, Database, PanelRight, ShieldCheck } from 'lucide-react';
import { useRef } from 'react';
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
  onToggleEvidence,
  onUpdateScope,
}: {
  workspaces: WorkspaceDefinition[];
  scope: WorkspaceSessionScope;
  sources: SourceConnection[];
  health: { label: string; status: ConnectorHealthStatus };
  loading: boolean;
  saving: boolean;
  error: string | null;
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
  onUpdateScope: (next: { workspaceId?: WorkspaceId; mode?: InteractionMode; sourceIds?: string[] }) => Promise<unknown>;
}) {
  const sourceMenuRef = useRef<HTMLDetailsElement>(null);
  const disabled = loading || saving;
  const sourceLabel = scope.sourceIds.length === 0
    ? 'All sources'
    : `${scope.sourceIds.length} source${scope.sourceIds.length === 1 ? '' : 's'}`;

  const changeWorkspace = async (workspaceId: WorkspaceId) => {
    if (workspaceId === scope.workspaceId) return;
    const selected = workspaces.find((workspace) => workspace.id === workspaceId);
    const confirmed = window.confirm(`Move this conversation to ${selected?.label ?? workspaceId}? Existing messages may contain context from ${workspaces.find((workspace) => workspace.id === scope.workspaceId)?.label ?? 'the current workspace'}.`);
    if (!confirmed) return;
    await onUpdateScope({ workspaceId });
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

        <div className="flex h-8 shrink-0 rounded-md border border-pc-border bg-[var(--pc-bg-input)] p-0.5" aria-label="Interaction mode">
          {(['query', 'action'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => { void onUpdateScope({ mode }); }}
              className={`min-w-[62px] rounded px-2 text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
                scope.mode === mode ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light' : 'text-pc-text-muted hover:text-pc-text'
              }`}
              aria-pressed={scope.mode === mode}
            >
              {mode}
            </button>
          ))}
        </div>

        <details ref={sourceMenuRef} className="relative">
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
        </details>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="hidden sm:flex h-8 items-center gap-2 px-2 text-xs text-pc-text-muted" title={error ?? health.label}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${error ? 'bg-red-400' : HEALTH_CLASS[health.status]}`} />
            <span className="max-w-[110px] truncate">{error ? 'Scope unavailable' : health.label}</span>
          </div>
          {scope.mode === 'query' && <ShieldCheck size={15} className="text-emerald-400" aria-label="Read-only mode" />}
          <button
            type="button"
            onClick={onToggleEvidence}
            className={`h-8 w-8 flex items-center justify-center rounded-md border transition-colors ${evidenceOpen ? 'border-pc-accent text-pc-accent-light bg-[var(--pc-accent-glow)]' : 'border-pc-border text-pc-text-muted hover:text-pc-text'}`}
            aria-label={evidenceOpen ? 'Close evidence' : 'Open evidence'}
            aria-pressed={evidenceOpen}
            title="Evidence"
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
