export type RichMark = {type:string;attrs?:Record<string,unknown>};
export type RichNode = {type:string;text?:string;attrs?:Record<string,unknown>;marks?:RichMark[];content?:RichNode[]};
export function safeLink(value:unknown):value is string {
  if(typeof value!=='string'||value.length<1||value.length>2048||/[\s\x00-\x1f\x7f\\]/u.test(value))return false;
  if(value.startsWith('/')&&!value.startsWith('//'))return true;
  try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password&&/^https?:\/\//i.test(value);}catch{return false;}
}
function inline(text:string):RichNode[]{return text.split('\n').flatMap((part,i)=>[...(i?[{type:'hardBreak'}]:[]),...(part?[{type:'text',text:part}]:[])]);}
export function legacyDocument(sections:{heading:string;body:string}[]):RichNode {
  const content:RichNode[]=sections.flatMap(s=>[
    ...(s.heading?[{type:'heading',attrs:{level:2},content:inline(s.heading)}]:[]),
    ...s.body.split(/\n\s*\n/).filter(Boolean).map(p=>({type:'paragraph',content:inline(p)}))
  ]);
  return {type:'doc',content:content.length?content:[{type:'paragraph'}]};
}
export function wordCount(node:RichNode):number{return (node.text?.trim()?node.text.trim().split(/\s+/).length:0)+(node.content??[]).reduce((sum,n)=>sum+wordCount(n),0);}
export function hasContent(node:RichNode):boolean{return node.type==='studioImage'||!!node.text?.trim()||(node.content??[]).some(hasContent);}
