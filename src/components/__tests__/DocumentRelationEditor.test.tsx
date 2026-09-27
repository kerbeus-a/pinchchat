// @vitest-environment jsdom
import React from 'react';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,describe,it,expect,vi } from 'vitest';
import { DocumentRelationEditor } from '../DocumentRelationEditor';
afterEach(cleanup);void React;
const data={revision:4,possibleDuplicates:[{extractionId:'other',revision:7}],relations:[]};
describe('document relationship decisions',()=>{
  it('submits a scoped decision with both observed revisions and a stable replay key',async()=>{
    const send=vi.fn(async(method:string)=>{if(method==='extraction.relation')throw new Error('Connection lost');return data;});
    render(<DocumentRelationEditor send={send} workspace="home" jobId="current" otherJobId="other" name="A.pdf" otherName="B.pdf" onClose={()=>{}}/>);
    await waitFor(()=>expect(screen.getByLabelText('Relationship note').hasAttribute('disabled')).toBe(false));
    fireEvent.change(screen.getByLabelText('Relationship note'),{target:{value:'Reviewed both originals'}});
    fireEvent.click(screen.getByRole('button',{name:'Save relationship'}));
    await screen.findByText('Connection lost');
    await waitFor(()=>expect(screen.getByRole('button',{name:'Save relationship'}).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Save relationship'}));
    await waitFor(()=>expect(send.mock.calls.filter(([method])=>method==='extraction.relation')).toHaveLength(2));
    const calls=send.mock.calls as unknown as Array<[string,{review:Record<string,unknown>}]>;
    const writes=calls.filter(([method])=>method==='extraction.relation');
    expect(writes[0][1].review).toMatchObject({jobId:'current',otherJobId:'other',revision:4,otherRevision:7,decision:'keep_separate',note:'Reviewed both originals'});
    expect(writes[0][1].review.requestId).toBe(writes[1][1].review.requestId);
  });
  it('refuses new decisions when the records no longer match but retains history',async()=>{
    const send=vi.fn().mockResolvedValue({...data,possibleDuplicates:[],relations:[{id:'r',leftJobId:'current',rightJobId:'other',decision:'keep_separate',newerJobId:null,note:'Old decision',createdAt:'2026-09-26',current:false}]});
    render(<DocumentRelationEditor send={send} workspace="home" jobId="current" otherJobId="other" name="A.pdf" otherName="B.pdf" onClose={()=>{}}/>);
    await screen.findByText('Historical: Kept separate');
    expect(screen.getByRole('button',{name:'Save relationship'}).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Old decision')).toBeTruthy();
  });
});
