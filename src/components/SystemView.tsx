import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { JsonPayload } from '../lib/kinGateway';

interface Service {
  id: string; name: string; reachable: boolean;
  readiness: 'ready' | 'not_integrated' | 'unavailable' | 'unknown';
  detail: string; checkedAt: string; lastSuccessAt: string | null; applicationUrl?: string;
}
interface Status {
  checkedAt: string; staleAfterMs: number; services: Service[];
  storage: Array<{ id: string; path: string; mounted: boolean; freeBytes: number | null; totalBytes: number | null; state: string; detail: string }>;
  localInference: { inFlight: number; waiting: number };
  documentProcessing: { readiness: string; queueDepth: number | null; lastSuccessAt: string | null };
  backup: { sameDiskSnapshotAt: string | null; independentCopy: string; restoreVerified: string; detail: string };
}
const LABELS = { ready: 'Ready', not_integrated: 'Not connected to Kin', unavailable: 'Unavailable', unknown: 'Unknown' };
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not observed';
const capacity = (value: number | null) => value === null ? 'Unknown' : `${(value / 1024 ** 3).toFixed(1)} GiB`;

export function SystemView({ send, accessAvailable }: {
  send: (method: string, params: JsonPayload) => Promise<JsonPayload>;
  accessAvailable: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!accessAvailable || pending.current) return;
    const current = generation.current;
    pending.current = true;
    setLoading(true);
    try {
      const result = await send('system.status', {});
      if (current === generation.current) { setStatus(result as unknown as Status); setError(null); }
    } catch {
      if (current === generation.current) setError('System check failed. Previous readings may be out of date.');
    } finally {
      if (current === generation.current) { pending.current = false; setLoading(false); setNow(Date.now()); }
    }
  }, [send, accessAvailable]);

  useEffect(() => {
    const current = generation.current;
    const id = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => { void refresh(); }, 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => { window.clearTimeout(id); window.clearInterval(poll); window.clearInterval(clock); generation.current = current + 1; pending.current = false; };
  }, [refresh]);

  if (!accessAvailable) return <div className="p-4 text-sm text-pc-text-muted">System status is available to the owner.</div>;
  const stale = status !== null && now - Date.parse(status.checkedAt) >= status.staleAfterMs;
  return <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-label="System status">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-lg font-semibold">System</h1><p className="text-xs text-pc-text-muted">Last check: {timestamp(status?.checkedAt ?? null)}</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh system status" title="Refresh system status"
        className="rounded border border-pc-border p-2 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
    </header>
    {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
    {stale && <p role="status" className="mb-3 text-sm text-amber-400">Stale readings. Service readiness is not currently confirmed.</p>}
    {!status && <p className="text-sm text-pc-text-muted">{loading ? 'Checking services...' : 'No readings available.'}</p>}
    {status && <>
      <h2 className="mb-2 text-sm font-semibold">Services</h2>
      <div className="divide-y divide-pc-border border-y border-pc-border">
        {status.services.map(service => <article key={service.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(120px,1fr)_minmax(0,3fr)]">
          <div className="flex items-start gap-2 text-sm font-medium"><span>{service.name}</span>{service.applicationUrl &&
            <a href={service.applicationUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${service.name}`} title={`Open ${service.name}`} className="shrink-0 text-pc-accent-light"><ExternalLink size={15} /></a>}</div>
          <div className="min-w-0 text-xs [overflow-wrap:anywhere]">
            <p className="mb-1 flex flex-wrap gap-x-3 gap-y-1"><span className={stale ? 'text-amber-400' : service.reachable ? 'text-pc-text' : 'text-red-400'}>{stale ? 'Reachability stale' : service.reachable ? 'Reachable' : 'Unreachable'}</span>
              <span className={stale || service.readiness !== 'ready' ? 'text-amber-400' : 'text-emerald-400'}>{stale ? 'Readiness stale' : LABELS[service.readiness]}</span></p>
            <p className="text-pc-text-muted">{service.detail}</p>
            <p className="mt-1 text-pc-text-muted">Last successful check: {timestamp(service.lastSuccessAt)}</p>
          </div>
        </article>)}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Storage</h2>
      <div className="divide-y divide-pc-border border-y border-pc-border">
        {status.storage.map(disk => <div key={disk.id} className="py-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2"><strong className="font-medium">{disk.id === 'system' ? 'System disk' : 'Archive disk'} <span className="text-pc-text-muted">{disk.path}</span></strong><span>{capacity(disk.freeBytes)} free / {capacity(disk.totalBytes)}</span></div>
          <p className={`mt-1 ${disk.state === 'ok' ? 'text-pc-text-muted' : 'text-amber-400'}`}>{stale ? 'Previous reading: ' : ''}{disk.detail}</p>
        </div>)}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Processing</h2>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-xs">
        <dt>Local inference running</dt><dd>{status.localInference.inFlight}</dd>
        <dt>Local inference waiting</dt><dd>{status.localInference.waiting}</dd>
        <dt>Document intake</dt><dd>Not enabled</dd>
        <dt>Document queue</dt><dd>{status.documentProcessing.queueDepth ?? 'Not available'}</dd>
        <dt>Last processed document</dt><dd>{timestamp(status.documentProcessing.lastSuccessAt)}</dd>
      </dl>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Backups</h2>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs">
        <dt>Same-disk snapshot files</dt><dd className="text-right">{timestamp(status.backup.sameDiskSnapshotAt)}</dd>
        <dt>Independent copy</dt><dd className="text-right text-amber-400">Not verified</dd>
        <dt>Full restore</dt><dd className="text-right text-amber-400">Not verified</dd>
      </dl>
      <p className="mt-2 text-xs text-pc-text-muted">{status.backup.detail}</p>
    </>}
  </section>;
}
