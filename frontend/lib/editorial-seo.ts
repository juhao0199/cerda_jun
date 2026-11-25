import type {BlogFields} from './blog-content.ts';
import type {RichNode} from './rich-document.ts';
export type Meta = Pick<BlogFields,'title'|'summary'|'seoTitle'|'seoDescription'|'cover'|'focusKeyword'|'noindex'|'coverAlt'>;
export type Check={label:string;pass:boolean};
const length=(s:string)=>Array.from(s).length;
const includes=(s:string,k:string)=>s.toLocaleLowerCase().includes(k.toLocaleLowerCase());
export function metadataChecks(f:Meta,slug:string):Check[]{
  const title=f.seoTitle.trim()||`${f.title} | Cedar & Cursor`, description=f.seoDescription.trim()||f.summary, keyword=f.focusKeyword?.trim()||'';
  return [{label:'Title is 30–60 characters',pass:length(title)>=30&&length(title)<=60},
    {label:'Description is 120–160 characters',pass:length(description)>=120&&length(description)<=160},
    {label:'URL uses lowercase words and hyphens',pass:slug.length<=100&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)},
    {label:'Cover has descriptive alt text',pass:!f.cover||!!f.coverAlt?.trim()},
    ...(keyword?[{label:'Focus phrase appears in title',pass:includes(title,keyword)},{label:'Focus phrase appears in description',pass:includes(description,keyword)}]:[])];
}
export function contentChecks(f:BlogFields):Check[]{
  const headings:number[]=[], images:RichNode[]=[], links:string[]=[], chunks:string[]=[];
  function visit(n:RichNode){if(n.text)chunks.push(n.text);if(n.type==='heading')headings.push(Number(n.attrs?.level));if(n.type==='studioImage')images.push(n);for(const m of n.marks??[])if(m.type==='link'&&typeof m.attrs?.href==='string')links.push(m.attrs.href);(n.content??[]).forEach(visit);}
  if(f.document)visit(f.document);else for(const s of f.sections){headings.push(2);chunks.push(s.heading,s.body);}
  const keyword=f.focusKeyword?.trim();
  return [{label:'Headings start at H2 and do not skip levels',pass:headings.length>0&&headings.every((h,i)=>h>=2&&h<=6&&(i===0?h===2:h<=headings[i-1]+1))},
    {label:'Body images have alt text',pass:images.every(n=>typeof n.attrs?.alt==='string'&&!!n.attrs.alt.trim())},
    {label:'Includes an internal link (where relevant)',pass:links.some(h=>h.startsWith('/')&&!h.startsWith('//'))},
    ...(keyword?[{label:'Focus phrase appears in article',pass:includes(chunks.join(' '),keyword)}]:[])];
}
