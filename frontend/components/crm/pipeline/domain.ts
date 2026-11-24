export const STAGES = ['new', 'qualified', 'proposal', 'won', 'lost'] as const;
export type Stage = typeof STAGES[number];
export const LABEL: Record<Stage, string> = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
// UI hints only; Django remains authoritative for transitions.
export const TRANSITIONS: Record<Stage, readonly Stage[]> = {new:['qualified','lost'], qualified:['new','proposal','lost'], proposal:['qualified','won','lost'], won:[], lost:['qualified']};
export const SERVICES = ['website','software','ai','support','explore'] as const;
export type Service = typeof SERVICES[number];
export type Assignee = {id:string;username:string};
export const SOURCES=['website','linkedin','email','whatsapp','referral','other'] as const;
export const PRIORITIES=['low','normal','high','urgent'] as const;
export const CURRENCIES=['USD','THB','SGD','EUR','GBP','AUD','NZD','AED'] as const;
export type LeadFields={name:string;company:string;email:string;overview:string;service:string;source:string;priority:string;expectedValue:string|null;currency:string;expectedCloseDate:string|null;tags:string[]};
export type Lead = {reference:string;name:string;company:string;email:string;stage:Stage;version:number;clientId:string|null;createdAt:string;assignedTo?:Assignee|null;service?:string;source?:string;priority?:string;expectedValue?:string|null;currency?:string;expectedCloseDate?:string|null;tags?:string[];archived?:boolean};
export type Detail = Lead & {overview:string;canAssign?:boolean;canEdit?:boolean;canArchive?:boolean;canEditEmail?:boolean;allowedStages:Stage[];activity:{id:string;action:string;message:string;createdAt:string}[]};
export type Page<T> = {results:T[];page:number;hasMore:boolean};
export type Summary = {stages:Record<Stage,number>;total:number;clients:number};
export type Filters = {q:string;service:Service|'';from:string;to:string;stage:Stage|'';source?:string;priority?:string;archived?:''|'1'};
export const EMPTY: Filters = {q:'',service:'',from:'',to:'',stage:''};
export type Mode = 'board'|'table';
export type ColumnPages = Record<Stage,number>;
export const FIRST: ColumnPages = {new:1,qualified:1,proposal:1,won:1,lost:1};
export function canMove(from:Stage,to:Stage){return TRANSITIONS[from]?.includes(to)??false;}
export function query(filters:Filters,page:number,stage?:Stage){
  const params = new URLSearchParams({page:String(page)});
  const effectiveStage = stage??filters.stage;
  for(const [k,v] of Object.entries({...filters,stage:effectiveStage})) if(v)params.set(k,v);
  return params.toString();
}
export function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false; const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&value.slice(0,4)>='1900'&&value.slice(0,4)<='9998';}
export function validFilters(f:Filters){return (!f.from||validDate(f.from))&&(!f.to||validDate(f.to))&&(!f.from||!f.to||f.from<=f.to);}
export function savedView(raw:string|null):{mode:Mode;filters:Filters}|null{
  try {const v=JSON.parse(raw||'null');if(!v||!['board','table'].includes(v.mode))return null;
    const f:Filters={...EMPTY,service:SERVICES.includes(v.service)?v.service:'',stage:STAGES.includes(v.stage)?v.stage:'',from:typeof v.from==='string'?v.from:'',to:typeof v.to==='string'?v.to:'',source:SOURCES.includes(v.source)?v.source:'',priority:PRIORITIES.includes(v.priority)?v.priority:''};
    return validFilters(f)?{mode:v.mode,filters:f}:null;
  }catch{return null;}
}
export function optimistic(rows:Lead[],lead:Lead,to:Stage){return rows.map(r=>r.reference===lead.reference?{...r,stage:to}:r);}
