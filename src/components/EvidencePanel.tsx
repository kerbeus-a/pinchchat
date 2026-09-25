import { Activity, ExternalLink, FileSearch, ListChecks, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import type { EvidenceReference, WorkspaceSessionScope } from '../lib/commandCenter';

type EvidenceTab = 'evidence' | 'activity' | 'proposals';

const TABS: Array<{ id: EvidenceTab; label: string; icon: typeof FileSearch }> = [
  { id: 'evidence', label: 'Evidence', icon: FileSearch },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'proposals', label: 'Proposals', icon: ListChecks },
];

function EmptyState({ icon: Icon, title }: { icon: typeof FileSearch; title: string }) {
  return (
    <div className="min-h-48 flex flex-col items-center justify-center text-center">
      <Icon size={24} className="mb-3 text-pc-text-faint" />
      <p className="text-sm font-medium text-pc-text-secondary">{title}</p>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: EvidenceReference[] }) {
  if (evidence.length === 0) return <EmptyState icon={FileSearch} title="No evidence for this conversation" />;
  return (
    <div className="divide-y divide-pc-border" aria-label="Cited source records">
      {evidence.map((reference) => (
        <article key={`${reference.answerMessageId}:${reference.citationLabel}:${reference.id}`} className="py-4 first:pt-0">
          <div className="flex min-w-0 items-start gap-2">
            <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-pc-border px-1 font-mono text-[11px] text-pc-accent-light">
              {reference.citationLabel}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium leading-5 text-pc-text">{reference.title}</p>
              <p className="mt-0.5 text-[11px] text-pc-text-muted">
                {reference.sourceId}{reference.occurredAt ? ` / ${reference.occurredAt}` : ''}
              </p>
            </div>
          </div>
          {reference.excerpt && (
            <p className="mt-2 line-clamp-4 break-words text-xs leading-5 text-pc-text-secondary">{reference.excerpt}</p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={`text-[10px] capitalize ${reference.connectorStatus === 'complete' ? 'text-emerald-400' : reference.connectorStatus === 'partial' ? 'text-amber-400' : 'text-red-400'}`}>
              {reference.connectorStatus}
            </span>
            {reference.deepLink && (
              <a
                href={reference.deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-pc-accent-light hover:bg-[var(--pc-hover)]"
              >
                <ExternalLink size={13} />
                Open in source
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function EvidencePanel({ open, scope, workspaceLabel, evidence, loading, onRefresh, onClose }: {
  open: boolean;
  scope: WorkspaceSessionScope;
  workspaceLabel: string;
  evidence: EvidenceReference[];
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<EvidenceTab>('evidence');
  if (!open) return null;

  return (
    <>
      <button className="fixed inset-0 z-50 bg-black/60 xl:hidden" onClick={onClose} aria-label="Close evidence" />
      <aside className="fixed inset-0 z-[60] flex min-w-0 flex-col border-l border-pc-border bg-[var(--pc-bg-base)] md:left-auto md:w-96 xl:static xl:z-auto xl:w-80 xl:shrink-0" aria-label="Evidence panel">
        <div className="h-14 shrink-0 flex items-center gap-2 border-b border-pc-border px-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-pc-text">Session context</h2>
            <p className="truncate text-[11px] text-pc-text-muted">{workspaceLabel} / {scope.mode === 'query' ? 'Query' : 'Action'}</p>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className="h-8 w-8 flex items-center justify-center rounded-md text-pc-text-muted hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:opacity-50" aria-label="Refresh evidence" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-pc-text-muted hover:bg-[var(--pc-hover)] hover:text-pc-text" aria-label="Close evidence" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 border-b border-pc-border">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`h-11 flex items-center justify-center gap-1.5 border-b-2 text-[11px] transition-colors ${tab === id ? 'border-pc-accent text-pc-accent-light' : 'border-transparent text-pc-text-muted hover:text-pc-text'}`} aria-pressed={tab === id}>
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'evidence' && (loading && evidence.length === 0
            ? <EmptyState icon={RefreshCw} title="Loading evidence" />
            : <EvidenceList evidence={evidence} />)}
          {tab === 'activity' && (evidence.length === 0
            ? <EmptyState icon={Activity} title="No source activity" />
            : (
              <div className="divide-y divide-pc-border">
                {evidence.map((reference) => (
                  <div key={`activity:${reference.answerMessageId}:${reference.citationLabel}:${reference.id}`} className="py-3 first:pt-0">
                    <p className="text-xs font-medium text-pc-text-secondary">Read {reference.sourceId}</p>
                    <p className="mt-1 text-[11px] text-pc-text-muted">{reference.capturedAt}</p>
                  </div>
                ))}
              </div>
            ))}
          {tab === 'proposals' && <EmptyState icon={ListChecks} title="No proposed actions" />}
        </div>
      </aside>
    </>
  );
}
