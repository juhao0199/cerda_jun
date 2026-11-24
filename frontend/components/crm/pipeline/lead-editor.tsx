'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ApiError} from '@/lib/session-api';
import {createLead,editLead} from './api';
import {CURRENCIES,PRIORITIES,SOURCES,SERVICES,type Detail,type Lead,type LeadFields} from './domain';
import styles from './pipeline.module.css';

const label=(value:string)=>(({website:'Website',linkedin:'LinkedIn',whatsapp:'WhatsApp',email:'Email',referral:'Referral',other:'Other',low:'Low',normal:'Normal',high:'High',urgent:'Urgent'} as Record<string,string>)[value]||value);
export function LeadEditor({detail,onClose,onSaved,onConflict}:{detail?:Detail;onClose:()=>void;onSaved:(lead:Lead)=>void;onConflict:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);const requestId=useRef('');const busy=useRef(false);
  const [pending,setPending]=useState(false);const [error,setError]=useState('');const [duplicate,setDuplicate]=useState(false);const [stale,setStale]=useState(false);
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>{if(el?.open)el.close();};},[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy.current||stale)return;const f=new FormData(e.currentTarget);const get=(key:string)=>String(f.get(key)||'').trim();
    const fields:LeadFields={name:get('name'),company:get('company'),email:detail&&!detail.canEditEmail?detail.email:get('email'),overview:get('overview'),service:get('service'),source:get('source'),priority:get('priority'),expectedValue:get('expectedValue')||null,currency:get('currency'),expectedCloseDate:get('expectedCloseDate')||null,tags:get('tags').split(',').map(t=>t.trim()).filter(Boolean)};
    const allowDuplicate=f.get('allowDuplicate')==='on';
    if(fields.tags.length>10||fields.tags.some(t=>t.length>32)||new Set(fields.tags.map(t=>t.toLowerCase())).size!==fields.tags.length){setError('Use up to 10 distinct tags, each at most 32 characters.');return;}
    if(!requestId.current)requestId.current=crypto.randomUUID();
    const body={...fields,allowDuplicate,...(detail?{reference:detail.reference,version:detail.version}:{requestId:requestId.current})};
    if(new TextEncoder().encode(JSON.stringify(body)).length>8192){setError('The request is too large. Shorten the brief or tags.');return;}
    busy.current=true;setPending(true);setError('');
    try{const result=detail?await editLead(detail,fields,allowDuplicate):await createLead(fields,requestId.current,allowDuplicate);onSaved(result);}
    catch(e){if(e instanceof ApiError&&e.status===401){window.location.replace('/login');return;}if(e instanceof ApiError&&e.status===409){if(e.message==='A lead or client with this email already exists.'){setDuplicate(true);setError('This email already exists. Review the existing lead or explicitly confirm a separate opportunity.');}else{setStale(true);setError('The record or request changed. Close this form and reload before retrying.');}}else setError(e instanceof Error?e.message:'Unable to save. Check the latest data before retrying.');}
    finally{busy.current=false;setPending(false);}
  }
  function close(){if(busy.current)return;if(stale)onConflict();onClose();}
  return <dialog ref={dialog} className={`${styles.drawer} ${styles.editorDialog}`} aria-labelledby="crm-editor-title" onCancel={e=>{e.preventDefault();close();}}>
    <div className={styles.drawerHeader}><div><small>Sales workspace</small><h2 id="crm-editor-title">{detail?'Edit lead':'New lead'}</h2></div><button type="button" aria-label="Close lead editor" disabled={pending} onClick={close}>×</button></div>
    <form className={styles.editorForm} onSubmit={submit}>
      <fieldset disabled={pending||stale}><legend>Contact</legend><label htmlFor="crm-edit-name">Name</label><input id="crm-edit-name" name="name" defaultValue={detail?.name} required maxLength={120}/><label htmlFor="crm-edit-email">Email</label><input id="crm-edit-email" name="email" type="email" defaultValue={detail?.email} readOnly={!!detail&&!detail.canEditEmail} required maxLength={254}/><label htmlFor="crm-edit-company">Company</label><input id="crm-edit-company" name="company" defaultValue={detail?.company} maxLength={160}/>
      <h3 className={styles.editorLegend}>Opportunity</h3><label htmlFor="crm-edit-service">Service</label><select id="crm-edit-service" name="service" defaultValue={detail?.service||''}><option value="">Not specified</option>{SERVICES.map(s=><option key={s} value={s}>{s}</option>)}</select><div className={styles.editorGrid}><label htmlFor="crm-edit-source">Source</label><label htmlFor="crm-edit-priority">Priority</label><select id="crm-edit-source" name="source" defaultValue={detail?.source||'other'}>{SOURCES.map(s=><option key={s} value={s}>{label(s)}</option>)}</select><select id="crm-edit-priority" name="priority" defaultValue={detail?.priority||'normal'}>{PRIORITIES.map(s=><option key={s} value={s}>{label(s)}</option>)}</select><label htmlFor="crm-edit-value">Expected value</label><label htmlFor="crm-edit-currency">Currency</label><input id="crm-edit-value" name="expectedValue" inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" maxLength={13} defaultValue={detail?.expectedValue??''}/><select id="crm-edit-currency" name="currency" defaultValue={detail?.currency||'USD'}>{CURRENCIES.map(s=><option key={s}>{s}</option>)}</select></div>
      <label htmlFor="crm-edit-close">Expected close date</label><input id="crm-edit-close" name="expectedCloseDate" type="date" min="1900-01-01" max="9998-12-31" defaultValue={detail?.expectedCloseDate??''}/><label htmlFor="crm-edit-tags">Tags (comma separated)</label><input id="crm-edit-tags" name="tags" maxLength={330} defaultValue={detail?.tags?.join(', ')||''}/><label htmlFor="crm-edit-brief">Project brief</label><textarea id="crm-edit-brief" name="overview" rows={5} maxLength={5000} defaultValue={detail?.overview}/>
      {duplicate&&<label className={styles.duplicate}><input type="checkbox" name="allowDuplicate"/> Confirm a separate opportunity for this email</label>}</fieldset>
      {error&&<p role="alert" className={styles.notice}>{error}</p>}<div className={styles.editorActions}><button type="button" onClick={close} disabled={pending}>Cancel</button><button className={styles.primary} disabled={pending||stale}>{pending?'Saving…':detail?'Save changes':'Create lead'}</button></div>
    </form>
  </dialog>;
}
