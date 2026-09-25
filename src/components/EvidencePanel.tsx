import { Activity, ExternalLink, FileSearch, Layers3, ListChecks, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { EvidenceReference, SourceConnection, WorkspaceSessionScope } from '../lib/commandCenter';
import { sessionDisplayName } from '../lib/sessionName';
import type { Session } from '../types';

type EvidenceTab = 'context' | 'evidence' | 'activity' | 'proposals';

const TABS: Array<{ id: EvidenceTab; label: string; icon: typeof FileSearch }> = [
  { id: 'context', label: 'Context', icon: Layers3 },
  { id: 'evidence', label: 'Evidence', icon: FileSearch },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'proposals', label: 'Proposals', icon: ListChecks },
];

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function channelLabel(channel?: string): string {
  if (!channel) return 'Not reported';
  if (/^group topic\b/i.test(channel)) return 'Telegram topic';
  if (channel.toLowerCase() === 'dm') return 'Direct chat';
  if (channel.toLowerCase() === 'web') return 'Web chat';
  return channel;
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-pc-border py-3 last:border-b-0">
      <dt className="text-[11px] text-pc-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-xs leading-5 text-pc-text-secondary">{children}</dd>
    </div>
  );
}

function ContextView({ session, scope, workspaceLabel, sources }: {
  session?: Session;
  scope: WorkspaceSessionScope;
  workspaceLabel: string;
  sources: SourceConnection[];
}) {
  const enabledSources = sources.filter((source) => source.enabled);
  const scopedSources = scope.sourceIds.length === 0
    ? enabledSources
    : enabledSources.filter((source) => scope.sourceIds.includes(source.id));
  const usedTokens = session?.totalTokens;
  const contextWindow = session?.contextTokens;
  const contextPercent = usedTokens !== undefined && contextWindow !== undefined && contextWindow > 0
    ? Math.min(100, Math.round((usedTokens / contextWindow) * 100))
    : null;

  return (
    <div aria-label="Session context details">
      <dl>
        <ContextRow label="Conversation">
          {session ? sessionDisplayName(session) : 'Current conversation'}
        </ContextRow>
        <ContextRow label="Channel">{channelLabel(session?.channel)}</ContextRow>
        <ContextRow label="Workspace">{workspaceLabel}</ContextRow>
        <ContextRow label="Mode">{scope.mode === 'query' ? 'Query' : 'Action'}</ContextRow>
        <ContextRow label="Agent">{session?.agentId || 'Main agent'}</ContextRow>
        <ContextRow label="Model">{session?.model || 'Not reported by runner'}</ContextRow>
        <ContextRow label="Messages">
          {session?.messageCount !== undefined ? formatTokens(session.messageCount) : 'Not reported'}
        </ContextRow>
        <ContextRow label="Context use">
          {usedTokens !== undefined && contextWindow !== undefined && contextPercent !== null ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span>{formatTokens(usedTokens)} / {formatTokens(contextWindow)} tokens</span>
                <span className="text-pc-text-muted">{contextPercent}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-[var(--pc-bg-elevated)]">
                <div className="h-full bg-pc-accent" style={{ width: `${contextPercent}%` }} />
              </div>
            </div>
          ) : 'Not reported by runner'}
        </ContextRow>
        <ContextRow label="Sources">
          {scopedSources.length > 0 ? (
            <div className="space-y-1.5">
              {scopedSources.map((source) => (
                <div key={source.id} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{source.displayName}</span>
                  <span className={`shrink-0 text-[10px] capitalize ${source.health.status === 'healthy' ? 'text-emerald-400' : source.health.status === 'offline' ? 'text-red-400' : 'text-amber-400'}`}>
                    {source.health.status}
                  </span>
                </div>
              ))}
            </div>
          ) : 'No connected sources'}
        </ContextRow>
      </dl>
    </div>
  );
}

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

export function EvidencePanel({ open, session, scope, workspaceLabel, sources, evidence, loading, onRefresh, onClose }: {
  open: boolean;
  session?: Session;
  scope: WorkspaceSessionScope;
  workspaceLabel: string;
  sources: SourceConnection[];
  evidence: EvidenceReference[];
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<EvidenceTab>('context');
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
        <div className="grid grid-cols-4 border-b border-pc-border">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`h-11 flex items-center justify-center gap-1.5 border-b-2 text-[11px] transition-colors ${tab === id ? 'border-pc-accent text-pc-accent-light' : 'border-transparent text-pc-text-muted hover:text-pc-text'}`} aria-pressed={tab === id}>
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'context' && <ContextView session={session} scope={scope} workspaceLabel={workspaceLabel} sources={sources} />}
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
