'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,ApiError} from '@/lib/session-api';
import {blankArticle,coverPath,covers,uploadedCover,readingMinutes,validSlug,type BlogDetail,type BlogFields,type BlogRow,type BlogStatus} from '@/lib/blog-content';
import {handleSessionError} from '@/components/workspace/shell';
import styles from './blog.module.css';

type Listing={results:BlogRow[];page:number;hasMore:boolean;counts:Record<BlogStatus,number>};
const statuses=['draft','published','archived'] as const;
const root='staff/blog/';
async function write(path:string,data:object){
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  return api<BlogDetail>(root+path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},body:JSON.stringify(data)});
}
function Preview({fields}:{fields:BlogFields}){
  const cover=coverPath(fields.cover,true);
  return <article className={styles.preview}><p className={styles.eyebrow}>{fields.category||'Category'} · {readingMinutes(fields)} min read</p><h2>{fields.title||'Untitled article'}</h2><p>{fields.summary}</p>{cover&&<img src={cover} alt=""/>} {fields.sections.map((s,i)=><section key={i}><h3>{s.heading}</h3>{s.body.split(/\n\s*\n/).map((p,j)=><p className={styles.copy} key={j}>{p}</p>)}</section>)}<p>{fields.tags.join(' · ')}</p></article>;
}
export default function BlogWorkspace({canPublish}:{canPublish:boolean}){
  const [list,setList]=useState<Listing|null>(null),[search,setSearch]=useState(''),[filter,setFilter]=useState(''),[query,setQuery]=useState({q:'',status:'',page:1}),[refresh,setRefresh]=useState(0);
  const [editing,setEditing]=useState(false),[post,setPost]=useState<BlogDetail|null>(null),[slug,setSlug]=useState(''),[fields,setFields]=useState<BlogFields>(blankArticle),[tagText,setTagText]=useState('');
  const [preview,setPreview]=useState(false),[historical,setHistorical]=useState<{version:number;snapshot:BlogFields}|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[listError,setListError]=useState(''),[notice,setNotice]=useState('');
  const busy=useRef(false);
  const initial=post?.draft;const dirty=editing&&(!initial||JSON.stringify(fields)!==JSON.stringify(initial)||tagText!==initial.tags.join(', '));
  useEffect(()=>{const controller=new AbortController();const params=new URLSearchParams({page:String(query.page)});if(query.q)params.set('q',query.q);if(query.status)params.set('status',query.status);setListError('');
    api<Listing>(root+'list?'+params,{signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setList(r);}).catch(e=>{if(!controller.signal.aborted){setList(null);setListError(handleSessionError(e));}});return()=>controller.abort();},[query,refresh]);
  function load(p:BlogDetail){setPost(p);setSlug(p.slug);setFields(p.draft);setTagText(p.draft.tags.join(', '));setHistorical(null);setPreview(false);setEditing(true);}
  function start(){setPost(null);setSlug('');setFields(blankArticle());setTagText('');setHistorical(null);setPreview(false);setNotice('');setError('');setEditing(true);}
  async function open(s:string){if(busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');try{load(await api<BlogDetail>(root+'detail/'+s));}catch(e){setError(handleSessionError(e));}finally{busy.current=false;setPending(false);}}
  function close(){if(dirty&&!window.confirm('Discard unsaved article changes?'))return;setEditing(false);setPost(null);setError('');setNotice('');}
  function update<K extends keyof BlogFields>(key:K,value:BlogFields[K]){setFields(f=>({...f,[key]:value}));}
  function editSection(i:number,key:'heading'|'body',value:string){setFields(f=>({...f,sections:f.sections.map((s,j)=>i===j?{...s,[key]:value}:s)}));}
  function move(i:number,offset:number){setFields(f=>{const sections=[...f.sections];[sections[i],sections[i+offset]]=[sections[i+offset],sections[i]];return {...f,sections};});}
  async function uploadCover(file:File){
    if(busy.current||post?.status==='archived')return;
    setError('');setNotice('');
    if(file.size===0||file.size>5*1024*1024){setError('Choose an image up to 5 MB.');return;}
    busy.current=true;setPending(true);
    try{
      const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
      const result=await api<{cover:string;width:number;height:number}>(root+'cover/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-CSRFToken':csrfToken},body:file});
      if(!uploadedCover(result.cover))throw new Error('Invalid image response.');
      update('cover',result.cover);setNotice('Cover uploaded. Save the draft to keep this selection.');
    }catch(e){setError(handleSessionError(e));}finally{busy.current=false;setPending(false);}
  }
  async function submit(action:'save'|'publish'|'archive'|'restore'){
    if(busy.current)return;
    if(action==='save'&&!validSlug(slug)){setError('Use a lowercase URL slug with letters, digits and hyphens.');return;}
    if(action!=='save'&&(!post||dirty||!canPublish))return;
    if(action==='publish'&&!window.confirm('Publish the saved article on the public website?'))return;
    if(action==='archive'&&!window.confirm('Archive this article and remove its public URL?'))return;
    if(action==='restore'&&!window.confirm('Restore as a private draft?'))return;
    busy.current=true;setPending(true);setError('');setNotice('');
    try{
      const payload={...fields,tags:tagText.split(',').map(s=>s.trim()).filter(Boolean)};
      const result=post?await write('change',{slug:post.slug,version:post.version,action,...(action==='save'?{fields:payload}:{})}):await write('create',{slug,fields:payload});
      load(result);setNotice(action==='save'?'Draft saved.':action==='publish'?'Article published.':action==='archive'?'Article archived.':'Article restored as a draft.');setRefresh(n=>n+1);
    }catch(e){setError(e instanceof ApiError&&e.status===409?`${e.message} Your unsaved text is retained.`:handleSessionError(e));}
    finally{busy.current=false;setPending(false);}
  }
  async function viewRevision(version:number){if(!post||busy.current)return;busy.current=true;setPending(true);setError('');try{setHistorical(await api<{version:number;snapshot:BlogFields}>(root+`revision/${post.slug}/${version}`));setPreview(true);}catch(e){setError(handleSessionError(e));}finally{busy.current=false;setPending(false);}}
  const archived=post?.status==='archived';
  return <div className={styles.root}>
    <div className={styles.heading}><div><h1>{editing?(post?'Edit article':'New article'):'Blog CMS'}</h1><p>{editing?'Saved drafts remain private until an Owner publishes them.':'Manage editorial content, search metadata and published articles.'}</p></div>{editing?<button onClick={close} disabled={pending}>Back to articles</button>:<button className={styles.primary} onClick={start} disabled={pending}>+ New article</button>}</div>
    {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
    {!editing?<><div className={styles.metrics}>{statuses.map(s=><div key={s}><span>{s}</span><strong>{list?.counts[s]??'—'}</strong></div>)}</div><section className={styles.panel}>
      <form className={styles.toolbar} onSubmit={(e:FormEvent)=>{e.preventDefault();setQuery({q:search.trim(),status:filter,page:1});}}><label>Search<input value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} placeholder="Title, slug or category"/></label><label><span id="blog-filter-label">Status</span><select aria-labelledby="blog-filter-label" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All statuses</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label><button>Search</button><button type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh</button></form>
      {listError&&<p role="alert" className={styles.error}>{listError}</p>}{!list&&!listError?<p role="status">Loading articles…</p>:list&&<><div className={styles.scroll}><table><thead><tr><th>Article</th><th>Category</th><th>Status</th><th>Updated</th></tr></thead><tbody>{list.results.map(p=><tr key={p.slug}><td><button className={styles.articleLink} disabled={pending} onClick={()=>open(p.slug)}>{p.title}</button><small>/blog/{p.slug}</small></td><td>{p.category}</td><td><span className={styles.status}>{p.status}</span>{p.status==='published'&&p.hasUnpublishedChanges&&<small>Unpublished edits</small>}</td><td>{new Date(p.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!list.results.length&&<p>No matching articles.</p>}</div><div className={styles.toolbar}><button disabled={query.page===1} onClick={()=>setQuery(q=>({...q,page:q.page-1}))}>Previous</button><span>Page {list.page}</span><button disabled={!list.hasMore} onClick={()=>setQuery(q=>({...q,page:q.page+1}))}>Next</button></div></>}</section></>:<>
      {post&&<div className={styles.toolbar}><span className={styles.status}>{post.status} · v{post.version}</span>{post.status==='published'&&post.hasUnpublishedChanges&&<span>Unpublished edits</span>}{post.status==='published'&&<a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">View published article ↗</a>}<button type="button" disabled={pending} onClick={()=>{if(post&&(!dirty||window.confirm('Discard unsaved changes and reload?')))open(post.slug);}}>Reload saved version</button></div>}
      <div className={styles.toolbar}><button aria-pressed={!preview} onClick={()=>{setPreview(false);setHistorical(null);}}>Editor</button><button aria-pressed={preview&&!historical} onClick={()=>{setHistorical(null);setPreview(true);}}>Preview draft</button></div>
      {preview?<><p>{historical?`Read-only revision ${historical.version}`:'Private preview · not the public article'}</p><Preview fields={historical?.snapshot??{...fields,tags:tagText.split(',').map(s=>s.trim()).filter(Boolean)}}/></>:<form className={styles.panel} onSubmit={e=>{e.preventDefault();void submit('save');}}><fieldset disabled={pending||archived}>
      <label>Article title<input required maxLength={160} value={fields.title} onChange={e=>update('title',e.target.value)}/></label><label>URL slug<input required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} readOnly={!!post} onChange={e=>setSlug(e.target.value)}/><small>Permanent URL after creation.</small></label>
      <label>Summary<textarea required maxLength={320} rows={3} value={fields.summary} onChange={e=>update('summary',e.target.value)}/></label><div className={styles.grid}><label>Category<input required maxLength={60} value={fields.category} onChange={e=>update('category',e.target.value)}/></label><label>Tags (comma separated)<input maxLength={410} value={tagText} onChange={e=>setTagText(e.target.value)}/></label></div>
      <div className={styles.coverPanel}><label><span id="blog-cover-label">Cover image</span><select aria-labelledby="blog-cover-label" value={fields.cover} onChange={e=>update('cover',e.target.value)}>{uploadedCover(fields.cover)&&<option value={fields.cover}>Uploaded image</option>}{covers.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      {coverPath(fields.cover,true)&&<img className={styles.cover} src={coverPath(fields.cover,true)!} alt="Current cover preview"/>}
      <label className={styles.uploadLabel}>Upload cover image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void uploadCover(file);}}/></label><small>JPG, PNG or WebP · up to 5 MB · recommended 1200 × 630. Uploaded images remain private until a saved article using them is published.</small>
      {fields.cover&&<button type="button" onClick={()=>update('cover','')}>Remove cover</button>}</div>
      <h2>Article content</h2><p>Write heading and paragraph blocks. Separate paragraphs with a blank line. HTML is displayed as text.</p>
      {fields.sections.map((s,i)=><div className={styles.section} key={i}><div className={styles.heading}><strong>Section {i+1}</strong><div className={styles.toolbar}><button type="button" disabled={i===0} onClick={()=>move(i,-1)}>Move up</button><button type="button" disabled={i===fields.sections.length-1} onClick={()=>move(i,1)}>Move down</button><button type="button" disabled={fields.sections.length===1} onClick={()=>update('sections',fields.sections.filter((_,j)=>i!==j))}>Remove</button></div></div><label>Heading {i+1}<input required maxLength={160} value={s.heading} onChange={e=>editSection(i,'heading',e.target.value)}/></label><label>Body {i+1}<textarea required maxLength={6000} rows={6} value={s.body} onChange={e=>editSection(i,'body',e.target.value)}/></label></div>)}
      <button type="button" disabled={fields.sections.length>=20} onClick={()=>update('sections',[...fields.sections,{heading:'',body:''}])}>+ Add section</button>
      <h2>Search & social metadata</h2><label>SEO title<input maxLength={100} value={fields.seoTitle} onChange={e=>update('seoTitle',e.target.value)} placeholder="Defaults to article title"/></label><label>SEO description<textarea maxLength={320} rows={3} value={fields.seoDescription} onChange={e=>update('seoDescription',e.target.value)} placeholder="Defaults to summary"/></label><p>Canonical URL is generated from the site domain and permanent slug.</p>
      <button className={styles.primary} disabled={pending}>{post?'Save draft':'Create draft'}</button></fieldset></form>}
      {post&&canPublish&&<section className={styles.panel}><h2>Publishing</h2><p>{dirty?'Save changes before publishing or archiving.':'Only the saved revision is used for publishing.'}</p><div className={styles.toolbar}>{archived?<button disabled={pending||dirty} onClick={()=>submit('restore')}>Restore as draft</button>:<><button className={styles.primary} disabled={pending||dirty} onClick={()=>submit('publish')}>Publish article</button><button disabled={pending||dirty} onClick={()=>submit('archive')}>Archive article</button></>}</div></section>}
      {post&&<section className={styles.panel}><h2>Revision history</h2><p>Read-only snapshots · latest 100 versions.</p>{post.history.map(r=><div className={styles.history} key={r.version}><span>v{r.version} · {r.action} · {new Date(r.createdAt).toLocaleString()}</span><button disabled={pending} onClick={()=>viewRevision(r.version)}>Preview v{r.version}</button></div>)}</section>}
    </>}
  </div>;
}
