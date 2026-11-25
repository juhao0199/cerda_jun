import type {BlogFields} from './blog-content.ts';
import {legacyDocument,safeLink,type RichNode} from './rich-document.ts';
import {nodeText,type AnswerCheck} from './answer-optimization.ts';
export type OptimizationMode='seo'|'aeo'|'geo';
export const optimizationConfig={
  seo:{title:'SEO center',editor:'SEO editor',description:'Search metadata, page discoverability and editorial search checks.',metric:'Search impressions',secondary:'Organic clicks'},
  aeo:{title:'AEO center',editor:'AEO editor',description:'Answer coverage, customer questions and direct-answer optimization.',metric:'Answer placements',secondary:'Answer referrals'},
  geo:{title:'GEO center',editor:'GEO editor',description:'Evidence, brand context and generative search citation observations.',metric:'Brand mentions',secondary:'Citation observations'},
} as const;
export const sitePages=[{path:'/',name:'Home · services, process and FAQ'},{path:'/blog',name:'Blog index'},{path:'/privacy',name:'Privacy information'}] as const;
export function geoChecks(fields:BlogFields):AnswerCheck[]{
  const doc=fields.document??legacyDocument(fields.sections),blocks=doc.content??[];
  const links=new Set<string>();let headedEvidence=false;
  for(let i=0;i<blocks.length;i++){const n=blocks[i];if(n.type==='heading'&&/^(evidence|sources?|references?|methodology|case study|results|limitations)(?:\b|:)/i.test(nodeText(n).trim())&&blocks[i+1]?.type==='paragraph'&&!!nodeText(blocks[i+1]).trim())headedEvidence=true;}
  function walk(n:RichNode){for(const m of n.marks??[]){const h=m.attrs?.href;if(m.type==='link'&&safeLink(h)&&/^https:\/\//i.test(h))links.add(h);}for(const c of n.content??[])walk(c);}walk(doc);
  const body=blocks.map(nodeText).join(' ');
  return [
    {label:'Named studio or author',pass:/cedar\s*&\s*cursor/i.test(body)||!!fields.author?.trim(),guidance:'Identify who makes the claim; use the actual responsible author or organization.'},
    {label:'Evidence or methodology section',pass:headedEvidence,guidance:'Explain how results or facts were obtained, with dates and limitations when relevant.'},
    {label:'Linked HTTPS references',pass:links.size>0,guidance:'Add relevant verifiable sources. Links are not independently fact-checked.'},
    {label:'Structured comparisons or steps',pass:blocks.some(n=>['table','orderedList','bulletList'].includes(n.type)),guidance:'Use a table or list when it makes factual comparisons clearer.'},
    {label:'Indexing permitted by draft',pass:!fields.noindex,guidance:'This is a draft preference, not proof of crawling or AI inclusion.'},
  ];
}
export function appendEvidence(fields:BlogFields,claim:string,context:string,source:string,url:string):BlogFields{
  const c=claim.trim(),d=context.trim(),s=source.trim(),h=url.trim();
  if(!c||Array.from(c).length>4000||!d||Array.from(d).length>4000)throw new Error('Enter the factual statement and its context (1–4,000 characters each).');
  if(!s||Array.from(s).length>160||/[\r\n]/.test(s)||!safeLink(h)||!/^https:\/\//i.test(h))throw new Error('Enter a source name and valid HTTPS URL.');
  const p=(t:string):RichNode=>({type:'paragraph',content:t.split('\n').flatMap((part,i)=>[...(i?[{type:'hardBreak'}]:[]),...(part?[{type:'text',text:part}]:[])])});
  const doc=fields.document??legacyDocument(fields.sections);
  return {...fields,sections:[],document:{type:'doc',content:[...(doc.content??[]),{type:'heading',attrs:{level:2},content:[{type:'text',text:'Evidence and context'}]},p(c),p(d),{type:'paragraph',content:[{type:'text',text:'Source: '},{type:'text',text:s,marks:[{type:'link',attrs:{href:h}}]}]}]}};
}
