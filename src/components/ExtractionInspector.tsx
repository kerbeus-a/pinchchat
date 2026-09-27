import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Save, X } from 'lucide-react';
import type { JsonPayload } from '../lib/kinGateway';
import { genIdempotencyKey } from '../lib/utils';
type Send = (method:string,params:JsonPayload) => Promise<JsonPayload>;
interface Field { value:string|null; checked:boolean; evidence:string; citations:Array<{segmentId:string;page:number|null}> }
interface Detail {
  job:{id:string;state:string;revision:number;attempt:number;reasoning:string;error_code:string|null;next_run_at:number;parse_job_id:string;generation_start_revision?:number};
  versions?:Array<{revision:number;created_at:string}>;
  deferrals?:Array<{id:string;revision:number;action:string;note:string;created_at:string}>;
  result:null|{source:{segments:Array<{id:string;text:string;page:number|null}>};dispatch:{actualModel:string|null;inputTokens:number|null;outputTokens:number|null;contextWindowTokens:number;messages:unknown;calls?:unknown[]};
    validation:{status:string;paymentStatus:string;fields:Record<string,Field>;arithmetic:Record<string,string>;findings:Array<{code:string;path:string;message:string;severity:string}>;lineItems:Array<Record<string,Field>>}};
  attempts:Array<{attempt:number;created_at:string;dispatch:unknown}>;
  reviews:Array<{id:string;decision:string;revision:number;note:string;corrections:Record<string,string|null>;created_at:string}>;
  events:Array<{revision:number;state:string;attempt:number;error_code:string|null;created_at:string}>;
}
const labels:Record<string,string> = {supplier:'Supplier',customer:'Customer',documentNumber:'Document number',issueDate:'Issue date',dueDate:'Due date',currency:'Currency',subtotal:'Subtotal',tax:'Tax',total:'Total',taxTreatment:'Tax treatment',direction:'Direction'};
const displayLabels:Record<string,string> = {...labels,documentType:'Document type',discount:'Discount',taxRate:'Tax rate',paymentTerms:'Payment terms',paymentWording:'Payment wording',lineItems:'Line items'};
const button = 'rounded border border-pc-border p-2 text-xs hover:bg-[var(--pc-hover)] disabled:opacity-40';
const safeDisplay = (text:string) => text.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu,character => ['\n','\r','\t'].includes(character) ? character : `\\u${character.charCodeAt(0).toString(16).padStart(4,'0')}`);

