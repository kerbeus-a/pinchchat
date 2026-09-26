import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Pause, Play, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';
import type { JsonPayload } from '../lib/kinGateway';
import { genIdempotencyKey } from '../lib/utils';

type Send = (method: string, params: JsonPayload) => Promise<JsonPayload>;
type JobState = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'parsed';
interface Job { id: string; state: JobState; attempt: number; revision: number; error_code: string | null }
interface Document { documentId: string; receiptId: string; name: string; bytes: number; receivedAt: string; job: Job | null }
interface Listing { documents: Document[]; nextCursor: number | null; capabilities: {
  intakeEnabled: boolean; processingEnabled: boolean; halted: boolean; extractionEnabled: boolean;
} }
const LABELS = { received: 'Received', queued: 'Queued', running: 'Parsing', paused: 'Paused', cancelled: 'Cancelled', failed: 'Failed', parsed: 'Parsed' };
const ERROR_LABELS: Record<string, string> = {
  cancelled: 'Parsing stopped', timeout: 'Parser timed out', unavailable: 'Local parser unavailable',
  response_limit: 'Parser response too large', invalid_response: 'Parser response invalid', conversion_failed: 'Conversion failed',
  invalid_pdf: 'PDF could not be read', original_unavailable: 'Original failed its integrity check',
  storage_unavailable: 'Storage reserve unavailable', access_revoked: 'Access revoked', invalid_result: 'Result could not be accepted',
  processing_failed: 'Processing failed', lease_expired: 'Previous worker lease expired', interrupted: 'Interrupted; waiting to resume',
};
const buttonClass = 'shrink-0 rounded border border-pc-border p-2 hover:bg-[var(--pc-hover)] disabled:opacity-40 disabled:cursor-not-allowed';
const timestamp = (value: string) => new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleString();

export function ProcessingView({ send, accessAvailable, workspaces }: {
  send: Send; accessAvailable: boolean; workspaces: Array<{ id: string; label: string }>;
}) {
  const [workspace, setWorkspace] = useState('home');
  const [busy, setBusy] = useState(false);
  if (!accessAvailable) return <p className="p-4 text-sm text-pc-text-muted">Document processing is available to the owner.</p>;
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Document processing">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-pc-border p-4">
      <h1 className="text-lg font-semibold">Processing</h1>
      <label className="flex items-center gap-2 text-xs text-pc-text-muted">Workspace
        <select aria-label="Processing workspace" disabled={busy} value={workspace} onChange={e => setWorkspace(e.target.value)}
          className="max-w-48 rounded border border-pc-border bg-[var(--pc-bg-surface)] p-2 text-pc-text">
          {!workspaces.some(w => w.id === workspace) && <option value={workspace}>{workspace === 'home' ? 'Home' : workspace}</option>}
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </label>
    </header>
    <WorkspaceProcessing key={workspace} workspace={workspace} send={send} onBusy={setBusy} />
  </section>;
}

