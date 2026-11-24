'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {api,ApiError} from '@/lib/session-api';
import styles from './workspace.module.css';
const stages=['new','qualified','proposal','won','lost'] as const;
type Stage=typeof stages[number];
type Lead={reference:string;name:string;company:string;email:string;stage:Stage;version:number;clientId:string|null;createdAt:string};
type Customer={id:string;name:string;company:string;email:string;createdAt:string};
type Detail=Lead & {overview:string;allowedStages:Stage[];activity:{id:string;action:string;message:string;createdAt:string}[]};
type Page<T>={results:T[];page:number;hasMore:boolean};
type Overview={stages:Record<Stage,number>;total:number;clients:number};
const label=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const date=(s:string)=>new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
async function write(path:string, data:Record<string,string|number>){
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  return api(`staff/crm/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},body:JSON.stringify(data)});
}
function failure(e:unknown){if(e instanceof ApiError&&e.status===401){window.location.replace('/login');return 'Session expired.';}return e instanceof Error?e.message:'Request failed.';}
export default function CRMWorkspace({mode}: {mode:'leads'|'clients'}){
  const tab=mode;
  const [stage,setStage]=useState<Stage|''>('');const [draft,setDraft]=useState('');const [query,setQuery]=useState('');const [page,setPage]=useState(1);
  const [overview,setOverview]=useState<Overview|null>(null);const [leads,setLeads]=useState<Lead[]>([]);const [clients,setClients]=useState<Customer[]>([]);const [more,setMore]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);const [detail,setDetail]=useState<Detail|null>(null);const [note,setNote]=useState('');const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const busy=useRef(false);const [error,setError]=useState('');const [revision,refresh]=useState(0);
  const reload=useCallback(()=>refresh(n=>n+1),[]);
  useEffect(()=>{if(tab==='clients')return;const controller=new AbortController();api<Overview>('staff/crm/overview',{signal:controller.signal}).then(setOverview).catch(e=>{if(!controller.signal.aborted)setError(failure(e));});return()=>controller.abort();},[revision,tab]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setLeads([]);setClients([]);setMore(false);const params=new URLSearchParams({page:String(page),q:query});if(tab==='leads'&&stage)params.set('stage',stage);
    async function load(){try{if(tab==='leads'){const data=await api<Page<Lead>>(`staff/crm/leads?${params}`,{signal:controller.signal});if(!controller.signal.aborted){setLeads(data.results);setMore(data.hasMore);}}else{const data=await api<Page<Customer>>(`staff/crm/clients?${params}`,{signal:controller.signal});if(!controller.signal.aborted){setClients(data.results);setMore(data.hasMore);}}}catch(e){if(!controller.signal.aborted)setError(failure(e));}finally{if(!controller.signal.aborted)setLoading(false);}}
    void load();return()=>controller.abort();},[tab,stage,query,page,revision]);
  useEffect(()=>{setDetail(null);if(!selected)return;const controller=new AbortController();api<Detail>(`staff/crm/leads/${selected}`,{signal:controller.signal}).then(d=>{if(!controller.signal.aborted)setDetail(d);}).catch(e=>{if(!controller.signal.aborted)setError(failure(e));});return()=>controller.abort();},[selected,revision]);
  async function change(next:Stage){if(!detail||busy.current)return;busy.current=true;setSaving(true);setError('');try{await write('stage',{reference:detail.reference,version:detail.version,stage:next});reload();}catch(e){if(e instanceof ApiError&&e.status===409)reload();setError(failure(e));}finally{busy.current=false;setSaving(false);}}
  async function add(event:FormEvent){event.preventDefault();if(!detail||busy.current||!note.trim())return;busy.current=true;setSaving(true);setError('');try{await write('notes',{reference:detail.reference,version:detail.version,message:note.trim()});setNote('');reload();}catch(e){if(e instanceof ApiError&&e.status===409)reload();setError(failure(e));}finally{busy.current=false;setSaving(false);}}
  return <section className={styles.crm} aria-label={tab==='leads'?'Lead records':'Client records'}>
    {tab==='leads'&&<div className={styles.metrics}>{stages.map(s=><button key={s} type="button" aria-pressed={stage===s} onClick={()=>{setStage(stage===s?'':s);setPage(1);setSelected(null);}}><span>{label(s)}</span><strong>{overview?.stages[s]??'—'}</strong></button>)}</div>}
    <div className={styles.toolbar}><div><strong>{tab==='leads'?'All inquiries':'Client directory'}</strong></div><form onSubmit={e=>{e.preventDefault();setError('');setPage(1);setQuery(draft.trim());setSelected(null);}}><input aria-label="Search CRM" placeholder="Search name, company or email" value={draft} maxLength={120} onChange={e=>setDraft(e.target.value)}/><button>Search</button></form><button type="button" className={styles.subtle} onClick={()=>{setError('');reload();}}>Refresh</button></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {tab==='leads'&&stage&&<p>Showing {label(stage)} <button className={styles.subtle} onClick={()=>{setStage('');setPage(1);}}>Clear filter</button></p>}
    <div className={styles.body}><div className={styles.list} aria-busy={loading}>{loading?<p role="status">Loading records…</p>:<div className={styles.table}><table><thead><tr><th>Name / company</th><th>Email</th><th>{tab==='leads'?'Stage':'Created'}</th></tr></thead><tbody>{tab==='leads'?leads.map(l=><tr key={l.reference} data-selected={selected===l.reference}><td><button className={styles.record} onClick={()=>{setSelected(l.reference);setNote('');}}>{l.name||l.company||'Unnamed lead'}</button><small>{l.company}</small></td><td>{l.email}</td><td>{label(l.stage)}</td></tr>):clients.map(c=><tr key={c.id}><td>{c.name||c.company||'Client'}<small>{c.company}</small></td><td>{c.email}</td><td>{date(c.createdAt)}</td></tr>)}</tbody></table>{(tab==='leads'?leads:clients).length===0&&<div className={styles.empty}><strong>No matching records</strong><p>{query||stage?'Try another search or filter.':tab==='leads'?'New website inquiries will appear here.':'Converted clients will appear here.'}</p></div>}</div>}
      <div className={styles.pager}><button disabled={page===1||loading} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page}</span><button disabled={!more||loading||page>=1000} onClick={()=>setPage(n=>n+1)}>Next</button></div></div>
      {selected&&tab==='leads'&&<aside className={styles.detail} aria-label="Lead details"><div className={styles.heading}><h3>{detail?.name||'Lead details'}</h3><button className={styles.subtle} onClick={()=>{setSelected(null);setNote('');}}>Close</button></div>{detail?<><small>{detail.email} · {date(detail.createdAt)}</small><p className={styles.brief}>{detail.overview||'No project brief.'}</p><h4>Pipeline · {label(detail.stage)}</h4><div className={styles.actions}>{detail.allowedStages.map(s=><button key={s} disabled={saving} onClick={()=>{if(s!=='won'||window.confirm('Mark this opportunity as won and create or link a client record?'))void change(s);}}>{s==='won'?'Win & convert':`Move to ${label(s)}`}</button>)}</div>{detail.clientId&&<p>Linked to a client record.</p>}<h4>Activity</h4><form onSubmit={add}><label htmlFor="crm-note">Internal follow-up note (no passwords or sensitive documents)</label><textarea id="crm-note" maxLength={1000} rows={3} value={note} onChange={e=>setNote(e.target.value)} required/><button disabled={saving||!note.trim()}>Add note</button></form><ol className={styles.timeline}>{detail.activity.map(a=><li key={a.id}><small>{date(a.createdAt)} · {a.action}</small><p>{a.message}</p></li>)}</ol></>:<p role="status">Loading details…</p>}</aside>}
    </div>
  </section>;
}
