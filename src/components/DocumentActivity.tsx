import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { JsonPayload } from '../lib/kinGateway';

interface Activity {
  task: { id: string; state: string; attempt: number; pipeline: string };
  executor: string; worker: string; model: string | null;
  context: { documentId: string; receiptId: string; bytes: number };
  events: Array<{ id: number; state: string; attempt: number; kind: string; error_code: string | null; created_at: string }>;
  truncated: boolean;
}

export function DocumentActivity({ send, workspace, jobId, name, onClose }: {
  send: (method: string, params: JsonPayload) => Promise<JsonPayload>;
  workspace: string; jobId: string; name: string; onClose: () => void;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await send('processing.activity', { workspaceId: workspace, jobId });
        if (!disposed) { setData(result as unknown as Activity); setError(null); }
      } catch {
        if (!disposed) { setData(null); setError('Task activity unavailable.'); }
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, [send, workspace, jobId]);
  const rows = data ? [
    ['Task', data.task.id], ['Stage', data.task.state], ['Attempt', `${data.task.attempt}/3`],
    ['Executor', data.executor], ['Worker', data.worker], ['Model', data.model ?? 'Not applicable (PDF parser)'],
    ['Privacy', 'Local only'], ['Input', `Verified original PDF, ${data.context.bytes.toLocaleString()} bytes`],
    ['Document', data.context.documentId], ['Receipt', data.context.receiptId],
    ['LLM context', 'Not applicable (PDF bytes, no LLM prompt)'], ['Profile', data.task.pipeline],
  ] : [];
  return <aside aria-label="Private task inspector" className="min-w-0 border-t border-pc-border pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
    <div className="mb-3 flex items-start gap-3">
      <h2 className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{name}</h2>
      <button title="Close task inspector" aria-label="Close task inspector" className="shrink-0 rounded border border-pc-border p-2" onClick={onClose}><X size={15} /></button>
    </div>
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    {!data && !error && <p className="text-xs text-pc-text-muted">Loading task activity...</p>}
    {data && <>
      <dl className="space-y-2 text-xs">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(90px,1fr)_minmax(0,3fr)] gap-3">
        <dt className="text-pc-text-muted">{label}</dt><dd className="[overflow-wrap:anywhere]">{value}</dd>
      </div>)}</dl>
      <h3 className="mb-2 mt-5 text-sm font-medium">Activity</h3>
      {data.truncated && <p className="mb-2 text-xs text-amber-400">Latest 200 transitions</p>}
      <ol className="space-y-2 text-xs">{data.events.map(event => <li key={event.id} className="border-t border-pc-border pt-2">
        <span>{event.state} / Attempt {event.attempt}</span>
        {event.kind === 'snapshot' && <span className="ml-2 text-amber-400">Migration snapshot</span>}
        <time className="mt-1 block text-pc-text-muted">{event.created_at} UTC</time>
        {event.error_code && <span className="mt-1 block text-amber-400">{event.error_code}</span>}
      </li>)}</ol>
    </>}
  </aside>;
}
