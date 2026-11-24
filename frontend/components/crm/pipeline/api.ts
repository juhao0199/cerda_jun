import {api,ApiError} from '@/lib/session-api';
import {query,type Filters,type Stage,type Lead,type Detail,type Page,type Summary,type Assignee,type LeadFields} from './domain';
export const loadPage=(f:Filters,page:number,signal:AbortSignal,stage?:Stage)=>api<Page<Lead>>(`staff/crm/leads?${query(f,page,stage)}`,{signal});
export const loadSummary=(signal:AbortSignal,archived?:string)=>api<Summary>(`staff/crm/overview${archived?'?archived=1':''}`,{signal});
export const loadDetail=(reference:string,signal:AbortSignal)=>api<Detail>(`staff/crm/leads/${encodeURIComponent(reference)}`,{signal});
async function write<T>(endpoint:'stage'|'notes'|'assign'|'create'|'edit'|'archive',body:Record<string,unknown>){
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  return api<T>(`staff/crm/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},body:JSON.stringify(body)});
}
export const moveLead=(lead:Lead,stage:Stage)=>write<Lead>('stage',{reference:lead.reference,version:lead.version,stage});
export const addNote=(lead:Lead,message:string)=>write<{version:number}>('notes',{reference:lead.reference,version:lead.version,message});

export const assignLead=(lead:Lead,assigneeId:string|null)=>write<Lead>('assign',{reference:lead.reference,version:lead.version,assigneeId});
export const loadAssignees=(search:string,page:number,signal:AbortSignal)=>api<Page<Assignee>>(`staff/team?${new URLSearchParams({search,page:String(page),role:'staff',status:'active'})}`,{signal});

export const createLead=(fields:LeadFields,requestId:string,allowDuplicate:boolean)=>write<Lead>('create',{...fields,requestId,allowDuplicate});
export const editLead=(lead:Lead,fields:LeadFields,allowDuplicate:boolean)=>write<Lead>('edit',{...fields,reference:lead.reference,version:lead.version,allowDuplicate});
export const archiveLead=(lead:Lead,archived:boolean)=>write<Lead>('archive',{reference:lead.reference,version:lead.version,archived});
export async function exportLeads(filters:Filters){
  const params=new URLSearchParams(query(filters,1));params.delete('page');
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  const response=await fetch(`/api/v1/staff/crm/export?${params}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken,Accept:'text/csv'},body:'{}'});
  if(!response.ok){const body=await response.json().catch(()=>null);throw new ApiError(response.status,typeof body?.error==='string'?body.error:'Export failed.');}
  if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new Error('Unexpected export response.');
  const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download='cedar-leads.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
