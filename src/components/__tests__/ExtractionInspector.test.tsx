// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExtractionInspector } from '../ExtractionInspector';
afterEach(cleanup);
void React;
const data = {
  job:{id:'job-1',parse_job_id:'parse-1',state:'ready',revision:2,attempt:1,reasoning:'medium',error_code:null,next_run_at:0},
  result:{source:{segments:[{id:'s1',page:1,text:'Total 282.50 CAD <img src="https://external.invalid">'}]},
    dispatch:{actualModel:'Qwen-local',inputTokens:900,outputTokens:500,contextWindowTokens:32768,messages:[]},
    validation:{status:'needs_review',paymentStatus:'unknown',arithmetic:{total:'reconciled'},findings:[],lineItems:[],
      fields:{total:{value:'282.50',checked:true,evidence:'supported',citations:[{segmentId:'s1',page:1}]}}}},
  attempts:[{attempt:1,created_at:'2026-09-26',dispatch:{request:{messages:[{role:'user',content:'SYNTHETIC PRIVATE'}]}}}],reviews:[],events:[],
};
const props={workspace:'home',jobId:'job-1',name:'synthetic.pdf',canRun:true,onClose:()=>{}};
describe('extraction inspector',()=>{
  it('shows evidence, actual model, tokens and exact dispatch as inert text',async()=>{
    render(<ExtractionInspector {...props} send={vi.fn().mockResolvedValue(data)}/>);
    await screen.findByText('282.50');
    expect(screen.getByText('Payment status: unknown.',{exact:false})).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('tab',{name:'context'}));
    expect(screen.getByText('Model: Qwen-local')).toBeTruthy();
    expect(screen.getByText('Context window: 32768')).toBeTruthy();
    expect(screen.getByText('SYNTHETIC PRIVATE',{exact:false})).toBeTruthy();
  });
  it('submits corrections only with note, acknowledgement and captured revision',async()=>{
    const send=vi.fn().mockResolvedValue(data);
    render(<ExtractionInspector {...props} send={send}/>);await screen.findByText('282.50');
    expect((screen.getByRole('button',{name:'Accept record'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Correction value'),{target:{value:'280.00'}});
    fireEvent.click(screen.getByRole('button',{name:'Stage correction'}));
    fireEvent.change(screen.getByLabelText('Review note'),{target:{value:'Checked source'}});
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Save corrections'}));
    await waitFor(()=>expect(send).toHaveBeenCalledWith('extraction.review',{workspaceId:'home',jobId:'job-1',review:{revision:2,decision:'correction',note:'Checked source',acknowledge:true,corrections:{total:'280.00'}}}));
  });
  it('blocks a stale draft when another tab publishes a new revision',async()=>{
    const view=render(<ExtractionInspector {...props} send={vi.fn().mockResolvedValue(data)}/>);await screen.findByText('282.50');
    fireEvent.change(screen.getByLabelText('Review note'),{target:{value:'My pending decision'}});fireEvent.click(screen.getByRole('checkbox'));
    view.rerender(<ExtractionInspector {...props} send={vi.fn().mockResolvedValue({...data,job:{...data.job,revision:3}})}/>);
    await screen.findByRole('alert');
    expect((screen.getByRole('button',{name:'Accept record'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Review note') as HTMLTextAreaElement).value).toBe('My pending decision');
    fireEvent.click(screen.getByRole('button',{name:'Discard draft'}));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('clears private results after access is revoked',async()=>{
    const view=render(<ExtractionInspector {...props} send={vi.fn().mockResolvedValue(data)}/>);await screen.findByText('282.50');
    view.rerender(<ExtractionInspector {...props} send={vi.fn().mockRejectedValue(new Error('revoked'))}/>);
    await screen.findByRole('alert');expect(screen.queryByText('282.50')).toBeNull();
  });
});
