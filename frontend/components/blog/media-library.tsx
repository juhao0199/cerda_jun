'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,ApiError} from '@/lib/session-api';
import {coverPath,uploadedCover} from '@/lib/blog-content';
import {handleSessionError} from '@/components/workspace/shell';
import styles from './media.module.css';

export type MediaAsset={id:string;ref:string;filename:string;alt:string;caption:string;width:number;height:number;bytes:number;version:number;createdAt:string;storage:'database'|'object'};
type Detail=MediaAsset&{articles:string[];articleCount:number;revisionCount:number};
type Listing={results:MediaAsset[];page:number;hasMore:boolean;count:number;bytes:number};
const root='staff/blog/';
const size=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.ceil(n/1024)} KB`;
async function write<T>(endpoint:string,data:object){const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');return api<T>(root+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},body:JSON.stringify(data)});}
export async function uploadMedia(file:File){
  if(!file.size||file.size>5*1024*1024)throw new Error('Choose an image up to 5 MB.');
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  const name=Array.from(file.name).slice(0,120).join('')||'image.jpg';
  return api<{cover:string;width:number;height:number}>(root+'cover/upload?'+new URLSearchParams({name}),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-CSRFToken':csrfToken},body:file});
}
export function MediaLibrary({owner=false,onSelect}:{owner?:boolean;onSelect?:(asset:MediaAsset)=>void}){
  const [list,setList]=useState<Listing|null>(null),[search,setSearch]=useState(''),[query,setQuery]=useState({q:'',page:1}),[refresh,setRefresh]=useState(0);
  const [error,setError]=useState(''),[listError,setListError]=useState(''),[notice,setNotice]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[pending,setPending]=useState(false),[loadingDetail,setLoadingDetail]=useState(false);
  const [name,setName]=useState(''),[alt,setAlt]=useState(''),[caption,setCaption]=useState(''),[ratio,setRatio]=useState('original'),[rotation,setRotation]=useState(0);
  const busy=useRef(false),detailRequest=useRef<AbortController|null>(null),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{const controller=new AbortController();setListError('');setList(null);api<Listing>(root+'media/list?'+new URLSearchParams({page:String(query.page),q:query.q}),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setList(data);}).catch(e=>{if(!controller.signal.aborted)setListError(handleSessionError(e));});return()=>controller.abort();},[query,refresh]);
  useEffect(()=>()=>detailRequest.current?.abort(),[]);
  function applyDetail(data:Detail){setDetail(data);setName(data.filename);setAlt(data.alt);setCaption(data.caption);setRatio('original');setRotation(0);}
  async function open(asset:MediaAsset){if(busy.current)return;detailRequest.current?.abort();const controller=new AbortController();detailRequest.current=controller;setError('');setNotice('');setDetail(null);setLoadingDetail(true);try{const data=await api<Detail>(root+'media/detail/'+asset.id,{signal:controller.signal});if(!controller.signal.aborted)applyDetail(data);}catch(e){if(!controller.signal.aborted)setError(handleSessionError(e));}finally{if(!controller.signal.aborted)setLoadingDetail(false);}}
  async function batch(files:File[]){if(busy.current||!files.length)return;if(files.length>5){setError('Select at most five images at a time.');return;}busy.current=true;setPending(true);setError('');setNotice('');let done=0;try{for(const file of files){await uploadMedia(file);done++;}setNotice(`${done} image(s) uploaded.`);}catch(e){setError(`${done} uploaded. ${handleSessionError(e)}`);}finally{busy.current=false;setPending(false);setQuery({q:'',page:1});setSearch('');setRefresh(n=>n+1);}}
  async function action(kind:'edit'|'delete'|'derive'){if(!detail||busy.current)return;if(kind==='delete'&&!window.confirm('Permanently remove this unused image from the library?'))return;busy.current=true;setPending(true);setError('');setNotice('');try{if(kind==='derive'){const result=await write<MediaAsset>('media/derive',{id:detail.id,ratio,rotation});setDetail(null);setNotice('A new image copy was created.');setQuery({q:'',page:1});setSearch('');if(onSelect){onSelect(result);return;}}else if(kind==='delete'){await write('media/change',{id:detail.id,version:detail.version,action:kind});setDetail(null);setNotice('Image removed.');}else{applyDetail(await write<Detail>('media/change',{id:detail.id,version:detail.version,action:kind,filename:name,alt,caption}));setNotice('Metadata saved.');}setRefresh(n=>n+1);}catch(e){setError(e instanceof ApiError&&e.status===409?`${e.message} Refresh before trying again.`:handleSessionError(e));}finally{busy.current=false;setPending(false);}}
  function filter(e:FormEvent){e.preventDefault();setQuery({q:search.trim(),page:1});}
  return <section className={styles.library}>
    <header className={styles.header}><div><h2>{onSelect?'Choose an image':'Media library'}</h2><p>{list?`${list.count} assets · ${size(list.bytes)} processed images`:'Manage reusable article assets.'}</p></div><button type="button" className={styles.primary} disabled={pending} onClick={()=>input.current?.click()}>+ Upload images</button><input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp" aria-label="Upload media images" disabled={pending} onChange={e=>{const files=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';void batch(files);}}/></header>
    <div className={styles.drop} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void batch(Array.from(e.dataTransfer.files));}}>Drop up to 5 JPG, PNG or WebP images here · 5 MB per image</div>
    <form className={styles.search} onSubmit={filter}><input aria-label="Search media" placeholder="Search filename, alt text or caption" value={search} onChange={e=>setSearch(e.target.value)} maxLength={120}/><button>Search</button><button type="button" onClick={()=>{setRefresh(n=>n+1);setDetail(null);setError('');}}>Refresh</button></form>
    {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status">{notice}</p>}{listError&&<p role="alert" className={styles.error}>{listError}</p>}
    <div className={styles.split}><div>{!list&&!listError?<p role="status">Loading images…</p>:list?.results.length===0?<p className={styles.empty}>No matching images.</p>:<div className={styles.grid}>{list?.results.map(asset=><button className={styles.tile} type="button" key={asset.id} onClick={()=>void open(asset)} aria-pressed={detail?.id===asset.id} disabled={pending}>{uploadedCover(asset.ref)&&<img loading="lazy" src={coverPath(asset.ref,true)!} alt=""/>}<strong>{asset.filename}</strong><small>{asset.width} × {asset.height} · {size(asset.bytes)}</small></button>)}</div>}
    {list&&<div className={styles.pages}><button disabled={query.page===1} onClick={()=>setQuery(q=>({...q,page:q.page-1}))}>Previous</button><span>Page {query.page}</span><button disabled={!list.hasMore} onClick={()=>setQuery(q=>({...q,page:q.page+1}))}>Next</button></div>}</div>
    {loadingDetail&&<p role="status">Loading asset…</p>}{detail&&<aside className={styles.details}><img src={coverPath(detail.ref,true)!} alt={detail.alt}/><h3>{detail.filename}</h3><p>{detail.width} × {detail.height} · {size(detail.bytes)} · {detail.storage==='object'?'Object storage':'Database'}</p>
    {onSelect&&<button type="button" className={styles.primary} disabled={pending} onClick={()=>onSelect(detail)}>Use image</button>}
    <form onSubmit={e=>{e.preventDefault();void action('edit');}}><label>Filename<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required disabled={pending}/></label><label>Default alt text<input value={alt} onChange={e=>setAlt(e.target.value)} maxLength={250} disabled={pending}/></label><label>Default caption<textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={500} disabled={pending}/></label><button disabled={pending}>Save metadata</button></form>
    <section><h4>Usage</h4><p>{detail.articleCount} current articles · {detail.revisionCount} historical revisions</p>{detail.articles.map(slug=><p key={slug} className={styles.slug}>{slug}</p>)}<small>Metadata changes do not rewrite published articles or previous revisions.</small></section>
    <section><h4>Create edited copy</h4><label>Center crop<select value={ratio} onChange={e=>setRatio(e.target.value)} disabled={pending}><option value="original">Original</option><option value="wide">1200:630</option><option value="square">1:1</option><option value="portrait">3:4</option></select></label><label>Rotate clockwise<select value={rotation} onChange={e=>setRotation(Number(e.target.value))} disabled={pending}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label><button disabled={pending||(ratio==='original'&&rotation===0)} onClick={()=>void action('derive')}>Create copy</button></section>
    {owner&&!onSelect&&<button className={styles.danger} disabled={pending||detail.articleCount>0||detail.revisionCount>0} onClick={()=>void action('delete')}>Delete unused image</button>}</aside>}</div>
  </section>;
}
export function MediaPicker({onSelect,onClose}:{onSelect:(asset:MediaAsset)=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=dialog.current;el?.showModal();return()=>{if(el?.open)el.close();};},[]);
  return <dialog ref={dialog} className={styles.dialog} aria-label="Media picker" onCancel={e=>{e.preventDefault();onClose();}}><div className={styles.dialogTop}><button type="button" onClick={onClose}>Close library</button></div><MediaLibrary onSelect={onSelect}/></dialog>;
}
