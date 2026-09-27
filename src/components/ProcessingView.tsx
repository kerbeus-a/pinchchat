import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Download, FileText, Pause, Play, RefreshCw, RotateCcw, ScanText, Search, Upload, X } from 'lucide-react';
import { DocumentActivity } from './DocumentActivity';
import { ExtractionInspector } from './ExtractionInspector';
import { DocumentRelationEditor } from './DocumentRelationEditor';
import type { JsonPayload } from '../lib/kinGateway';
import { genIdempotencyKey } from '../lib/utils';

type Send = (method: string, params: JsonPayload) => Promise<JsonPayload>;
type JobState = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'parsed';
interface Job { id: string; state: JobState; attempt: number; revision: number; error_code: string | null }
interface Document { documentId: string; receiptId: string; name: string; bytes: number; receivedAt: string; job: Job | null; extraction?: { id: string; state: string; reviewStatus?: string|null } | null;
  fields?:Record<string,{value:string|null;checked:boolean;ownerCorrected?:boolean}>;
  possibleDuplicates?:Array<{documentId:string;name:string;extractionId:string;kind:string;relation?:{decision:string}|null}> }
interface Listing { documents: Document[]; nextCursor: number | null; capabilities: {
  intakeEnabled: boolean; processingEnabled: boolean; halted: boolean; extractionEnabled: boolean; syntheticPreview?: boolean;
}; coverage?:{received:number;extracted:number;reviewed:number;partial:boolean;checkedAt:string} }
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
  const [upload, setUpload] = useState<Array<{ file: File; requestId: string }>>([]);
  const [uploadProgress,setUploadProgress] = useState<string|null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string | null; truncated: boolean } | null>(null);
  const [activity, setActivity] = useState<{ jobId: string; name: string } | null>(null);
  const [extraction, setExtraction] = useState<{ jobId: string; name: string } | null>(null);
  const [relation,setRelation]=useState<{jobId:string;otherJobId:string;name:string;otherName:string}|null>(null);
  const [reasoning, setReasoning] = useState('medium');
  const [view, setView] = useState('all');
  const [query,setQuery] = useState('');
  const [queryDraft,setQueryDraft] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const mutation = useRef(false);
  const previewGeneration = useRef(0);
  const reportError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : 'Document operation failed.');
    if (e instanceof Error && e.name === 'AuthError') {
      setData(null); setPreview(null); setActivity(null); setExtraction(null); setRelation(null); setUpload([]); previewGeneration.current++;
    }
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const current = generation.current;
    pending.current = true; setLoading(true);
    try {
      const next = await send(query?'processing.catalogue':'processing.list', { workspaceId: workspace, before: cursor, ...(view !== 'all' ? {view} : {}),...(query?{query}:{}) });
      if (current === generation.current) setData(next as unknown as Listing);
    } catch (e) {
      if (current === generation.current) reportError(e);
    } finally { if (current === generation.current) { pending.current = false; setLoading(false); } }
  }, [send, workspace, cursor, view, query, reportError]);
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
    if (!upload.length || !canUpload) return;
    const selected = upload;
    void perform(async () => {
      try {
        for (const [index,item] of selected.entries()) {
          setUploadProgress(`Receiving ${index+1} of ${selected.length}: ${item.file.name}`);
          const received = await send('processing.upload', { workspaceId: workspace, file: item.file, requestId: item.requestId });
          const receipt = received.receipt as { id: string };
          await send('processing.enqueue', { workspaceId: workspace, receiptId: receipt.id });
          setUpload(current=>current.filter(pending=>pending.requestId!==item.requestId));
        }
      } finally {setUploadProgress(null);}
    });
  };
  const actOn = (doc: Document, action: 'pause' | 'resume' | 'cancel' | 'retry' | 'enqueue') => void perform(async () => {
    await send(action === 'enqueue' ? 'processing.enqueue' : 'processing.control', {
      workspaceId: workspace, receiptId: doc.receiptId, jobId: doc.job?.id, revision: doc.job?.revision, action,
    });
  });
  const openPreview = async (doc: Document) => {
    setActivity(null); setExtraction(null);setRelation(null);
    const current = ++previewGeneration.current;
    setPreview({ name: doc.name, text: null, truncated: false });
    try {
      const value = await send('processing.preview', { workspaceId: workspace, jobId: doc.job!.id });
      if (current === previewGeneration.current) setPreview({ name: doc.name, text: String(value.markdown), truncated: value.truncated === true });
    } catch (e) {
      if (current === previewGeneration.current) { setPreview(null); reportError(e); }
    }
  };
  const changePage = (next: number | null) => { previewGeneration.current++; setData(null); setCursor(next); setPreview(null); setActivity(null); setExtraction(null);setRelation(null); };

  return <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Processing records">
    <form className="mb-3 flex min-w-0 gap-2" onSubmit={event=>{event.preventDefault();invalidateRequests();setQuery(queryDraft.trim());setPages([]);changePage(null);}}>
      <input type="search" aria-label="Search document fields" placeholder="Supplier, invoice number or filename" maxLength={200} disabled={busy} value={queryDraft} onChange={event=>setQueryDraft(event.target.value)} className="min-w-0 flex-1 rounded border border-pc-border bg-transparent p-2 text-xs"/>
      <button type="submit" className={buttonClass} disabled={busy} title="Search documents" aria-label="Search documents"><Search size={16}/></button>
      {query&&<button type="button" className={buttonClass} disabled={busy} title="Clear search" aria-label="Clear search" onClick={()=>{invalidateRequests();setQuery('');setQueryDraft('');setPages([]);changePage(null);}}><X size={16}/></button>}
    </form>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {data?.capabilities.syntheticPreview && <span className="text-sm font-medium text-amber-400">Synthetic Preview</span>}
      <label className="flex items-center gap-2 text-xs">Status
        <select aria-label="Document status" disabled={busy} value={view} onChange={e=>{invalidateRequests();setView(e.target.value);setPages([]);changePage(null);}}
          className="rounded border border-pc-border bg-[var(--pc-bg-surface)] p-2">
          <option value="all">All records</option><option value="needs_decision">Needs your decision</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="deferred">Deferred</option>
        </select>
      </label>
      {data?.capabilities.extractionEnabled && <label className="flex items-center gap-2 text-xs">Reasoning
        <select aria-label="Extraction reasoning" value={reasoning} disabled={busy} onChange={e => setReasoning(e.target.value)} className="rounded border border-pc-border bg-[var(--pc-bg-surface)] p-2">
          <option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="xhigh">High</option>
        </select>
      </label>}
      <input ref={fileInput} type="file" multiple accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" className="hidden" aria-label="Choose documents" disabled={!canUpload || busy}
        onChange={e => {
          const files = Array.from(e.target.files??[]); e.target.value = '';
          if (!files.length) return;
          if (files.length>10) {setError('Choose up to 10 documents per batch.');return;}
          if (files.some(file=> !/\.(pdf|png|jpe?g)$/i.test(file.name) || file.size < 1 || file.size > 50 * 1024 ** 2)) { setError('Choose PDF, PNG or JPEG documents of up to 50 MiB each.'); return; }
          setUpload(files.map(file=>({file,requestId:genIdempotencyKey()}))); setError(null);
        }} />
      <button className={buttonClass} disabled={!canUpload || busy} aria-label="Choose documents" title="Choose documents" onClick={() => fileInput.current?.click()}><Upload size={17} /></button>
      {upload.length>0 && <>
        <span className="max-w-full min-w-0 text-xs [overflow-wrap:anywhere]">{upload.map(item=>item.file.name).join(', ')}</span>
        <button className={`${buttonClass} flex items-center gap-2 text-xs`} disabled={!canUpload || busy} onClick={processUpload}><Play size={15} />Process as record</button>
        <button className={buttonClass} disabled={busy} title="Clear selected file" aria-label="Clear selected file" onClick={() => setUpload([])}><X size={15} /></button>
      </>}
      <button className={`${buttonClass} ml-auto`} title="Refresh documents" aria-label="Refresh documents" disabled={loading || busy} onClick={() => { setError(null); void refresh(); }}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
    </div>
    {data?.capabilities.halted && <p role="status" className="mb-3 text-sm text-amber-400">Kin emergency stop is active.</p>}
    {data && !data.capabilities.processingEnabled && <p role="status" className="mb-3 text-sm text-amber-400">Document processing is not enabled.</p>}
    {data?.capabilities.processingEnabled && !data.capabilities.intakeEnabled && <p role="status" className="mb-3 text-sm text-amber-400">New document intake is disabled.</p>}
    {error && <p role="alert" className="mb-3 text-sm text-red-400 [overflow-wrap:anywhere]">{error}</p>}
    {busy && <p role="status" className="mb-3 text-xs text-pc-text-muted">Saving request...</p>}
    {uploadProgress && <p role="status" className="mb-3 text-xs [overflow-wrap:anywhere]">{uploadProgress}</p>}
    {data?.coverage&&<p className="mb-3 text-xs text-pc-text-muted">Uploaded documents: {data.coverage.received} received, {data.coverage.extracted} extracted, {data.coverage.reviewed} accepted.{data.coverage.partial?' Partial coverage; first 100 records only.':''} No mail or accounting sources included.</p>}
    {!data && <p className="text-sm text-pc-text-muted">{loading ? 'Loading documents...' : 'No readings available.'}</p>}
    <div className={`grid min-w-0 gap-6 ${preview || activity || extraction || relation ? 'xl:grid-cols-2' : ''}`}>
      <div className="min-w-0">
        {data?.documents.length === 0 && <p className="border-y border-pc-border py-6 text-sm text-pc-text-muted">{query?'No documents match this search.':view==='all'?'No documents in this workspace.':'No records match this status.'}</p>}
        {data?.documents.map(doc => {
          const state = doc.job?.state ?? 'received';
          return <article key={doc.documentId} className="min-w-0 border-b border-pc-border py-3" aria-label={doc.name}>
            <h2 className="mb-2 text-sm font-medium [overflow-wrap:anywhere]">{doc.name}</h2>
            {doc.fields&&<div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{['supplier','documentNumber','currency','total','dueDate'].map(key=>doc.fields?.[key]?.value&&<span key={key} className="[overflow-wrap:anywhere]">{doc.fields[key].value}{doc.fields[key].ownerCorrected?' (owner corrected)':!doc.fields[key].checked?' (unverified)':''}</span>)}</div>}
            {doc.possibleDuplicates?.map(peer=><div key={peer.documentId} className="mb-2 flex flex-wrap items-center gap-2 text-xs"><button className="max-w-full text-left text-amber-400 [overflow-wrap:anywhere]" onClick={()=>{previewGeneration.current++;setPreview(null);setActivity(null);setRelation(null);setExtraction({jobId:peer.extractionId,name:peer.name});}}>{peer.relation?(peer.relation.decision==='keep_separate'?'Kept separate':'Linked revision'):`Possible ${peer.kind==='same_fields'?'duplicate':'revision'}`}: {peer.name}</button><button className={buttonClass} title="Review document relationship" aria-label={`Review relationship with ${peer.name}`} onClick={()=>{previewGeneration.current++;setPreview(null);setActivity(null);setExtraction(null);setRelation({jobId:doc.extraction!.id,otherJobId:peer.extractionId,name:doc.name,otherName:peer.name});}}><Activity size={14}/></button></div>)}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={state === 'failed' ? 'text-red-400' : state === 'parsed' ? 'text-emerald-400' : 'text-pc-text'}>{LABELS[state]}</span>
              <span className="text-pc-text-muted">{Math.ceil(doc.bytes / 1024)} KiB</span>
              <time className="text-pc-text-muted">{timestamp(doc.receivedAt)}</time>
              {doc.job && <span className="text-pc-text-muted">Attempt {doc.job.attempt}/3</span>}
              {doc.extraction && <span className="text-pc-text-muted">{doc.extraction.state === 'ready' ? ({accepted:'Owner accepted',rejected:'Owner rejected',deferred:'Deferred',correction:'Corrected; awaiting decision'}[doc.extraction.reviewStatus??''] ?? 'Needs your decision') : `Extraction: ${doc.extraction.state}`}</span>}
            </div>
            {doc.job?.error_code && <p className="mt-2 text-xs text-amber-400">{ERROR_LABELS[doc.job.error_code] ?? 'Processing requires attention'}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {doc.job && <button className={buttonClass} disabled={busy} title="Download verified original" aria-label={`Download ${doc.name}`} onClick={()=>void perform(async()=>{
                const result=await send('processing.original',{workspaceId:workspace,jobId:doc.job!.id});
                const url=String(result.objectUrl);
                if (!url.startsWith('blob:')) throw new Error('Original download unavailable.');
                const link=document.createElement('a');link.href=url;link.download=doc.name;link.click();
                window.setTimeout(()=>URL.revokeObjectURL(url),60000);
              })}><Download size={15}/></button>}
              {state === 'parsed' && !doc.extraction && data.capabilities.extractionEnabled && <button className={buttonClass} disabled={!canRun || busy} title="Extract fields" aria-label={`Extract ${doc.name}`} onClick={() => void perform(async () => {
                const result = await send('processing.extract', { workspaceId: workspace, jobId: doc.job!.id, reasoning });
                const job = result.job as { id: string };
                previewGeneration.current++; setPreview(null); setActivity(null);setRelation(null); setExtraction({ jobId: job.id, name: doc.name });
              })}><ScanText size={15} /></button>}
              {doc.extraction && <button className={buttonClass} title="Inspect extraction" aria-label={`Extraction ${doc.name}`} onClick={() => {
                previewGeneration.current++; setPreview(null); setActivity(null);setRelation(null); setExtraction({ jobId: doc.extraction!.id, name: doc.name });
              }}><ScanText size={15} /></button>}
              {doc.job && <button className={buttonClass} title="Inspect private task" aria-label={`Inspect ${doc.name}`} onClick={() => {
                previewGeneration.current++; setPreview(null); setExtraction(null);setRelation(null); setActivity({ jobId: doc.job!.id, name: doc.name });
              }}><Activity size={15} /></button>}
              {state === 'received' && <button className={buttonClass} disabled={!canRun || busy} title="Parse document" aria-label={`Parse ${doc.name}`} onClick={() => actOn(doc, 'enqueue')}><Play size={15} /></button>}
              {['queued', 'running'].includes(state) && <button className={buttonClass} disabled={busy} title="Pause" aria-label={`Pause ${doc.name}`} onClick={() => actOn(doc, 'pause')}><Pause size={15} /></button>}
              {state === 'paused' && <button className={buttonClass} disabled={!canRun || busy || doc.job!.attempt >= 3} title="Resume" aria-label={`Resume ${doc.name}`} onClick={() => actOn(doc, 'resume')}><Play size={15} /></button>}
              {['failed', 'cancelled'].includes(state) && <button className={buttonClass} disabled={!canRun || busy || doc.job!.attempt >= 3} title="Retry" aria-label={`Retry ${doc.name}`} onClick={() => actOn(doc, 'retry')}><RotateCcw size={15} /></button>}
              {['queued', 'running', 'paused','failed'].includes(state) && <button className={buttonClass} disabled={busy} title="Cancel processing" aria-label={`Cancel ${doc.name}`} onClick={() => actOn(doc, 'cancel')}><X size={15} /></button>}
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
      {activity && <DocumentActivity key={activity.jobId} send={send} workspace={workspace} jobId={activity.jobId} name={activity.name} onClose={() => setActivity(null)} />}
      {relation&&<DocumentRelationEditor key={`${relation.jobId}:${relation.otherJobId}`} send={send} workspace={workspace} {...relation} onClose={()=>setRelation(null)}/>}
      {extraction && <ExtractionInspector key={extraction.jobId} send={send} workspace={workspace} jobId={extraction.jobId} name={extraction.name} canRun={canRun && Boolean(data?.capabilities.extractionEnabled)} onClose={() => setExtraction(null)} />}
      {preview && <aside className="min-w-0 border-t border-pc-border pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" aria-label="Parsed text preview">
        <div className="mb-2 flex items-start gap-3"><h2 className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{preview.name}</h2>
          <button className={buttonClass} title="Close preview" aria-label="Close preview" onClick={() => { previewGeneration.current++; setPreview(null); }}><X size={15} /></button></div>
        <p className="mb-3 text-xs text-amber-400">{data?.capabilities.extractionEnabled ? 'Parsed text' : 'Parsed text. Financial extraction not enabled.'}</p>
        {preview.truncated && <p className="mb-2 text-xs text-amber-400">Preview limited to 200,000 characters.</p>}
        <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed [overflow-wrap:anywhere]">{preview.text ?? 'Loading parsed text...'}</pre>
      </aside>}
    </div>
  </div>;
}
