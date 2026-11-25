import type {BlogFields} from './blog-content.ts';
import {legacyDocument,safeLink,type RichNode} from './rich-document.ts';

export type AnswerCheck={label:string;pass:boolean;guidance:string};
export function nodeText(node:RichNode):string {
  return node.type==='hardBreak'?'\n':(node.text??'')+(node.content??[]).map(nodeText).join('');
}
export function answerChecks(fields:BlogFields):AnswerCheck[]{
  const document=fields.document??legacyDocument(fields.sections);
  const blocks=document.content??[];
  const opening=blocks[0]?.type==='paragraph'?nodeText(blocks[0]).trim():'';
  const questions=blocks.filter((n,i)=>n.type==='heading'&&/[?？]\s*$/u.test(nodeText(n))&&blocks[i+1]?.type==='paragraph'&&!!nodeText(blocks[i+1]).trim());
  const sources=new Set<string>();
  function walk(n:RichNode){for(const mark of n.marks??[]){const href=mark.attrs?.href;if(mark.type==='link'&&safeLink(href)&&/^https:\/\//i.test(href))sources.add(href);}for(const c of n.content??[])walk(c);}
  walk(document);
  const length=Array.from(opening).length;
  return [
    {label:'Concise opening paragraph',pass:length>=40&&length<=500,guidance:'Start with a standalone answer to the reader’s main question. Check accuracy and relevance manually.'},
    {label:'Question followed by an answer',pass:questions.length>0,guidance:'Where useful, use a natural question as a heading followed by a direct answer. Do not force FAQs.'},
    {label:'Lists or tables for comparisons',pass:blocks.some(n=>['bulletList','orderedList','table'].includes(n.type)),guidance:'Use structured steps or comparisons when the topic benefits from them.'},
    {label:'External HTTPS reference',pass:sources.size>0,guidance:'Add relevant, verifiable sources where claims require evidence. A link alone does not prove credibility.'},
    {label:'Explicit author attribution',pass:!!fields.author?.trim(),guidance:'Identify the actual author or responsible organization.'},
    {label:'Indexing permitted by draft setting',pass:!fields.noindex,guidance:'Review noindex if this page is meant to be discoverable. This does not verify crawling or inclusion.'},
  ];
}
function paragraph(value:string):RichNode {
  const text=value.trim();
  if(!text||Array.from(text).length>4000)throw new Error('Enter 1–4,000 characters.');
  return {type:'paragraph',content:text.split('\n').flatMap((part,i)=>[...(i?[{type:'hardBreak'}]:[]),...(part?[{type:'text',text:part}]:[])])};
}
function withBlocks(fields:BlogFields,update:(blocks:RichNode[])=>RichNode[]):BlogFields{
  const doc=fields.document??legacyDocument(fields.sections);
  return {...fields,sections:[],document:{type:'doc',content:update(doc.content??[])}};
}
export function insertOpeningAnswer(fields:BlogFields,answer:string):BlogFields {
  const block=paragraph(answer);
  return withBlocks(fields,blocks=>[block,...blocks]);
}
export function appendQuestionAnswer(fields:BlogFields,question:string,answer:string):BlogFields{
  const q=question.trim();
  if(!q||Array.from(q).length>160||!/[?？]$/u.test(q)||/[\r\n]/u.test(q))throw new Error('Enter a question ending with a question mark (max 160 characters).');
  const heading:RichNode={type:'heading',attrs:{level:2},content:[{type:'text',text:q}]};
  const body=paragraph(answer);
  return withBlocks(fields,blocks=>[...blocks,heading,body]);
}
export function appendReference(fields:BlogFields,label:string,href:string):BlogFields{
  const text=label.trim(),url=href.trim();
  if(!text||Array.from(text).length>160||/[\r\n]/u.test(text)||!safeLink(url)||!/^https:\/\//i.test(url))throw new Error('Enter a source name and a valid HTTPS URL.');
  const block:RichNode={type:'paragraph',content:[{type:'text',text:'Source: '},{type:'text',text,marks:[{type:'link',attrs:{href:url}}]}]};
  return withBlocks(fields,blocks=>[...blocks,block]);
}