function WorkspaceProcessing({ workspace, send, onBusy }: { workspace: string; send: Send; onBusy: (value: boolean) => void }) {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [pages, setPages] = useState<Array<number | null>>([]);
  const [upload, setUpload] = useState<{ file: File; requestId: string } | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string | null; truncated: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const mutation = useRef(false);
  const previewGeneration = useRef(0);
  const reportError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : 'Document operation failed.');
    if (e instanceof Error && e.name === 'AuthError') {
      setData(null); setPreview(null); setUpload(null); previewGeneration.current++;
    }
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const current = generation.current;
    pending.current = true; setLoading(true);
    try {
      const next = await send('processing.list', { workspaceId: workspace, before: cursor });
      if (current === generation.current) setData(next as unknown as Listing);
    } catch (e) {
      if (current === generation.current) reportError(e);
    } finally { if (current === generation.current) { pending.current = false; setLoading(false); } }
  }, [send, workspace, cursor, reportError]);
  const invalidateRequests = useCallback(() => {
    generation.current++; pending.current = false; previewGeneration.current++;
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => { void refresh(); }, 3000);
    return () => { clearTimeout(initial); clearInterval(interval); invalidateRequests(); };
  }, [refresh, invalidateRequests]);

  const canRun = Boolean(data?.capabilities.processingEnabled && !data.capabilities.halted);
  const canUpload = canRun && data?.capabilities.intakeEnabled;
  const perform = async (work: () => Promise<void>) => {
    if (mutation.current) return;
    const current = generation.current;
    mutation.current = true; setBusy(true); onBusy(true); setError(null);
    try { await work(); }
    catch (e) { if (current === generation.current) reportError(e); }
    finally {
      mutation.current = false;
      if (current === generation.current) { setBusy(false); onBusy(false); await refresh(); }
    }
  };
  const processUpload = () => {
    if (!upload || !canUpload) return;
    const selected = upload;
    void perform(async () => {
      const received = await send('processing.upload', { workspaceId: workspace, file: selected.file, requestId: selected.requestId });
      const receipt = received.receipt as { id: string };
      await send('processing.enqueue', { workspaceId: workspace, receiptId: receipt.id });
      setUpload(null);
    });
  };
  const actOn = (doc: Document, action: 'pause' | 'resume' | 'cancel' | 'retry' | 'enqueue') => void perform(async () => {
    await send(action === 'enqueue' ? 'processing.enqueue' : 'processing.control', {
      workspaceId: workspace, receiptId: doc.receiptId, jobId: doc.job?.id, revision: doc.job?.revision, action,
    });
  });
  const openPreview = async (doc: Document) => {
    const current = ++previewGeneration.current;
    setPreview({ name: doc.name, text: null, truncated: false });
    try {
      const value = await send('processing.preview', { workspaceId: workspace, jobId: doc.job!.id });
      if (current === previewGeneration.current) setPreview({ name: doc.name, text: String(value.markdown), truncated: value.truncated === true });
    } catch (e) {
      if (current === previewGeneration.current) { setPreview(null); reportError(e); }
    }
  };
  const changePage = (next: number | null) => { setData(null); setCursor(next); setPreview(null); };

  return <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Processing records">
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="Choose PDF" disabled={!canUpload || busy}
        onChange={e => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (!file) return;
          if (!/\.pdf$/i.test(file.name) || file.size < 1 || file.size > 50 * 1024 ** 2) { setError('Choose a PDF of up to 50 MiB.'); return; }
          setUpload({ file, requestId: genIdempotencyKey() }); setError(null);
        }} />
      <button className={buttonClass} disabled={!canUpload || busy} aria-label="Choose PDF" title="Choose PDF" onClick={() => fileInput.current?.click()}><Upload size={17} /></button>
      {upload && <>
        <span className="max-w-full min-w-0 text-xs [overflow-wrap:anywhere]">{upload.file.name}</span>
        <button className={`${buttonClass} flex items-center gap-2 text-xs`} disabled={!canUpload || busy} onClick={processUpload}><Play size={15} />Process as record</button>
        <button className={buttonClass} disabled={busy} title="Clear selected file" aria-label="Clear selected file" onClick={() => setUpload(null)}><X size={15} /></button>
      </>}
      <button className={`${buttonClass} ml-auto`} title="Refresh documents" aria-label="Refresh documents" disabled={loading || busy} onClick={() => { setError(null); void refresh(); }}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
    </div>
    {data?.capabilities.halted && <p role="status" className="mb-3 text-sm text-amber-400">Kin emergency stop is active.</p>}
    {data && !data.capabilities.processingEnabled && <p role="status" className="mb-3 text-sm text-amber-400">Document processing is not enabled.</p>}
    {data?.capabilities.processingEnabled && !data.capabilities.intakeEnabled && <p role="status" className="mb-3 text-sm text-amber-400">New document intake is disabled.</p>}
    {error && <p role="alert" className="mb-3 text-sm text-red-400 [overflow-wrap:anywhere]">{error}</p>}
    {busy && <p role="status" className="mb-3 text-xs text-pc-text-muted">Saving request...</p>}
    {!data && <p className="text-sm text-pc-text-muted">{loading ? 'Loading documents...' : 'No readings available.'}</p>}
    <div className={`grid min-w-0 gap-6 ${preview ? 'xl:grid-cols-2' : ''}`}>
      <div className="min-w-0">
        {data?.documents.length === 0 && <p className="border-y border-pc-border py-6 text-sm text-pc-text-muted">No documents in this workspace.</p>}
        {data?.documents.map(doc => {
          const state = doc.job?.state ?? 'received';
          return <article key={doc.documentId} className="min-w-0 border-b border-pc-border py-3" aria-label={doc.name}>
            <h2 className="mb-2 text-sm font-medium [overflow-wrap:anywhere]">{doc.name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={state === 'failed' ? 'text-red-400' : state === 'parsed' ? 'text-emerald-400' : 'text-pc-text'}>{LABELS[state]}</span>
              <span className="text-pc-text-muted">{Math.ceil(doc.bytes / 1024)} KiB</span>
              <time className="text-pc-text-muted">{timestamp(doc.receivedAt)}</time>
              {doc.job && <span className="text-pc-text-muted">Attempt {doc.job.attempt}/3</span>}
            </div>
            {doc.job?.error_code && <p className="mt-2 text-xs text-amber-400">{ERROR_LABELS[doc.job.error_code] ?? 'Processing requires attention'}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {state === 'received' && <button className={buttonClass} disabled={!canRun || busy} title="Parse document" aria-label={`Parse ${doc.name}`} onClick={() => actOn(doc, 'enqueue')}><Play size={15} /></button>}
              {['queued', 'running'].includes(state) && <button className={buttonClass} disabled={busy} title="Pause" aria-label={`Pause ${doc.name}`} onClick={() => actOn(doc, 'pause')}><Pause size={15} /></button>}
              {state === 'paused' && <button className={buttonClass} disabled={!canRun || busy || doc.job!.attempt >= 3} title="Resume" aria-label={`Resume ${doc.name}`} onClick={() => actOn(doc, 'resume')}><Play size={15} /></button>}
              {['failed', 'cancelled'].includes(state) && <button className={buttonClass} disabled={!canRun || busy || doc.job!.attempt >= 3} title="Retry" aria-label={`Retry ${doc.name}`} onClick={() => actOn(doc, 'retry')}><RotateCcw size={15} /></button>}
              {['queued', 'running', 'paused'].includes(state) && <button className={buttonClass} disabled={busy} title="Cancel processing" aria-label={`Cancel ${doc.name}`} onClick={() => actOn(doc, 'cancel')}><X size={15} /></button>}
              {state === 'parsed' && <button className={buttonClass} title="View parsed text" aria-label={`Preview ${doc.name}`} onClick={() => void openPreview(doc)}><FileText size={15} /></button>}
            </div>
          </article>;
        })}
        {(pages.length > 0 || data?.nextCursor != null) && <div className="mt-4 flex items-center gap-2 text-xs">
          <button className={buttonClass} disabled={busy || loading || pages.length === 0} title="Newer documents" aria-label="Newer documents" onClick={() => { const next = pages.at(-1)!; setPages(pages.slice(0, -1)); changePage(next); }}><ChevronLeft size={16} /></button>
          <span>Page {pages.length + 1}</span>
          <button className={buttonClass} disabled={busy || loading || data?.nextCursor == null} title="Older documents" aria-label="Older documents" onClick={() => { setPages([...pages, cursor]); changePage(data!.nextCursor); }}><ChevronRight size={16} /></button>
        </div>}
      </div>
      {preview && <aside className="min-w-0 border-t border-pc-border pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" aria-label="Parsed text preview">
        <div className="mb-2 flex items-start gap-3"><h2 className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{preview.name}</h2>
          <button className={buttonClass} title="Close preview" aria-label="Close preview" onClick={() => { previewGeneration.current++; setPreview(null); }}><X size={15} /></button></div>
        <p className="mb-3 text-xs text-amber-400">Parsed text. Financial extraction not enabled.</p>
        {preview.truncated && <p className="mb-2 text-xs text-amber-400">Preview limited to 200,000 characters.</p>}
        <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed [overflow-wrap:anywhere]">{preview.text ?? 'Loading parsed text...'}</pre>
      </aside>}
    </div>
  </div>;
}
