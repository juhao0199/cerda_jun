'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {loadDetail} from './api';
import {LeadEditor} from './lead-editor';
import {AssignmentEditor} from './assignment-editor';
import {LABEL,type Detail,type Lead,type Stage} from './domain';
import {ApiError} from '@/lib/session-api';
import styles from './pipeline.module.css';
export const formatDate=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
export function LeadDrawer({reference,revision,busy,notice,onClose,onMove,onNote,onAssign,onArchive,onEdited,onConflict}:{reference:string;revision:number;busy:boolean;notice:string;onClose:()=>void;onMove:(lead:Lead,stage:Stage)=>Promise<boolean>;onNote:(lead:Lead,note:string)=>Promise<boolean>;onAssign:(lead:Lead,assigneeId:string|null)=>Promise<boolean>;onArchive:(lead:Lead)=>Promise<void>;onEdited:()=>void;onConflict:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);const [detail,setDetail]=useState<Detail|null>(null);const [error,setError]=useState('');const [note,setNote]=useState('');const [retry,setRetry]=useState(0);const [editing,setEditing]=useState(false);
  useEffect(()=>{const el=dialog.current;if(el&&!el.open)el.showModal();return()=>{if(el?.open)el.close();};},[]);
  useEffect(()=>{const controller=new AbortController();setDetail(null);setError('');loadDetail(reference,controller.signal).then(d=>{if(!controller.signal.aborted)setDetail(d);}).catch(e=>{if(controller.signal.aborted)return;if(e instanceof ApiError&&e.status===401)window.location.replace('/login');else setError(e instanceof Error?e.message:'Unable to load lead.');});return()=>controller.abort();},[reference,revision,retry]);
  async function submit(e:FormEvent){e.preventDefault();if(!detail||busy||!note.trim())return;if(await onNote(detail,note.trim()))setNote('');}
  return <dialog ref={dialog} className={styles.drawer} aria-labelledby="lead-drawer-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <div className={styles.drawerHeader}><div><small>Lead details</small><h2 id="lead-drawer-title">{detail?.name||detail?.company||'Inquiry'}</h2></div><button type="button" aria-label="Close lead details" disabled={busy} onClick={onClose}>×</button></div>
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {error?<div role="alert" className={styles.notice}>{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:!detail?<p role="status" className={styles.empty}>Loading details…</p>:<div className={styles.drawerBody}>
      <dl className={styles.meta}><dt>Company</dt><dd>{detail.company||'—'}</dd><dt>Email</dt><dd>{detail.email}</dd><dt>Received</dt><dd>{formatDate(detail.createdAt)}</dd><dt>Stage</dt><dd><span className={styles.stagePill} data-stage={detail.stage}>{LABEL[detail.stage]}</span></dd></dl>
      <section><h3>Opportunity</h3><dl className={styles.meta}><dt>Service</dt><dd>{detail.service||"—"}</dd><dt>Source</dt><dd>{detail.source||"—"}</dd><dt>Priority</dt><dd>{detail.priority||"—"}</dd><dt>Expected value</dt><dd>{detail.expectedValue==null?"—":`${detail.currency} ${detail.expectedValue}`}</dd><dt>Expected close</dt><dd>{detail.expectedCloseDate||"—"}</dd><dt>Tags</dt><dd>{detail.tags?.join(", ")||"—"}</dd></dl><div className={styles.moveButtons}>{detail.canEdit&&<button disabled={busy} onClick={()=>setEditing(true)}>Edit lead</button>}{detail.canArchive&&<button disabled={busy} onClick={()=>void onArchive(detail)}>{detail.archived?"Restore lead":"Archive lead"}</button>}</div>{detail.archived&&<p className={styles.muted}>Archived · read only</p>}</section>
      <section><h3>Assignment</h3><p>Assigned to: <strong>{detail.assignedTo?.username||'Unassigned'}</strong></p>{detail.canAssign&&<AssignmentEditor key={`${detail.reference}:${detail.version}`} lead={detail} busy={busy} onAssign={onAssign}/>}</section>
      <section><h3>Quotations</h3>{!detail.archived&&<a href={`/workspace/quotations?lead=${encodeURIComponent(detail.reference)}`}>Create or view quotations →</a>}</section>
      <section><h3>Project brief</h3><p className={styles.brief}>{detail.overview||'No project brief.'}</p></section>
      <section><h3>Move opportunity</h3><div className={styles.moveButtons}>{detail.allowedStages.map(s=><button key={s} disabled={busy} onClick={()=>void onMove(detail,s)}>{s==='won'?'Win & convert':`Move to ${LABEL[s]}`}</button>)}</div>{!detail.allowedStages.length&&<p className={styles.muted}>No further transitions available.</p>}{detail.clientId&&<p className={styles.muted}>Linked to a client record.</p>}</section>
      <section><h3>Activity</h3>{!detail.archived&&<form className={styles.noteForm} onSubmit={submit}><label htmlFor="pipeline-note">Internal note</label><textarea id="pipeline-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Record a follow-up…" required/><small>Do not enter credentials or sensitive documents.</small><button disabled={busy||!note.trim()}>Add note</button></form>}
      <ol className={styles.timeline}>{detail.activity.map(a=><li key={a.id}><small>{formatDate(a.createdAt)} · {a.action==='note.added'?'Note':a.action}</small><p>{a.message}</p></li>)}</ol>{!detail.activity.length&&<p className={styles.muted}>No activity yet.</p>}</section>
    </div>}
    {editing&&detail&&<LeadEditor detail={detail} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);onEdited();}} onConflict={onConflict}/>}
  </dialog>;
}
