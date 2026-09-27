import { useEffect,useRef,useState } from 'react';
import { RefreshCw,Save,X } from 'lucide-react';
import type { JsonPayload } from '../lib/kinGateway';
import { genIdempotencyKey } from '../lib/utils';
type Send=(method:string,params:JsonPayload)=>Promise<JsonPayload>;
interface Detail {revision:number;possibleDuplicates:Array<{extractionId:string;revision:number}>;relations:Array<{id:string;leftJobId:string;rightJobId:string;decision:string;newerJobId:string|null;note:string;createdAt:string;current:boolean}>}
const button='rounded border border-pc-border p-2 text-xs hover:bg-[var(--pc-hover)] disabled:opacity-40';
export function DocumentRelationEditor({send,workspace,jobId,otherJobId,name,otherName,onClose}:{send:Send;workspace:string;jobId:string;otherJobId:string;name:string;otherName:string;onClose:()=>void}) {
  const [data,setData]=useState<Detail|null>(null);
  const [note,setNote]=useState('');const [decision,setDecision]=useState('keep_separate');
  const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);const alive=useRef(true);const request=useRef<string|null>(null);
  useEffect(()=>{
    alive.current=true;let stopped=false;
    void send('extraction.relations',{workspaceId:workspace,jobId}).then(value=>{if(!stopped)setData(value as unknown as Detail);}).catch(()=>{if(!stopped){setData(null);setError('Relationships unavailable.');}});
    return()=>{stopped=true;alive.current=false;};
  },[send,workspace,jobId,refresh]);
  const peer=data?.possibleDuplicates.find(item=>item.extractionId===otherJobId);
  const history=data?.relations.filter(item=>item.leftJobId===otherJobId||item.rightJobId===otherJobId)??[];
  const save=async()=>{
    if(busy||!data||!peer||!note.trim())return;
    setBusy(true);setError(null);request.current??=genIdempotencyKey();
    try {
      await send('extraction.relation',{workspaceId:workspace,jobId,review:{jobId,otherJobId,revision:data.revision,otherRevision:peer.revision,decision,note,requestId:request.current}});
      if(alive.current){request.current=null;setNote('');setRefresh(value=>value+1);}
    } catch(e){if(alive.current)setError(e instanceof Error?e.message:'Relationship could not be saved.');}
    finally {if(alive.current)setBusy(false);}
  };
  return <aside aria-label="Document relationship" className="min-w-0 border-t border-pc-border pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
    <header className="mb-4 flex gap-2"><div className="min-w-0 flex-1"><h2 className="text-sm font-medium [overflow-wrap:anywhere]">{name}</h2><p className="mt-2 text-xs [overflow-wrap:anywhere]">Related record: {otherName}</p></div><button className={button} title="Close relationship" aria-label="Close relationship" onClick={onClose}><X size={15}/></button></header>
    {error&&<p role="alert" className="mb-3 text-xs text-red-400 [overflow-wrap:anywhere]">{error}</p>}
    {data&&!peer&&<p className="mb-3 text-xs text-amber-400">These records no longer qualify as a possible duplicate or revision.</p>}
    <label className="mb-3 block text-xs">Relationship<select aria-label="Document relationship decision" disabled={busy||!peer} value={decision} onChange={event=>{setDecision(event.target.value);request.current=null;}} className="mt-2 block max-w-full rounded border border-pc-border bg-[var(--pc-bg-surface)] p-2"><option value="keep_separate">Keep separate</option><option value="revision_of">This record revises the related record</option></select></label>
    <textarea aria-label="Relationship note" disabled={busy||!peer} rows={3} maxLength={1000} value={note} onChange={event=>{setNote(event.target.value);request.current=null;}} className="mb-3 w-full rounded border border-pc-border bg-transparent p-2 text-xs" placeholder="Decision reason"/>
    <div className="mb-4 flex gap-2"><button className={button} disabled={busy||!peer||!note.trim()} onClick={()=>void save()}><Save size={14} className="mr-1 inline"/>Save relationship</button><button className={button} disabled={busy} title="Reload relationship" aria-label="Reload relationship" onClick={()=>{setData(null);setNote('');setError(null);request.current=null;setRefresh(value=>value+1);}}><RefreshCw size={15}/></button></div>
    <p className="mb-4 text-xs text-pc-text-muted">No records are merged, deleted or posted.</p>
    {history.map(item=><article key={item.id} className="border-t border-pc-border py-3 text-xs"><h3>{item.current?'Current':'Historical'}: {item.decision==='keep_separate'?'Kept separate':item.newerJobId===jobId?'This record is the newer revision':'Related record is the newer revision'}</h3><time>{item.createdAt} UTC</time><p className="mt-2 [overflow-wrap:anywhere]">{item.note}</p></article>)}
  </aside>;
}
