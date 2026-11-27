import {projectTypes,goals,stages,availableFeatures,estimate} from './estimate.ts';
import type {Discovery,ProjectType,Goal,Stage,Feature} from './estimate.ts';
export const MAX_BODY_BYTES=24_000;
export type InquiryInput={requestId:string;overview:string;name:string;email:string;company:string;discovery:Discovery|null;consent:true;website:string};
export type Validation={ok:true;data:InquiryInput}|{ok:false;error:string};
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown,min:number,max:number)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateInquiry(value:unknown):Validation {
 const fail=(error:string):Validation=>({ok:false,error});
 if(!record(value))return fail('Invalid request.');
 if(typeof value.requestId!=='string'||!uuid.test(value.requestId))return fail('Invalid request reference.');
 if(!str(value.overview,10,5000)||!str(value.name,1,120)||!str(value.company,0,160))return fail('Please check your project and contact details.');
 if(!str(value.email,3,254)||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test((value.email as string).trim()))return fail('Please enter a valid email address.');
 if(value.consent!==true)return fail('Please confirm permission to contact you.');
 if(value.website!=='' )return fail('Unable to accept this request.');
 let discovery:Discovery|null=null;
 if(value.discovery!==null){
  const d=value.discovery;
  if(!record(d)||!projectTypes.some(x=>x.id===d.type)||!goals.some(x=>x.id===d.goal)||!stages.some(x=>x.id===d.stage)||!Array.isArray(d.features)||d.features.length>8)return fail('Invalid estimate configuration.');
  const type=d.type as ProjectType; const allowed=availableFeatures(type).map(x=>x.id);
  if(!d.features.every(x=>typeof x==='string'&&allowed.includes(x as Feature))||new Set(d.features).size!==d.features.length)return fail('Invalid estimate features.');
  discovery={type,goal:d.goal as Goal,stage:d.stage as Stage,features:[...d.features].sort() as Feature[]};
  if(!estimate(discovery))return fail('Incomplete estimate.');
 }
 return {ok:true,data:{requestId:value.requestId.toLowerCase(),overview:(value.overview as string).trim(),name:(value.name as string).trim(),email:(value.email as string).trim().toLowerCase(),company:(value.company as string).trim(),discovery,consent:true,website:''}};
}
export function inquiryPayload(input:InquiryInput){return {name:input.name,email:input.email,company:input.company,overview:input.overview,discovery:input.discovery,estimate:input.discovery?estimate(input.discovery):null,consentVersion:'inquiry-v1',currency:'USD'};}
