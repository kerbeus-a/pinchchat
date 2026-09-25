import { Activity, FileSearch, ListChecks, X } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceSessionScope } from '../lib/commandCenter';

type EvidenceTab = 'evidence' | 'activity' | 'proposals';

const TABS: Array<{ id: EvidenceTab; label: string; icon: typeof FileSearch }> = [
  { id: 'evidence', label: 'Evidence', icon: FileSearch },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'proposals', label: 'Proposals', icon: ListChecks },
];

const EMPTY: Record<EvidenceTab, { title: string; detail: string }> = {
  evidence: { title: 'No evidence yet', detail: 'Citations from source-backed answers will appear here.' },
  activity: { title: 'No retrieval activity', detail: 'This session has not searched a connected source.' },
  proposals: { title: 'No proposed actions', detail: 'Action-mode proposals will wait here for review.' },
};

export function EvidencePanel({ open, scope, workspaceLabel, onClose }: {
  open: boolean;
  scope: WorkspaceSessionScope;
  workspaceLabel: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<EvidenceTab>('evidence');
  if (!open) return null;
  const empty = EMPTY[tab];

  return (
    <>
      <button className="fixed inset-0 z-50 bg-black/60 xl:hidden" onClick={onClose} aria-label="Close evidence" />
      <aside className="fixed inset-0 z-[60] flex min-w-0 flex-col border-l border-pc-border bg-[var(--pc-bg-base)] md:left-auto md:w-96 xl:static xl:z-auto xl:w-80 xl:shrink-0" aria-label="Evidence panel">
        <div className="h-14 shrink-0 flex items-center gap-2 border-b border-pc-border px-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-pc-text">Session context</h2>
            <p className="truncate text-[11px] text-pc-text-muted">{workspaceLabel} / {scope.mode === 'query' ? 'Query' : 'Action'}</p>
          </div>
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
          <div className="min-h-48 flex flex-col items-center justify-center text-center">
            <FileSearch size={24} className="mb-3 text-pc-text-faint" />
            <p className="text-sm font-medium text-pc-text-secondary">{empty.title}</p>
            <p className="mt-1 max-w-56 text-xs leading-5 text-pc-text-muted">{empty.detail}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
