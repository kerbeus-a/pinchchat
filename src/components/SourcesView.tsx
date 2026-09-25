import { Database, RefreshCw } from 'lucide-react';
import type { ConnectorHealthStatus, SourceConnection } from '../lib/commandCenter';

const HEALTH_TEXT: Record<ConnectorHealthStatus, string> = {
  healthy: 'text-emerald-400',
  degraded: 'text-amber-400',
  offline: 'text-red-400',
  unknown: 'text-pc-text-muted',
};

export function SourcesView({ sources, loading, error, onRefresh }: {
  sources: SourceConnection[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="h-full overflow-y-auto px-4 py-5 sm:px-6" aria-labelledby="sources-title">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3 border-b border-pc-border pb-4">
          <div className="min-w-0 flex-1">
            <h1 id="sources-title" className="text-base font-semibold text-pc-text">Sources</h1>
            <p className="mt-1 text-xs text-pc-text-muted">Connections available to the current workspace</p>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className="h-8 w-8 flex items-center justify-center rounded-md border border-pc-border text-pc-text-muted hover:text-pc-text disabled:opacity-50" aria-label="Refresh sources" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && <p className="border-b border-red-400/20 py-3 text-xs text-red-400">{error}</p>}
        {!loading && sources.length === 0 ? (
          <div className="min-h-64 flex flex-col items-center justify-center text-center">
            <Database size={28} className="mb-3 text-pc-text-faint" />
            <p className="text-sm font-medium text-pc-text-secondary">No sources configured</p>
            <p className="mt-1 text-xs text-pc-text-muted">This workspace has no active connector records.</p>
          </div>
        ) : (
          <div className="divide-y divide-pc-border">
            {sources.map((source) => (
              <div key={source.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_120px] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${source.health.status === 'healthy' ? 'bg-emerald-400' : source.health.status === 'degraded' ? 'bg-amber-400' : source.health.status === 'offline' ? 'bg-red-400' : 'bg-zinc-500'}`} />
                    <p className="truncate text-sm font-medium text-pc-text">{source.displayName}</p>
                  </div>
                  <p className="mt-1 truncate pl-4 text-[11px] text-pc-text-muted">{source.connectorId}</p>
                </div>
                <div className="flex flex-wrap gap-1 pl-4 sm:pl-0">
                  {source.capabilities.map((capability) => <span key={capability} className="rounded border border-pc-border px-1.5 py-0.5 text-[10px] text-pc-text-muted">{capability}</span>)}
                </div>
                <div className="pl-4 sm:pl-0 sm:text-right">
                  <p className={`text-xs font-medium capitalize ${HEALTH_TEXT[source.health.status]}`}>{source.health.status}</p>
                  <p className="mt-1 text-[10px] text-pc-text-muted">{source.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
