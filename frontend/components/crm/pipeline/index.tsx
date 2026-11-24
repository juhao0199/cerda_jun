'use client';
import {useEffect,useRef,useState,type DragEvent,type FormEvent} from 'react';
import {ApiError} from '@/lib/session-api';
import {addNote,assignLead,loadPage,loadSummary,moveLead,archiveLead,exportLeads} from './api';
import {EMPTY,FIRST,LABEL,SERVICES,STAGES,SOURCES,PRIORITIES,canMove,optimistic,savedView,validFilters,type ColumnPages,type Filters,type Lead,type Mode,type Page,type Stage,type Summary} from './domain';
import {LeadDrawer,formatDate} from './lead-drawer';
import {LeadEditor} from './lead-editor';
import styles from './pipeline.module.css';
const storageKey='cedar.crm.view.v1';
const serviceLabels={website:'Web',software:'Software',ai:'AI',support:'Support',explore:'Exploring'};
type Results={key:string;summary:Summary;pages:Partial<Record<Stage|'table',Page<Lead>>>};
export default function SalesPipeline({canManage=false}:{canManage?:boolean}){
  const [creating,setCreating]=useState(false);
  const [mode,setMode]=useState<Mode>('board');const [draft,setDraft]=useState<Filters>(EMPTY);const [filters,setFilters]=useState<Filters>(EMPTY);const [pages,setPages]=useState<ColumnPages>(FIRST);const [tablePage,setTablePage]=useState(1);const [revision,setRevision]=useState(0);
  const [results,setResults]=useState<Results|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [selected,setSelected]=useState<string|null>(null);const [dragged,setDragged]=useState<Lead|null>(null);const [target,setTarget]=useState<Stage|null>(null);const [pending,setPending]=useState(false);const [saved,setSaved]=useState(false);
  const writing=useRef(false);const dragRef=useRef<Lead|null>(null);const search=useRef<HTMLInputElement>(null);const live=useRef(true);const opener=useRef<HTMLElement|null>(null);
  const columns=filters.stage?[filters.stage]:STAGES;
  const key=JSON.stringify([mode,filters,pages,tablePage,revision]);const current=results?.key===key?results:null;const loading=!current&&!error;const disabled=pending||loading;
  useEffect(()=>{live.current=true;try{setSaved(!!savedView(localStorage.getItem(storageKey)));}catch{}return()=>{live.current=false;};},[]);
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){e.preventDefault();search.current?.focus();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[]);
  useEffect(()=>{const controller=new AbortController();setError('');const requested=filters.stage?[filters.stage]:STAGES;
    const reads:Promise<readonly [Stage|'table',Page<Lead>]>[]=mode==='table'?[loadPage(filters,tablePage,controller.signal).then(p=>['table',p] as const)]:requested.map(s=>loadPage(filters,pages[s],controller.signal,s).then(p=>[s,p] as const));
    Promise.all([loadSummary(controller.signal,filters.archived),Promise.all(reads)]).then(([summary,pairs])=>{if(!controller.signal.aborted)setResults({key,summary,pages:Object.fromEntries(pairs)});}).catch(e=>{if(controller.signal.aborted)return;if(e instanceof ApiError&&e.status===401)window.location.replace('/login');else setError(e instanceof Error?e.message:'Unable to load pipeline.');});return()=>controller.abort();
  },[key,mode,filters,pages,tablePage]);
  function apply(next:Filters){setFilters({...next,q:next.q.trim()});setPages(FIRST);setTablePage(1);setRevision(n=>n+1);}
  function submit(e:FormEvent){e.preventDefault();if(writing.current)return;if(!validFilters(draft)){setNotice('Enter valid UTC dates with the start before the end.');return;}setNotice('');apply(draft);}
  function changeMode(next:Mode){if(writing.current)return;setMode(next);setPages(FIRST);setTablePage(1);}
  function open(lead:Lead,element:HTMLElement){opener.current=element;setSelected(lead.reference);}
  function close(){if(writing.current)return;setSelected(null);requestAnimationFrame(()=>opener.current?.focus());}
  function handleError(e:unknown){if(e instanceof ApiError&&e.status===401){window.location.replace('/login');return 'Session expired.';}if(e instanceof ApiError&&e.status===409)return 'This lead changed on the server. The latest state is being loaded; review it before trying again.';return e instanceof Error?`${e.message} Refresh and check the latest state before retrying.`:'Request failed. Check the latest state before retrying.';}
  async function update(lead:Lead,next:Stage){
    if(writing.current||!current||lead.archived||!canMove(lead.stage,next))return false;
    if(next==='won'&&!window.confirm('Mark this lead as won and create or link a client record?'))return false;
    writing.current=true;setPending(true);setNotice('');const snapshot=current;
    // Optimistic projection of the visible page only. The server refresh is authoritative.
    const projected={...snapshot.pages};
    if(projected.table)projected.table={...projected.table,results:optimistic(projected.table.results,lead,next).filter(r=>!filters.stage||r.stage===filters.stage)};
    if(projected[lead.stage]){const p=projected[lead.stage]!;projected[lead.stage]={...p,results:p.results.filter(r=>r.reference!==lead.reference)};}
    if(projected[next]){const p=projected[next]!;if(p.page===1)projected[next]={...p,results:[{...lead,stage:next},...p.results.filter(r=>r.reference!==lead.reference)].slice(0,25)};}
    setResults({...snapshot,pages:projected});
    try{await moveLead(lead,next);if(live.current)setNotice(`Moved to ${LABEL[next]}.`);return true;}
    catch(e){if(live.current){setResults(snapshot);setNotice(handleError(e));}return false;}
    finally{writing.current=false;if(live.current){setPending(false);setRevision(n=>n+1);}}
  }
  async function note(lead:Lead,message:string){if(writing.current||!current)return false;writing.current=true;setPending(true);setNotice('');try{await addNote(lead,message);if(live.current)setNotice('Note added.');return true;}catch(e){if(live.current)setNotice(handleError(e));return false;}finally{writing.current=false;if(live.current){setPending(false);setRevision(n=>n+1);}}}
  async function assign(lead:Lead,assigneeId:string|null){
    if(writing.current||!current)return false;
    writing.current=true;setPending(true);setNotice('');
    try{await assignLead(lead,assigneeId);if(live.current)setNotice(assigneeId?'Assignment updated.':'Lead unassigned.');return true;}
    catch(e){if(live.current)setNotice(handleError(e));return false;}
    finally{writing.current=false;if(live.current){setPending(false);setRevision(n=>n+1);}}
  }
  async function archive(lead:Lead){
    if(writing.current||!current||!canManage)return;
    if(!window.confirm(lead.archived?'Restore this lead to the active pipeline?':'Archive this lead? It will disappear from the active pipeline and staff access.'))return;
    writing.current=true;setPending(true);setNotice('');
    try{await archiveLead(lead,!lead.archived);if(live.current){setSelected(null);setNotice(lead.archived?'Lead restored.':'Lead archived.');}}
    catch(e){if(live.current)setNotice(handleError(e));}
    finally{writing.current=false;if(live.current){setPending(false);setRevision(n=>n+1);}}
  }
  async function download(){
    if(writing.current||!current)return;
    if(!window.confirm('Export matching leads (including contact data) to this device?'))return;
    writing.current=true;setPending(true);setNotice('');try{await exportLeads(filters);if(live.current)setNotice('CSV export downloaded. Store it securely.');}catch(e){if(live.current)setNotice(handleError(e));}finally{writing.current=false;if(live.current)setPending(false);}
  }
  function savedLead(lead:Lead){setCreating(false);setNotice('Lead created.');setSelected(lead.reference);setDraft(EMPTY);apply(EMPTY);}
  function toggleArchive(){const next:Filters={...filters,archived:filters.archived?'':'1'};setDraft(next);apply(next);setSelected(null);setNotice('');}
  function begin(e:DragEvent,lead:Lead){if(disabled||lead.archived){e.preventDefault();return;}dragRef.current=lead;setDragged(lead);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','cedar-lead');}
  function end(){dragRef.current=null;setDragged(null);setTarget(null);}
  function drop(e:DragEvent,stage:Stage){e.preventDefault();const lead=dragRef.current;end();if(lead&&!disabled&&canMove(lead.stage,stage))void update(lead,stage);}
  function save(){try{localStorage.setItem(storageKey,JSON.stringify({mode,service:filters.service,stage:filters.stage,from:filters.from,to:filters.to,source:filters.source,priority:filters.priority}));setSaved(true);setNotice('View saved on this browser. Search terms are not stored.');}catch{setNotice('Browser storage is unavailable.');}}
  function restore(){try{const v=savedView(localStorage.getItem(storageKey));if(!v){setNotice('No saved view.');return;}setMode(v.mode);setDraft({...v.filters,archived:filters.archived});apply({...v.filters,archived:filters.archived});setNotice('Saved view restored.');}catch{setNotice('Browser storage is unavailable.');}}
  function pager(p:Page<Lead>,go:(n:number)=>void){return <div className={styles.pager}><button disabled={disabled||p.page<=1} onClick={()=>go(p.page-1)} aria-label="Previous page">‹</button><span>Page {p.page}</span><button disabled={disabled||!p.hasMore||p.page>=1000} onClick={()=>go(p.page+1)} aria-label="Next page">›</button></div>;}
  return <section className={styles.pipeline} aria-label="Sales pipeline">
    <div className={styles.top}><div className={styles.segment} aria-label="View mode"><button aria-pressed={mode==='board'} disabled={disabled} onClick={()=>changeMode('board')}>Board</button><button aria-pressed={mode==='table'} disabled={disabled} onClick={()=>changeMode('table')}>Table</button></div><span className={styles.count}>{current?`${current.summary.total} total leads`:'Sales pipeline'}</span><div className={styles.tools}>{canManage&&<><button className={styles.primary} disabled={pending} onClick={()=>setCreating(true)}>+ New lead</button><button disabled={disabled} aria-pressed={!!filters.archived} onClick={toggleArchive}>{filters.archived?"Active leads":"Archived leads"}</button></>}<button disabled={disabled} onClick={()=>void download()}>Export CSV</button><button disabled={disabled} onClick={save}>Save view</button><button disabled={disabled||!saved} onClick={restore}>Saved view</button><button disabled={pending} onClick={()=>setRevision(n=>n+1)}>Refresh</button></div></div>
    <form className={styles.filters} onSubmit={submit}><label className={styles.search}>Search <span>⌘K / Ctrl K</span><input ref={search} aria-label="Search leads" placeholder="Name, company or email" maxLength={120} value={draft.q} disabled={pending} onChange={e=>setDraft({...draft,q:e.target.value})}/></label><label>Service<select value={draft.service} disabled={pending} onChange={e=>setDraft({...draft,service:e.target.value as Filters['service']})}><option value="">All services</option>{SERVICES.map(s=><option key={s} value={s}>{serviceLabels[s]}</option>)}</select></label><label>Stage<select value={draft.stage} disabled={pending} onChange={e=>setDraft({...draft,stage:e.target.value as Filters['stage']})}><option value="">All stages</option>{STAGES.map(s=><option key={s} value={s}>{LABEL[s]}</option>)}</select></label><label>From (UTC)<input type="date" value={draft.from} disabled={pending} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To (UTC)<input type="date" value={draft.to} disabled={pending} onChange={e=>setDraft({...draft,to:e.target.value})}/></label><label htmlFor="pipeline-source">Source<select id="pipeline-source" value={draft.source||''} disabled={pending} onChange={e=>setDraft({...draft,source:e.target.value})}><option value="">All sources</option>{SOURCES.map(s=><option key={s} value={s}>{s}</option>)}</select></label><label htmlFor="pipeline-priority">Priority<select id="pipeline-priority" value={draft.priority||''} disabled={pending} onChange={e=>setDraft({...draft,priority:e.target.value})}><option value="">All priorities</option>{PRIORITIES.map(s=><option key={s} value={s}>{s}</option>)}</select></label><div className={styles.filterButtons}><button disabled={pending} className={styles.primary}>Apply</button><button type="button" disabled={pending} onClick={()=>{const next={...EMPTY,archived:filters.archived};setDraft(next);apply(next);}}>Clear</button></div></form>
    <div className={styles.hint}>{filters.archived?"Archived leads are read-only until restored.":"Drag a lead to an allowed stage, or open its details to move it using a button. Column totals include all active leads, not just filtered results."}</div>
    {notice&&<p className={styles.notice} role="status">{notice}</p>}{error&&<p className={styles.notice} role="alert">{error} <button onClick={()=>setRevision(n=>n+1)}>Retry</button></p>}
    {loading?<p role="status" className={styles.empty}>Loading pipeline…</p>:current&&<div aria-busy={pending}>{mode==='board'?<div className={styles.board} tabIndex={0} aria-label="Pipeline columns">{columns.map(s=>{const p=current.pages[s];if(!p)return null;const allowed=!!dragged&&canMove(dragged.stage,s);return <section key={s} className={styles.column} data-drop={target===s&&allowed} data-allowed={allowed} onDragOver={e=>{if(dragRef.current&&!disabled&&canMove(dragRef.current.stage,s)){e.preventDefault();e.dataTransfer.dropEffect='move';setTarget(s);}}} onDragLeave={e=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))setTarget(null);}} onDrop={e=>drop(e,s)} aria-label={`${LABEL[s]} column`}><header className={styles.columnHeader}><span className={styles.dot} data-stage={s}/><h2>{LABEL[s]}</h2><span>{current.summary.stages[s]}</span></header><div className={styles.cards}>{p.results.map(l=><article className={styles.card} key={l.reference} draggable={!disabled&&!l.archived&&STAGES.some(t=>canMove(l.stage,t))} onDragStart={e=>begin(e,l)} onDragEnd={end}><button className={styles.leadTitle} onClick={e=>open(l,e.currentTarget)}>{l.name||l.company||'Unnamed lead'} <span aria-hidden="true">↗</span></button><p>{l.company||'Independent'}</p><small>{l.email}</small><small className={styles.assigneeText}>{l.assignedTo?.username?`Assigned to ${l.assignedTo.username}`:"Unassigned"}</small><div className={styles.leadFacts}>{l.priority&&<span data-priority={l.priority}>{l.priority}</span>}{l.source&&<span>{l.source}</span>}{l.expectedValue!=null&&<span>{l.currency} {l.expectedValue}</span>}</div><div className={styles.cardDate}>{formatDate(l.createdAt)}</div></article>)}{!p.results.length&&<p className={styles.emptyColumn}>No matching leads</p>}</div>{pager(p,n=>setPages(old=>({...old,[s]:n})))}</section>;})}</div>:current.pages.table&&<div className={styles.tableWrap}><table><thead><tr><th>Name / company</th><th>Email</th><th>Stage</th><th>Assignee</th><th>Priority / value</th><th>Received</th></tr></thead><tbody>{current.pages.table.results.map(l=><tr key={l.reference}><td><button className={styles.leadTitle} onClick={e=>open(l,e.currentTarget)}>{l.name||l.company||'Unnamed lead'}</button><small>{l.company}</small></td><td>{l.email}</td><td><span className={styles.stagePill} data-stage={l.stage}>{LABEL[l.stage]}</span></td><td>{l.assignedTo?.username||"Unassigned"}</td><td>{l.priority||"—"}<small>{l.expectedValue!=null?`${l.currency} ${l.expectedValue}`:""}</small></td><td>{formatDate(l.createdAt)}</td></tr>)}</tbody></table>{!current.pages.table.results.length&&<p className={styles.empty}>No matching leads.</p>}{pager(current.pages.table,setTablePage)}</div>}</div>}
    {creating&&<LeadEditor onClose={()=>setCreating(false)} onSaved={savedLead} onConflict={()=>setRevision(n=>n+1)}/>}
    {selected&&<LeadDrawer key={selected} reference={selected} revision={revision} busy={disabled} notice={notice||error} onClose={close} onMove={update} onNote={note} onAssign={assign} onArchive={archive} onEdited={()=>{setNotice("Lead updated.");setRevision(n=>n+1);}} onConflict={()=>setRevision(n=>n+1)}/>}
  </section>;
}
