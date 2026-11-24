"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {ApiError} from '@/lib/session-api';
import {loadAssignees} from './api';
import type {Assignee,Lead,Page} from './domain';
import styles from './pipeline.module.css';

export function AssignmentEditor({lead,busy,onAssign}:{lead:Lead;busy:boolean;onAssign:(lead:Lead,id:string|null)=>Promise<boolean>}){
  const [expanded,setExpanded]=useState(false);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [result,setResult]=useState<Page<Assignee>|null>(null);
  const [error,setError]=useState('');
  const [choice,setChoice]=useState<Assignee|null|undefined>(undefined);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!expanded)return;
    const controller=new AbortController();setResult(null);setError('');
    loadAssignees(search,page,controller.signal).then(r=>{if(!controller.signal.aborted)setResult(r);}).catch(e=>{
      if(controller.signal.aborted)return;
      if(e instanceof ApiError&&e.status===401)window.location.replace('/login');
      else setError(e instanceof Error?e.message:'Unable to load staff.');
    });return()=>controller.abort();
  },[expanded,search,page,retry]);
  function find(e:FormEvent){e.preventDefault();setSearch(draft.trim());setPage(1);setRetry(n=>n+1);}
  async function confirm(){if(busy||choice===undefined)return;await onAssign(lead,choice?.id??null);}
  if(!expanded)return <button type="button" disabled={busy} onClick={()=>setExpanded(true)}>Change assignment</button>;
  const same=choice!==undefined&&(choice?.id??null)===(lead.assignedTo?.id??null);
  return <div className={styles.assignment}>
    <form className={styles.assignmentSearch} onSubmit={find}>
      <label htmlFor="assignment-search">Find active staff</label>
      <input id="assignment-search" value={draft} maxLength={150} disabled={busy} onChange={e=>setDraft(e.target.value)}/>
      <button disabled={busy}>Search</button>
    </form>
    {error?<p role="alert">{error} <button disabled={busy} onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:!result?<p role="status">Loading staff…</p>:<>
      <div className={styles.assignmentChoices} role="group" aria-label="Staff accounts">
        {result.results.map(a=><button type="button" key={a.id} disabled={busy} aria-pressed={choice?.id===a.id} onClick={()=>setChoice(a)}>{a.username}</button>)}
        {!result.results.length&&<p>No active staff found.</p>}
      </div>
      <div className={styles.moveButtons}><button type="button" disabled={busy||page<=1} onClick={()=>setPage(n=>n-1)}>Previous staff page</button><span>Page {page}</span><button type="button" disabled={busy||!result.hasMore||page>=1000} onClick={()=>setPage(n=>n+1)}>Next staff page</button></div>
    </>}
    <button type="button" disabled={busy} aria-pressed={choice===null} onClick={()=>setChoice(null)}>Unassigned (Owner only)</button>
    {choice!==undefined&&<p>New assignment: <strong>{choice?.username||'Unassigned'}</strong></p>}
    <p className={styles.muted}>The previous assignee will lose access to this lead on subsequent requests. The selected staff member will gain access.</p>
    <div className={styles.moveButtons}><button type="button" disabled={busy||choice===undefined||same} onClick={()=>void confirm()}>Confirm assignment</button><button type="button" disabled={busy} onClick={()=>{setExpanded(false);setChoice(undefined);}}>Cancel</button></div>
  </div>;
}