export function ExtractionInspector({send,workspace,jobId,name,canRun,onClose}:{send:Send;workspace:string;jobId:string;name:string;canRun:boolean;onClose:()=>void}) {
  const [data,setData] = useState<Detail|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [tab,setTab] = useState<'result'|'context'|'history'>('result');
  const [busy,setBusy] = useState(false);
  const [note,setNote] = useState('');
  const [ack,setAck] = useState(false);
  const [field,setField] = useState('total');
  const [value,setValue] = useState('');
  const [corrections,setCorrections] = useState<Record<string,string|null>>({});
  const [draftRevision,setDraftRevision] = useState<number|null>(null);
  const [version,setVersion] = useState<{revision:number;detail:unknown}|null>(null);
  const reprocessId = useRef<string|null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let stopped = false; let pending = false;
    const refresh = async () => {
      if (pending) return; pending = true;
      try { const next = await send('extraction.read',{workspaceId:workspace,jobId}); if (!stopped) setData(next as unknown as Detail); }
      catch { if (!stopped) { setData(null);setVersion(null);setError('Extraction details unavailable.'); } }
      finally {pending = false;}
    };
    void refresh(); const timer = setInterval(() => void refresh(),2000);
    return () => {stopped=true;alive.current=false;clearInterval(timer);};
  },[send,workspace,jobId]);
  const changeDraft = () => { if (draftRevision === null && data) setDraftRevision(data.job.revision); };
  const action = async (method:string,extra:JsonPayload) => {
    if (busy || !data) return;
    setBusy(true);setError(null);
    try {
      await send(method,{workspaceId:workspace,jobId,...extra});
      const next = await send('extraction.read',{workspaceId:workspace,jobId});
      if (alive.current) {setData(next as unknown as Detail);setNote('');setAck(false);setCorrections({});setDraftRevision(null);reprocessId.current=null;}
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally {if(alive.current) setBusy(false);}
  };
  const review = (decision:string) => {
    if (!data) return;
    void action('extraction.review',{review:{revision:draftRevision ?? data.job.revision,decision,note,acknowledge:ack,corrections}});
  };
  const stale = draftRevision !== null && data && draftRevision !== data.job.revision;
  const latest = data ? [...data.reviews,...(data.deferrals??[]).map(entry=>({...entry,decision:entry.action==='defer'?'deferred':'reopened'}))]
    .filter(r=>r.revision>(data.job.generation_start_revision??0)).sort((a,b)=>a.revision-b.revision).at(-1) : undefined;
  const overrides = Object.assign({},...(data?.reviews.map(r=>r.corrections) ?? [])) as Record<string,string|null>;
  return <aside aria-label="Extraction inspector" className="min-w-0 border-t border-pc-border pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
    <div className="mb-3 flex gap-3"><h2 className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{name}</h2><button className={button} title="Close extraction" aria-label="Close extraction" onClick={onClose}><X size={15}/></button></div>
    {error && <p role="alert" className="mb-3 text-xs text-red-400 [overflow-wrap:anywhere]">{safeDisplay(error)}</p>}
    {!data ? <p className="text-xs text-pc-text-muted">No extraction readings available.</p> : <>
      <div className="mb-3 flex flex-wrap gap-2 text-xs"><span>{data.job.state === 'ready' ? (latest?.decision==='accepted'?'Owner accepted':latest?.decision==='rejected'?'Owner rejected':'Ready for owner review') : data.job.state}</span><span>Attempt {data.job.attempt}/3</span><span>Reasoning requested: {data.job.reasoning}</span></div>
      {data.job.error_code && <p className="mb-2 text-xs text-amber-400">{data.job.error_code}{data.job.state === 'queued' && data.job.next_run_at > Date.now() ? ' / retry scheduled' : ''}</p>}
      <div className="mb-3 flex gap-2">
        {data.job.state==='ready' && <button className={button} disabled={busy||!canRun||draftRevision!==null} title="Re-extract with the current local model; keep earlier results and corrections" aria-label="Re-extract document" onClick={()=>{
          reprocessId.current??=genIdempotencyKey();
          void action('extraction.reprocess',{revision:data.job.revision,reasoning:data.job.reasoning,requestId:reprocessId.current});
        }}><RotateCcw size={15}/></button>}
        {['queued','running'].includes(data.job.state) && <button className={button} disabled={busy} title="Pause extraction" aria-label="Pause extraction" onClick={()=>void action('extraction.control',{action:'pause',revision:data.job.revision})}><Pause size={15}/></button>}
        {['queued','running','paused','failed'].includes(data.job.state) && <button className={button} disabled={busy} title="Cancel extraction" aria-label="Cancel extraction" onClick={()=>void action('extraction.control',{action:'cancel',revision:data.job.revision})}><X size={15}/></button>}
        {['paused','failed','cancelled'].includes(data.job.state) && <button className={button} disabled={busy || !canRun || data.job.attempt>=3} title="Resume or retry extraction" aria-label="Resume or retry extraction" onClick={()=>void action('extraction.control',{action:data.job.state==='paused'?'resume':'retry',revision:data.job.revision})}><RotateCcw size={15}/></button>}
      </div>
      <div role="tablist" aria-label="Extraction views" className="mb-4 flex gap-4 border-b border-pc-border">{(['result','context','history'] as const).map(item=><button key={item} role="tab" aria-selected={tab===item} className={`border-b-2 py-2 text-xs capitalize ${tab===item?'border-pc-accent text-pc-accent-light':'border-transparent text-pc-text-muted'}`} onClick={()=>setTab(item)}>{item}</button>)}</div>
      {tab==='context' && <div className="space-y-3 text-xs [overflow-wrap:anywhere]">
        <p>Parent parse task: {data.job.parse_job_id}</p>
        <p>Model: {data.result?.dispatch.actualModel ?? 'No completed model response'}</p>
        <p>Input tokens: {data.result?.dispatch.inputTokens ?? 'Not reported'} / Output: {data.result?.dispatch.outputTokens ?? 'Not reported'}</p>
        {data.result?.dispatch.calls&&<p>Model calls: {data.result.dispatch.calls.length} / token totals cover these calls.</p>}
        <p>Context window: {data.result?.dispatch.contextWindowTokens ?? 'Not reported'}</p>
        {data.attempts.map(attempt=><details key={attempt.attempt} open><summary>Dispatch attempt {attempt.attempt}</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs [overflow-wrap:anywhere]">{safeDisplay(JSON.stringify(attempt.dispatch,null,2))}</pre></details>)}
      </div>}
      {tab==='history' && <div className="space-y-4 text-xs">
        {data.deferrals?.map(entry=><article key={entry.id} className="border-b border-pc-border pb-3"><h3>Owner: {entry.action==='defer'?'deferred':'reopened'} / revision {entry.revision}</h3><time>{entry.created_at} UTC</time><p className="[overflow-wrap:anywhere]">{safeDisplay(entry.note)}</p></article>)}
        {data.versions?.map(item=><div key={item.revision}><button className={button} disabled={busy} onClick={async()=>{
          setBusy(true);setError(null);
          try {const detail=await send('extraction.version',{workspaceId:workspace,jobId,revision:item.revision});if(alive.current)setVersion({revision:item.revision,detail});}
          catch {if(alive.current){setVersion(null);setError('Earlier extraction unavailable.');}}
          finally {if(alive.current)setBusy(false);}
        }}>Earlier extraction / revision {item.revision}</button><time className="ml-2">{item.created_at} UTC</time></div>)}
        {version && <details open><summary>Snapshot at revision {version.revision}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{safeDisplay(JSON.stringify(version.detail,null,2))}</pre></details>}
        {data.reviews.map(r=><article key={r.id} className="border-b border-pc-border pb-3"><h3>Owner: {r.decision} / revision {r.revision}</h3><time>{r.created_at} UTC</time><p className="my-2 [overflow-wrap:anywhere]">{safeDisplay(r.note)}</p><pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{safeDisplay(JSON.stringify(r.corrections,null,2))}</pre></article>)}
        {data.events.map(event=><p key={event.revision}>{event.created_at} UTC / {event.state} / attempt {event.attempt}{event.error_code ? ` / ${event.error_code}`:''}</p>)}
      </div>}
      {tab==='result' && (data.result ? <div className="space-y-4 text-xs">
        <p className="text-amber-400">{data.result.validation.status==='checks_passed'?'Automated checks passed':'Automated checks: review findings'}. Payment status: unknown.</p>
        {latest && <p className="text-pc-accent-light">Owner decision: {latest.decision} / revision {latest.revision}</p>}
        <div>{Object.entries(data.result.validation.arithmetic).map(([key,status])=><p key={key}>{displayLabels[key]??key}: {status.replaceAll('_',' ')}</p>)}</div>
        {data.result.validation.findings.filter(f=>f.severity!=='info').map((finding,index)=><p key={index} className="text-amber-400 [overflow-wrap:anywhere]">{finding.path}: {finding.code==='tax_convention_inferred' ? 'Totals add up, but tax included versus added is not stated.' : safeDisplay(finding.message || finding.code)}</p>)}
        {Object.entries(data.result.validation.fields).map(([key,item])=><section key={key} className="border-t border-pc-border pt-2">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{displayLabels[key]??key}</h3><span className="text-pc-text-muted">{item.checked?'Evidence matched':'Unverified'}</span></div>
          <p className="mt-1 [overflow-wrap:anywhere]">{safeDisplay(item.value??'Not found')}</p>
          {Object.hasOwn(overrides,key) && <p className="mt-1 text-pc-accent-light [overflow-wrap:anywhere]">Owner correction: {safeDisplay(overrides[key]??'Cleared')}</p>}
          {item.citations.map((citation,index)=>{const source=data.result!.source.segments.find(s=>s.id===citation.segmentId);return <details key={index} className="mt-2"><summary className="cursor-pointer text-pc-text-muted">{citation.segmentId} / page {citation.page??'unknown'}</summary><pre className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{safeDisplay(source?.text??'Source unavailable')}</pre></details>;})}
        </section>)}
        {data.result.validation.lineItems.length>0 && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Description','Qty','Unit','Amount'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{data.result.validation.lineItems.map((line,index)=><tr key={index}>{['description','quantity','unitPrice','amount'].map(key=><td key={key} className="border-t border-pc-border p-2">{safeDisplay(line[key]?.value??'Unknown')}</td>)}</tr>)}</tbody></table></div>}
        <div className="space-y-3 border-t border-pc-border pt-4">
          <h3 className="font-medium">Owner review</h3>
          <div className="flex flex-wrap gap-2"><select aria-label="Correction field" disabled={busy} className="min-w-0 rounded border border-pc-border bg-[var(--pc-bg-surface)] p-2" value={field} onChange={e=>{setField(e.target.value);setValue(e.target.value==='direction'?'unknown':'');}}>{Object.entries(labels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
            {['direction','taxTreatment'].includes(field) ? <select aria-label="Correction value" disabled={busy} className="min-w-0 flex-1 rounded border border-pc-border bg-[var(--pc-bg-surface)] p-2" value={value} onChange={e=>setValue(e.target.value)}>
              {(field==='direction'?['unknown','payable','receivable']:['','inclusive','exclusive']).map(item=><option key={item} value={item}>{item||'Unknown'}</option>)}
            </select> : <input aria-label="Correction value" disabled={busy} type={field.endsWith('Date')?'date':'text'} className="min-w-0 flex-1 rounded border border-pc-border bg-transparent p-2" value={value} onChange={e=>setValue(e.target.value)} placeholder="Corrected value"/>}
            <button className={button} disabled={busy} title="Stage correction" aria-label="Stage correction" onClick={()=>{changeDraft();setCorrections({...corrections,[field]:value.trim()||null});setValue(field==='direction'?'unknown':'');}}><Play size={15}/></button></div>
          {Object.entries(corrections).map(([key,v])=><p key={key} className="[overflow-wrap:anywhere]">{labels[key]}: {safeDisplay(v??'Cleared')} <button className={button} aria-label={`Remove correction ${key}`} onClick={()=>setCorrections(Object.fromEntries(Object.entries(corrections).filter(([k])=>k!==key)))}><X size={12}/></button></p>)}
          <textarea aria-label="Review note" disabled={busy} maxLength={1000} className="w-full rounded border border-pc-border bg-transparent p-2" rows={3} value={note} onChange={e=>{changeDraft();setNote(e.target.value);}} placeholder="Review note"/>
          <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={ack} onChange={e=>{changeDraft();setAck(e.target.checked);}}/>I reviewed the evidence and unresolved findings.</label>
          {stale && <p role="alert" className="text-amber-400">Another review changed this record. Discard this draft before reviewing the new revision.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={busy||!ack||!note.trim()||Boolean(stale)} onClick={()=>review('accepted')}><Check size={14} className="mr-1 inline"/>Accept record</button>
            <button className={button} disabled={busy||!ack||!note.trim()||Boolean(stale)} onClick={()=>review('rejected')}><X size={14} className="mr-1 inline"/>Reject record</button>
            <button className={button} disabled={busy||!ack||!note.trim()||Boolean(stale)||Object.keys(corrections).length===0} onClick={()=>review('correction')}><Save size={14} className="mr-1 inline"/>Save corrections</button>
            <button className={button} disabled={busy||!ack||!note.trim()||Boolean(stale)||Object.keys(corrections).length>0} onClick={()=>void action('extraction.defer',{review:{revision:draftRevision??data.job.revision,action:latest?.decision==='deferred'?'reopen':'defer',note,acknowledge:ack}})}>{latest?.decision==='deferred'?'Return to decision queue':'Defer record'}</button>
            <button className={button} disabled={busy} onClick={()=>{setDraftRevision(null);setCorrections({});setNote('');setAck(false);}}>Discard draft</button>
          </div>
          <p className="text-pc-text-muted">Local record decision only. No payment or accounting entry.</p>
        </div>
      </div> : <p className="text-xs text-pc-text-muted">No extraction result yet.</p>)}
    </>}
  </aside>;
}
