import {wordCount,type RichNode} from './rich-document.ts';
export type BlogFields = { title:string; summary:string; category:string; tags:string[]; sections:{heading:string;body:string}[]; seoTitle:string; seoDescription:string; cover:string; document?:RichNode; author?:string; focusKeyword?:string; noindex?:boolean; coverAlt?:string };
export type BlogStatus = 'draft'|'published'|'archived';
export type BlogRow = {slug:string; title:string; category:string; status:BlogStatus; version:number; updatedAt:string; hasUnpublishedChanges:boolean};
export type BlogRevision = {version:number;status:BlogStatus;action:string;createdAt:string};
export type BlogDetail = BlogRow & {draft:BlogFields;history:BlogRevision[]};
export type PublicPost = Pick<BlogFields,'title'|'summary'|'category'|'cover'> & {slug:string;minutes:number;publishedAt:string;modifiedAt?:string;noindex?:boolean;author?:string;coverAlt?:string};
export type PublicArticle = PublicPost & Pick<BlogFields,'sections'|'tags'|'seoTitle'|'seoDescription'|'document'>;
export const covers = [{id:'',label:'No cover'},{id:'web',label:'Web / interface'},{id:'software',label:'Software / systems'},{id:'ai',label:'AI / networks'}] as const;
export function uploadedCover(id:string){return /^upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)&&id.length===43;}
export function coverPath(id:string,privatePreview=false){if(uploadedCover(id))return `/api/v1/${privatePreview?'staff':'public'}/blog/cover/${id.slice(7)}`;return covers.some(c=>c.id===id&&id!=='')?`/blog-covers/${id}.svg`:null;}
export function blankArticle():BlogFields{return {title:'',summary:'',category:'',tags:[],sections:[{heading:'',body:''}],seoTitle:'',seoDescription:'',cover:''};}
export function validSlug(slug:string){return slug.length<=100&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&!/[\r\n]/.test(slug);}
export function xml(value:string){const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};return value.replace(/[&<>"']/g,c=>entities[c]??c);}
export function readingMinutes(fields:BlogFields){if(fields.document)return Math.max(1,Math.ceil(wordCount(fields.document)/200));return Math.max(1,Math.ceil(fields.sections.reduce((n,s)=>n+(s.body.trim()?s.body.trim().split(/\s+/).length:0),0)/200));}
