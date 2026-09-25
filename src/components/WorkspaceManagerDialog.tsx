import { Plus, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorkspaceDefinition } from '../lib/commandCenter';

interface Draft {
  label: string;
  description: string;
}

export function WorkspaceManagerDialog({ open, workspaces, onClose, onCreate, onUpdate }: {
  open: boolean;
  workspaces: WorkspaceDefinition[];
  onClose: () => void;
  onCreate: (input: Draft) => Promise<unknown>;
  onUpdate: (workspaceId: string, input: Draft) => Promise<unknown>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newWorkspace, setNewWorkspace] = useState<Draft>({ label: '', description: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrafts(Object.fromEntries(workspaces.map((workspace) => [workspace.id, {
      label: workspace.label,
      description: workspace.description,
    }])));
    setError(null);
  }, [open, workspaces]);

  if (!open) return null;

  const save = async (workspace: WorkspaceDefinition) => {
    const draft = drafts[workspace.id];
    if (!draft?.label.trim()) return;
    setBusyId(workspace.id);
    setError(null);
    try {
      await onUpdate(workspace.id, { label: draft.label.trim(), description: draft.description.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update workspace');
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (!newWorkspace.label.trim()) return;
    setBusyId('new');
    setError(null);
    try {
      await onCreate({ label: newWorkspace.label.trim(), description: newWorkspace.description.trim() });
      setNewWorkspace({ label: '', description: '' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add workspace');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button type="button" className="fixed inset-0 z-[80] bg-black/70" onClick={onClose} aria-label="Close workspace manager" />
      <section className="fixed inset-x-3 top-1/2 z-[90] mx-auto max-h-[86vh] max-w-2xl -translate-y-1/2 overflow-hidden rounded-md border border-pc-border bg-[var(--pc-bg-base)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title">
        <header className="flex h-14 items-center gap-3 border-b border-pc-border px-4">
          <h2 id="workspace-manager-title" className="min-w-0 flex-1 text-sm font-semibold text-pc-text">Manage workspaces</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-pc-text-muted hover:bg-[var(--pc-hover)] hover:text-pc-text" aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[calc(86vh-3.5rem)] overflow-y-auto p-4">
          {error && <p className="mb-3 border-b border-red-400/30 pb-3 text-xs text-red-400">{error}</p>}
          <div className="divide-y divide-pc-border">
            {workspaces.map((workspace) => {
              const draft = drafts[workspace.id] ?? { label: workspace.label, description: workspace.description };
              const changed = draft.label.trim() !== workspace.label || draft.description.trim() !== workspace.description;
              return (
                <div key={workspace.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(140px,0.7fr)_minmax(180px,1.3fr)_36px] sm:items-center">
                  <input
                    value={draft.label}
                    onChange={(event) => setDrafts((current) => ({ ...current, [workspace.id]: { ...draft, label: event.target.value } }))}
                    className="h-9 min-w-0 rounded-md border border-pc-border bg-[var(--pc-bg-input)] px-2.5 text-sm text-pc-text outline-none focus:border-pc-accent"
                    aria-label={`${workspace.label} name`}
                    maxLength={80}
                  />
                  <input
                    value={draft.description}
                    onChange={(event) => setDrafts((current) => ({ ...current, [workspace.id]: { ...draft, description: event.target.value } }))}
                    className="h-9 min-w-0 rounded-md border border-pc-border bg-[var(--pc-bg-input)] px-2.5 text-xs text-pc-text-secondary outline-none focus:border-pc-accent"
                    aria-label={`${workspace.label} description`}
                    placeholder="Description"
                    maxLength={240}
                  />
                  <button type="button" onClick={() => { void save(workspace); }} disabled={!changed || !draft.label.trim() || busyId !== null} className="flex h-9 w-9 items-center justify-center rounded-md border border-pc-border text-pc-text-muted hover:text-pc-text disabled:opacity-30" aria-label={`Save ${workspace.label}`} title="Save">
                    <Save size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 border-t border-pc-border pt-4">
            <h3 className="mb-3 text-xs font-medium text-pc-text-secondary">Add workspace</h3>
            <div className="grid gap-2 sm:grid-cols-[minmax(140px,0.7fr)_minmax(180px,1.3fr)_36px] sm:items-center">
              <input value={newWorkspace.label} onChange={(event) => setNewWorkspace((current) => ({ ...current, label: event.target.value }))} className="h-9 min-w-0 rounded-md border border-pc-border bg-[var(--pc-bg-input)] px-2.5 text-sm text-pc-text outline-none focus:border-pc-accent" aria-label="New workspace name" placeholder="Workspace name" maxLength={80} />
              <input value={newWorkspace.description} onChange={(event) => setNewWorkspace((current) => ({ ...current, description: event.target.value }))} className="h-9 min-w-0 rounded-md border border-pc-border bg-[var(--pc-bg-input)] px-2.5 text-xs text-pc-text-secondary outline-none focus:border-pc-accent" aria-label="New workspace description" placeholder="Description" maxLength={240} />
              <button type="button" onClick={() => { void create(); }} disabled={!newWorkspace.label.trim() || busyId !== null} className="flex h-9 w-9 items-center justify-center rounded-md border border-pc-accent text-pc-accent-light hover:bg-[var(--pc-accent-glow)] disabled:opacity-30" aria-label="Add workspace" title="Add workspace">
                <Plus size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
