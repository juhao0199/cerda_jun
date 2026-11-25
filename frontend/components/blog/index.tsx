'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,ApiError} from '@/lib/session-api';
import {blankArticle,coverPath,covers,uploadedCover,readingMinutes,validSlug,type BlogDetail,type BlogFields,type BlogRow,type BlogStatus} from '@/lib/blog-content';
import {handleSessionError} from '@/components/workspace/shell';
import styles from './blog.module.css';
import {RichEditor} from './rich-editor';
import {MediaPicker,uploadMedia} from './media-library';
import {EditorIcon} from './editor-icons';
import {RichRender} from './rich-render';
import {legacyDocument,hasContent} from '@/lib/rich-document';

type Listing={results:BlogRow[];page:number;hasMore:boolean;counts:Record<BlogStatus,number>};
const statuses=['draft','published','archived'] as const;
const root='staff/blog/';
async function write(path:string,data:object){
  const {csrfToken}=await api<{csrfToken:string}>('auth/csrf');
  return api<BlogDetail>(root+path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':csrfToken},body:JSON.stringify(data)});
}
function Preview({fields}:{fields:BlogFields}){
  const cover=coverPath(fields.cover,true);
  return <article className={styles.preview}><p className={styles.eyebrow}>{fields.category||'Category'} · {readingMinutes(fields)} min read</p><h2>{fields.title||'Untitled article'}</h2><p>{fields.summary}</p>{cover&&<img src={cover} alt=""/>} <RichRender document={fields.document??legacyDocument(fields.sections)} privatePreview/><p>{fields.tags.join(' · ')}</p></article>;
}
export default function BlogWorkspace({canPublish}:{canPublish:boolean}){
  const [list,setList]=useState<Listing|null>(null),[search,setSearch]=useState(''),[filter,setFilter]=useState(''),[query,setQuery]=useState({q:'',status:'',page:1}),[refresh,setRefresh]=useState(0);
  const [editing,setEditing]=useState(false),[post,setPost]=useState<BlogDetail|null>(null),[slug,setSlug]=useState(''),[fields,setFields]=useState<BlogFields>(blankArticle),[tagText,setTagText]=useState('');
  const [preview,setPreview]=useState(false),[historical,setHistorical]=useState<{version:number;snapshot:BlogFields}|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[listError,setListError]=useState(''),[notice,setNotice]=useState('');
  const busy=useRef(false);
  const [coverPicker,setCoverPicker]=useState(false),[bodyPicker,setBodyPicker]=useState(false);
  const [editorEpoch,setEditorEpoch]=useState(0),[autoSave,setAutoSave]=useState(true);
  const [full,setFull]=useState(false),[settingsOpen,setSettingsOpen]=useState(true),[saving,setSaving]=useState(false);
  const studio=useRef<HTMLDivElement>(null),settingsToggle=useRef<HTMLButtonElement>(null);
  const archived=post?.status==='archived';
  const initial=post?.draft;const dirty=editing&&(!initial||JSON.stringify(fields)!==JSON.stringify(initial)||tagText!==initial.tags.join(', '));
  useEffect(()=>{const controller=new AbortController();const params=new URLSearchParams({page:String(query.page)});if(query.q)params.set('q',query.q);if(query.status)params.set('status',query.status);setListError('');
    api<Listing>(root+'list?'+params,{signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setList(r);}).catch(e=>{if(!controller.signal.aborted){setList(null);setListError(handleSessionError(e));}});return()=>controller.abort();},[query,refresh]);
  function load(p:BlogDetail){setEditorEpoch(n=>n+1);setPost(p);setSlug(p.slug);setFields(p.draft);setTagText(p.draft.tags.join(', '));setHistorical(null);setPreview(false);setEditing(true);}
  function start(){setFull(false);setSettingsOpen(true);setEditorEpoch(n=>n+1);setPost(null);setSlug('');setFields(blankArticle());setTagText('');setHistorical(null);setPreview(false);setNotice('');setError('');setEditing(true);}
  async function open(s:string){if(busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');try{load(await api<BlogDetail>(root+'detail/'+s));}catch(e){setError(handleSessionError(e));}finally{busy.current=false;setPending(false);}}
  function close(){if(busy.current)return;if(dirty&&!window.confirm('Discard unsaved article changes?'))return;setFull(false);setEditing(false);setPost(null);setError('');setNotice('');}
  function update<K extends keyof BlogFields>(key:K,value:BlogFields[K]){setFields(f=>({...f,[key]:value}));}
  async function uploadImage(file:File):Promise<string|null>{
    if(busy.current||archived)return null;
    setError('');setNotice('');
    if(file.size===0||file.size>5*1024*1024){setError('Choose an image up to 5 MB.');return null;}
    busy.current=true;setPending(true);
    try{
      const result=await uploadMedia(file);
      if(!uploadedCover(result.cover))throw new Error('Invalid image response.');
      return result.cover;
    }catch(e){setError(handleSessionError(e));return null;}finally{busy.current=false;setPending(false);}
  }
  async function uploadCover(file:File){const ref=await uploadImage(file);if(ref){update('cover',ref);setNotice('Cover uploaded. Save the draft to keep this selection.');}}
  async function submit(action:'save'|'publish'|'archive'|'restore',automatic=false){
    if(busy.current)return;
    if(action==='save'&&(!fields.title.trim()||!fields.summary.trim()||!fields.category.trim()||!hasContent(fields.document??legacyDocument(fields.sections)))){setError('Enter a title, summary, category and article content.');return;}
    if(action==='save'&&!validSlug(slug)){setError('Use a lowercase URL slug with letters, digits and hyphens.');return;}
    if(action!=='save'&&(!post||dirty||!canPublish))return;
    if(action==='publish'&&!window.confirm('Publish the saved article on the public website?'))return;
    if(action==='archive'&&!window.confirm('Archive this article and remove its public URL?'))return;
    if(action==='restore'&&!window.confirm('Restore as a private draft?'))return;
    busy.current=true;setPending(true);setSaving(action==='save');setError('');setNotice('');
    try{
      const payload={...fields,tags:tagText.split(',').map(s=>s.trim()).filter(Boolean)};
      const result=post?await write('change',{slug:post.slug,version:post.version,action,...(action==='save'?{fields:payload}:{})}):await write('create',{slug,fields:payload});
      if(action==='save'){setPost(result);setSlug(result.slug);setFields(current=>current===fields?result.draft:current);setTagText(current=>current===tagText?result.draft.tags.join(', '):current);}else load(result);setNotice(action==='save'?(automatic?'Draft autosaved.':'Draft saved.'):action==='publish'?'Article published.':action==='archive'?'Article archived.':'Article restored as a draft.');setRefresh(n=>n+1);
    }catch(e){setError(e instanceof ApiError&&e.status===409?`${e.message} Your unsaved text is retained.`:handleSessionError(e));}
    finally{busy.current=false;setPending(false);setSaving(false);}
  }
  async function viewRevision(version:number){if(!post||busy.current)return;busy.current=true;setPending(true);setError('');try{setHistorical(await api<{version:number;snapshot:BlogFields}>(root+`revision/${post.slug}/${version}`));setPreview(true);}catch(e){setError(handleSessionError(e));}finally{busy.current=false;setPending(false);}}
  // Existing saved articles only. Do not automatically create new posts or publish.
  // A failed save pauses autosave until a successful manual save or reload.
  useEffect(()=>{
    if(!autoSave||coverPicker||bodyPicker||!post||!dirty||pending||error||preview||archived||!fields.title.trim()||!fields.summary.trim()||!fields.category.trim()||!hasContent(fields.document??legacyDocument(fields.sections)))return;
    const timer=window.setTimeout(()=>{void submit('save',true);},5000);
    return()=>window.clearTimeout(timer);
  // submit intentionally captures the latest draft and version; changes restart the timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoSave,coverPicker,bodyPicker,post,dirty,pending,error,preview,archived,fields,tagText,slug]);
  useEffect(()=>{
    if(!dirty&&!(editing&&pending))return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    const leave=(event:Event)=>{if(pending||!window.confirm('Discard unsaved article changes?'))event.preventDefault();};
    window.addEventListener('beforeunload',warn);window.addEventListener('cedar:workspace-leave',leave);
    return()=>{window.removeEventListener('beforeunload',warn);window.removeEventListener('cedar:workspace-leave',leave);};
  },[dirty,editing,pending]);
  useEffect(()=>{
    if(!full||!studio.current)return;
    const node=studio.current,previousOverflow=document.body.style.overflow;
    const outside:HTMLElement[]=[];
    // In full-screen mode, prevent keyboard and pointer access to underlying workspace chrome.
    for(let current:HTMLElement|null=node;current&&current!==document.body;current=current.parentElement){
      for(const sibling of Array.from(current.parentElement?.children??[])){
        if(sibling!==current&&sibling instanceof HTMLElement&&!sibling.inert&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){sibling.inert=true;outside.push(sibling);}
      }
    }
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previousOverflow;outside.forEach(el=>{el.inert=false;});};
  },[full]);
  const stateLabel=archived?'Archived · read only':saving?'Saving draft…':pending?'Working…':error?'Action failed · check message':dirty?(post?'Unsaved changes':'New draft · not saved'):'All changes saved';
  if(editing)return <div className={styles.root}>
    <div ref={studio} className={`${styles.studio} ${full?styles.fullStudio:''}`} role={full?'dialog':undefined} aria-modal={full?true:undefined} aria-label={full?'Full screen article editor':undefined} onKeyDown={e=>{
      if((e.target as HTMLElement).closest('dialog[open]'))return;
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!pending&&!archived&&!historical)void submit('save');}
      if(full&&e.key==='Tab'&&studio.current&&!(e.target as HTMLElement).closest('dialog[open]')){
        const controls=Array.from(studio.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[contenteditable=true],[tabindex]')).filter(el=>el.getClientRects().length>0&&!el.closest('[hidden],[inert]')&&!el.matches(':disabled')&&(el.tabIndex>=0||el.isContentEditable));
        const first=controls[0],last=controls[controls.length-1];
        if(first&&last&&e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(first&&last&&!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }}>
      {coverPicker&&<MediaPicker onClose={()=>setCoverPicker(false)} onSelect={asset=>{update('cover',asset.ref);setCoverPicker(false);setNotice('Cover selected. Save the draft to keep this selection.');}}/>}
      <div className={styles.studioHeader}>
        <div className={styles.studioIdentity}>
          <button type="button" className={styles.iconAction} title="Back to articles" aria-label="Back to articles" onClick={close} disabled={pending}><EditorIcon name="back"/></button>
          <div className={styles.studioTitle}><h1>{fields.title.trim()||'Untitled article'}</h1><div className={styles.studioMeta}>{post?<span>{post.status} · v{post.version}</span>:<span>New article</span>}{post?.status==='published'&&post.hasUnpublishedChanges&&<span>· Unpublished edits</span>}<span className={styles.saveStatus} role="status">{!dirty&&!pending&&!error&&!archived&&<EditorIcon name="check"/>}{stateLabel}</span></div></div>
        </div>
        <div className={styles.studioActions}>
          {preview?<button type="button" disabled={pending} onClick={()=>{setPreview(false);setHistorical(null);}}>Editor</button>:<button type="button" disabled={pending} onClick={()=>{setHistorical(null);setPreview(true);}}><EditorIcon name="eye"/> Preview draft</button>}
          {!archived&&<button type="button" disabled={pending||!!historical} onClick={()=>void submit('save')} title="Save draft (Ctrl / Cmd + S)">{post?'Save draft':'Create draft'}</button>}
          {post&&canPublish&&!archived&&<button type="button" className={styles.primary} disabled={pending||dirty||!!historical} title={dirty?'Save changes before publishing':'Publish the saved version'} onClick={()=>void submit('publish')}>Publish article</button>}
          <button type="button" className={styles.iconAction} ref={settingsToggle} aria-label={settingsOpen?'Hide article settings':'Show article settings'} title={settingsOpen?'Hide article settings':'Show article settings'} aria-expanded={settingsOpen} aria-controls="article-settings" onClick={()=>{setSettingsOpen(v=>!v);if(!settingsOpen&&window.matchMedia('(max-width: 760px)').matches)requestAnimationFrame(()=>document.getElementById('article-settings')?.scrollIntoView({block:'start'}));}}><EditorIcon name="settings"/></button>
          <button type="button" className={styles.iconAction} aria-label={full?'Exit full screen':'Full screen'} title={full?'Exit full screen':'Full screen'} onClick={()=>setFull(v=>!v)}><EditorIcon name={full?'collapse':'expand'}/></button>
        </div>
      </div>
      {(error||notice)&&<div className={styles.studioFeedback}>{error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}</div>}
      <div className={`${styles.studioGrid} ${!settingsOpen?styles.noSettings:''}`}>
        <div className={styles.studioCanvas}>
          {preview&&<div className={styles.studioPreview}><p className={styles.eyebrow}>{historical?`Read-only revision ${historical.version}`:'Private preview · not the public article'}</p><Preview fields={historical?.snapshot??{...fields,tags:tagText.split(',').map(s=>s.trim()).filter(Boolean)}}/></div>}
          {/* Keep the editor mounted during preview and full-screen transitions to retain undo history. */}
          <div hidden={preview} className={styles.writingSurface}>
            <fieldset disabled={pending||archived} className={styles.articleHeading}>
              {coverPath(fields.cover,true)&&<img className={styles.featureImage} src={coverPath(fields.cover,true)!} alt=""/>}
              <label><span>Article title</span><textarea className={styles.titleInput} required rows={2} maxLength={160} value={fields.title} placeholder="Article title" onChange={e=>update('title',e.target.value)}/></label>
              <label><span>Summary</span><textarea className={styles.summaryInput} required maxLength={320} rows={2} placeholder="Write a short introduction…" value={fields.summary} onChange={e=>update('summary',e.target.value)}/></label>
            </fieldset>
            <RichEditor key={editorEpoch} value={fields.document??legacyDocument(fields.sections)} disabled={pending||!!archived||preview} upload={uploadImage} onPickerChange={setBodyPicker} onChange={document=>setFields(f=>({...f,sections:[],document}))}/>
          </div>
        </div>
        <aside id="article-settings" aria-label="Article settings" className={styles.studioSettings} hidden={!settingsOpen}>
          <div className={styles.settingsHeading}><h2>Article settings</h2><button type="button" className={styles.iconAction} aria-label="Close article settings" title="Close article settings" onClick={()=>{setSettingsOpen(false);settingsToggle.current?.focus();}}><EditorIcon name="settings"/></button></div>
          <fieldset disabled={pending||archived||preview}>
            <section className={styles.settingSection}><h3>Details</h3>
              <label>URL slug<input required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} readOnly={!!post} onChange={e=>setSlug(e.target.value)}/></label><small>Permanent URL after creation.</small>
              <label>Category<input required maxLength={60} value={fields.category} onChange={e=>update('category',e.target.value)}/></label><label>Tags (comma separated)<input maxLength={410} value={tagText} onChange={e=>setTagText(e.target.value)}/></label>
            </section>
            <section className={styles.settingSection}><h3>Cover</h3><div className={styles.coverPanel}><label><span id="blog-cover-label">Cover image</span><select aria-labelledby="blog-cover-label" value={fields.cover} onChange={e=>update('cover',e.target.value)}>{uploadedCover(fields.cover)&&<option value={fields.cover}>Uploaded image</option>}{covers.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              {coverPath(fields.cover,true)&&<img className={styles.cover} src={coverPath(fields.cover,true)!} alt="Current cover preview"/>}
              <label className={styles.uploadLabel}>Upload cover image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void uploadCover(file);}}/></label><button type="button" onClick={()=>setCoverPicker(true)}>Choose from media library</button><small>JPG, PNG or WebP · 5 MB · recommended 1200 × 630.</small>{fields.cover&&<button type="button" onClick={()=>update('cover','')}>Remove cover</button>}</div>
            </section>
            <section className={styles.settingSection}><h3>Search & social metadata</h3><label>SEO title<input maxLength={100} value={fields.seoTitle} onChange={e=>update('seoTitle',e.target.value)} placeholder="Defaults to article title"/></label><small>{fields.seoTitle.length}/100 characters</small><label>SEO description<textarea maxLength={320} rows={3} value={fields.seoDescription} onChange={e=>update('seoDescription',e.target.value)} placeholder="Defaults to summary"/></label><small>{fields.seoDescription.length}/320 characters · Canonical URL uses the site domain and permanent slug.</small></section>
          </fieldset>
          <section className={styles.settingSection}><h3>Draft & publishing</h3>{post?<><label className={styles.autosave}><input type="checkbox" checked={autoSave} onChange={e=>setAutoSave(e.target.checked)}/> Autosave after 5 seconds of inactivity</label>{error&&autoSave&&<small>Autosave paused. Resolve the error and save manually.</small>}</>:<small>Create a draft to enable autosave.</small>}
            {post?.status==='published'&&<a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">View published article ↗</a>}
            {post&&<button type="button" disabled={pending} onClick={()=>{if(!dirty||window.confirm('Discard unsaved changes and reload?'))void open(post.slug);}}>Reload saved version</button>}
            {post&&canPublish&&<><small>{dirty?'Save changes before publishing or archiving.':'Only the saved revision is used for publishing.'}</small>{archived?<button type="button" disabled={pending||dirty||!!historical} onClick={()=>void submit('restore')}>Restore as draft</button>:<button type="button" disabled={pending||dirty||!!historical} onClick={()=>void submit('archive')}>Archive article</button>}</>}
          </section>
          {post&&<section className={styles.settingSection}><h3>Revision history</h3><small>Read-only snapshots · latest 100 versions.</small>{post.history.map(r=><div className={styles.history} key={r.version}><span>v{r.version} · {r.action}<small>{new Date(r.createdAt).toLocaleString()}</small></span><button type="button" disabled={pending} onClick={()=>void viewRevision(r.version)}>Preview v{r.version}</button></div>)}</section>}
        </aside>
      </div>
    </div>
  </div>;
  return <div className={styles.root}>
    <div className={styles.heading}><div><h1>Blog CMS</h1><p>Manage editorial content, search metadata and published articles.</p></div><button className={styles.primary} onClick={start} disabled={pending}>+ New article</button></div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <><div className={styles.metrics}>{statuses.map(s=><div key={s}><span>{s}</span><strong>{list?.counts[s]??'—'}</strong></div>)}</div><section className={styles.panel}>
      <form className={styles.toolbar} onSubmit={(e:FormEvent)=>{e.preventDefault();setQuery({q:search.trim(),status:filter,page:1});}}><label>Search<input value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} placeholder="Title, slug or category"/></label><label><span id="blog-filter-label">Status</span><select aria-labelledby="blog-filter-label" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All statuses</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label><button>Search</button><button type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh</button></form>
      {listError&&<p role="alert" className={styles.error}>{listError}</p>}{!list&&!listError?<p role="status">Loading articles…</p>:list&&<><div className={styles.scroll}><table><thead><tr><th>Article</th><th>Category</th><th>Status</th><th>Updated</th></tr></thead><tbody>{list.results.map(p=><tr key={p.slug}><td><button className={styles.articleLink} disabled={pending} onClick={()=>open(p.slug)}>{p.title}</button><small>/blog/{p.slug}</small></td><td>{p.category}</td><td><span className={styles.status}>{p.status}</span>{p.status==='published'&&p.hasUnpublishedChanges&&<small>Unpublished edits</small>}</td><td>{new Date(p.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!list.results.length&&<p>No matching articles.</p>}</div><div className={styles.toolbar}><button disabled={query.page===1} onClick={()=>setQuery(q=>({...q,page:q.page-1}))}>Previous</button><span>Page {list.page}</span><button disabled={!list.hasMore} onClick={()=>setQuery(q=>({...q,page:q.page+1}))}>Next</button></div></>}</section></>
  </div>;
}
