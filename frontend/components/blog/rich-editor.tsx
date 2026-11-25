'use client';
import {useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import {Node,type JSONContent} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {NodeSelection,TextSelection} from '@tiptap/pm/state';
import {TableKit} from '@tiptap/extension-table';
import {coverPath,uploadedCover} from '@/lib/blog-content';
import {safeLink,wordCount,type RichNode} from '@/lib/rich-document';
import styles from './blog.module.css';
import {EditorIcon,type EditorIconName} from './editor-icons';
import {MediaPicker,type MediaAsset} from './media-library';

// Only stored image IDs are allowed; external images and arbitrary HTML are never rendered.
const StudioImage=Node.create({
  name:'studioImage',group:'block',atom:true,draggable:true,
  addAttributes(){return {ref:{default:''},alt:{default:''},caption:{default:''}};},
  parseHTML(){return [{tag:'figure[data-cedar-image]',getAttrs:element=>{
    if(typeof element==='string')return false;
    const ref=element.getAttribute('data-cedar-image')??'';
    if(!uploadedCover(ref))return false;
    return {ref,alt:element.querySelector('img')?.getAttribute('alt')??'',caption:element.querySelector('figcaption')?.textContent??''};
  }}];},
  renderHTML({node}){
    const ref=String(node.attrs.ref??'');
    if(!uploadedCover(ref))return ['figure',{},['figcaption',{},'Invalid image']];
    return ['figure',{'data-cedar-image':ref},['img',{src:coverPath(ref,true),alt:String(node.attrs.alt??'')}],['figcaption',{},String(node.attrs.caption??'')]];
  },
});
const extensions=[StarterKit.configure({heading:{levels:[2,3,4,5,6]},link:{openOnClick:false,autolink:false,linkOnPaste:false,isAllowedUri:url=>safeLink(url)},trailingNode:false}),TableKit.configure({table:{resizable:false}}),StudioImage];
export function RichEditor({value,onChange,disabled,upload,onPickerChange}:{value:RichNode;onChange:(doc:RichNode)=>void;disabled:boolean;upload:(file:File)=>Promise<string|null>;onPickerChange:(open:boolean)=>void}){
  const [slash,setSlash]=useState(false),[localError,setLocalError]=useState(''),[picker,setPicker]=useState(false);
  useEffect(()=>{onPickerChange(picker);return()=>onPickerChange(false);},[picker,onPickerChange]);
  const [floating,setFloating]=useState<{left:number;top:number;image:boolean}|null>(null);
  const shell=useRef<HTMLDivElement>(null),toolbar=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null),changeRef=useRef(onChange);changeRef.current=onChange;
  const editor=useEditor({extensions,content:value as JSONContent,immediatelyRender:false,shouldRerenderOnTransaction:true,editable:!disabled,
    editorProps:{attributes:{role:'textbox','aria-label':'Article body','aria-multiline':'true'},handleKeyDown(view,event){
      if(event.key==='Escape'){setSlash(false);return false;}
      if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&view.state.selection.empty&&view.state.selection.$from.parent.type.name==='paragraph'&&view.state.selection.$from.parent.content.size===0){setSlash(true);return true;}
      return false;
    }},onUpdate:({editor})=>changeRef.current(editor.getJSON() as RichNode)});
  useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
  const selection=editor?.state.selection;
  const from=selection?.from,to=selection?.to,focused=editor?.isFocused;
  useEffect(()=>{
    if(!editor||!shell.current||!toolbar.current||disabled||!focused||from===undefined||to===undefined||from===to){setFloating(null);return;}
    const reposition=()=>{
      if(editor.isDestroyed||!shell.current||!toolbar.current)return;
      const selected=editor.state.selection;const image=selected instanceof NodeSelection&&selected.node.type.name==='studioImage';
      // Only offer text formatting for a normal text selection, not table/cell selections.
      if(!image&&!(editor.state.selection instanceof TextSelection)){setFloating(null);return;}
      try{
        const bounds=shell.current.getBoundingClientRect(),bar=toolbar.current.getBoundingClientRect();
        const a=editor.view.coordsAtPos(from),b=editor.view.coordsAtPos(to);
        const top=Math.min(a.top,b.top)-44;
        if(top<Math.max(bar.bottom,0)||top>window.innerHeight-44){setFloating(null);return;}
        const left=Math.max(8,Math.min((a.left+b.left)/2-bounds.left-105,bounds.width-218));
        const next={left,top:top-bounds.top,image};
        setFloating(old=>old&&old.left===next.left&&old.top===next.top&&old.image===next.image?old:next);
      }catch{setFloating(null);}
    };
    reposition();window.addEventListener('scroll',reposition,true);window.addEventListener('resize',reposition);
    return()=>{window.removeEventListener('scroll',reposition,true);window.removeEventListener('resize',reposition);};
  },[editor,from,to,focused,disabled]);
  if(!editor)return <p role="status">Loading editor…</p>;
  const button=(name:string,short:string|{icon:EditorIconName},run:()=>unknown,active=false,unavailable=false)=><button key={name} type="button" title={name} aria-label={name} aria-pressed={active} disabled={disabled||unavailable} onMouseDown={e=>e.preventDefault()} onClick={()=>{setSlash(false);run();}}>{typeof short==='string'?short:<EditorIcon name={short.icon}/>}</button>;
  const link=()=>{
    const previous=editor.getAttributes('link').href??'';
    const value=window.prompt('Link URL (https://… or /blog/…)',previous);if(value===null)return;
    if(!value){editor.chain().focus().extendMarkRange('link').unsetLink().run();return;}
    if(!safeLink(value)){setLocalError('Use an HTTP(S) or local absolute link.');return;}
    setLocalError('');editor.chain().focus().extendMarkRange('link').setLink({href:value}).run();
  };
  async function addImage(file:File){
    if(!editor||disabled)return;
    const alt=window.prompt('Describe the image (required alt text)');if(alt===null)return;
    if(!alt.trim()||alt.length>250){setLocalError('Enter 1–250 characters of alt text.');return;}
    const caption=window.prompt('Image caption (optional)','');if(caption===null)return;
    if(caption.length>500){setLocalError('Caption may contain at most 500 characters.');return;}
    // Capture the end of the current top-level block. Images cannot nest inside lists or tables.
    const from=editor.state.selection.$from;const pos=from.depth?from.after(1):from.pos;const originalDoc=editor.state.doc;
    setLocalError('');const ref=await upload(file);if(!ref||editor.isDestroyed)return;
    if(!editor.state.doc.eq(originalDoc)){setLocalError('Article changed during upload. Choose the image again.');return;}
    editor.chain().focus().insertContentAt(pos,{type:'studioImage',attrs:{ref,alt:alt.trim(),caption:caption.trim()}}).run();
  }
  const selectExisting=(asset:MediaAsset)=>{
    setPicker(false);if(disabled||!uploadedCover(asset.ref))return;
    const alt=window.prompt('Describe the image (required alt text)',asset.alt);if(alt===null||!alt.trim()||alt.length>250){setLocalError('Enter 1–250 characters of alt text.');return;}
    const caption=window.prompt('Image caption (optional)',asset.caption);if(caption===null||caption.length>500)return;
    const from=editor.state.selection.$from;const pos=from.depth?from.after(1):from.pos;
    editor.chain().focus().insertContentAt(pos,{type:'studioImage',attrs:{ref:asset.ref,alt:alt.trim(),caption:caption.trim()}}).run();setLocalError('');
  };
  const editImage=()=>{
    const selected=editor.state.selection;if(!(selected instanceof NodeSelection)||selected.node.type.name!=='studioImage')return;
    const attrs=editor.getAttributes('studioImage');const alt=window.prompt('Alt text',attrs.alt);if(alt===null||!alt.trim()||alt.length>250)return;
    const caption=window.prompt('Caption',attrs.caption);if(caption===null||caption.length>500)return;
    editor.chain().focus().updateAttributes('studioImage',{alt:alt.trim(),caption:caption.trim()}).run();
  };
  const imageSelected=editor.state.selection instanceof NodeSelection&&editor.state.selection.node.type.name==='studioImage';
  const level=([2,3,4,5,6] as const).find(n=>editor.isActive('heading',{level:n}));
  const formatButtons=(prefix='')=><>{button(prefix+'Bold',{icon:'bold'},()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}{button(prefix+'Italic',{icon:'italic'},()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}{button(prefix+'Underline',{icon:'underline'},()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}{button(prefix+'Strikethrough',{icon:'strike'},()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike'))}{button(prefix+'Link',{icon:'link'},link,editor.isActive('link'))}</>;
  const imageButtons=(prefix='')=><>{button(prefix+'Edit selected image',{icon:'edit'},editImage,false,!imageSelected)}{button(prefix+'Remove selected image',{icon:'trash'},()=>editor.chain().focus().deleteSelection().run(),false,!imageSelected)}</>;
  return <div className={styles.richShell} ref={shell}>
    <div className={styles.richToolbar} role="toolbar" aria-label="Article formatting" ref={toolbar}>
      <div className={styles.toolGroup}>{button('Undo',{icon:'undo'},()=>editor.chain().focus().undo().run(),false,!editor.can().undo())}{button('Redo',{icon:'redo'},()=>editor.chain().focus().redo().run(),false,!editor.can().redo())}</div>
      <div className={styles.toolGroup}><select aria-label="Text style" value={level?String(level):'paragraph'} disabled={disabled} onChange={e=>{const v=e.currentTarget.value;if(v==='paragraph')editor.chain().focus().setParagraph().run();else editor.chain().focus().setHeading({level:Number(v) as 2|3|4|5|6}).run();}}><option value="paragraph">Paragraph</option>{[2,3,4,5,6].map(n=><option value={n} key={n}>Heading {n}</option>)}</select></div>
      <div className={styles.toolGroup}>{formatButtons()}{button('Inline code',{icon:'code'},()=>editor.chain().focus().toggleCode().run(),editor.isActive('code'))}</div>
      <div className={styles.toolGroup}>{button('Bullet list',{icon:'bullets'},()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}{button('Numbered list',{icon:'numbered'},()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}{button('Quote',{icon:'quote'},()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote'))}{button('Code block',{icon:'blockCode'},()=>editor.chain().focus().toggleCodeBlock().run(),editor.isActive('codeBlock'))}{button('Divider',{icon:'divider'},()=>editor.chain().focus().setHorizontalRule().run())}</div>
      <div className={styles.toolGroup}>{button('Insert image',{icon:'image'},()=>input.current?.click())}{button('Choose library image','Library',()=>setPicker(true))}{button('Insert table',{icon:'table'},()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run(),false,editor.isActive('table'))}</div>
      {imageSelected&&<div className={styles.contextTools}>{imageButtons()}</div>}
      {editor.isActive('table')&&<div className={styles.contextTools}><small>Table</small>{button('Add row','+ Row',()=>editor.chain().focus().addRowAfter().run())}{button('Delete row','− Row',()=>editor.chain().focus().deleteRow().run())}{button('Add column','+ Col',()=>editor.chain().focus().addColumnAfter().run())}{button('Delete column','− Col',()=>editor.chain().focus().deleteColumn().run())}{button('Delete table','Delete table',()=>editor.chain().focus().deleteTable().run())}</div>}
      <input ref={input} hidden type="file" aria-label="Upload inline image" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void addImage(file);}}/>
    </div>
    {picker&&<MediaPicker onClose={()=>setPicker(false)} onSelect={selectExisting}/>}
    {slash&&<div className={styles.slashMenu} aria-label="Insert block">{button('Insert heading','Heading',()=>editor.chain().focus().setHeading({level:2}).run())}{button('Insert quote','Quote',()=>editor.chain().focus().toggleBlockquote().run())}{button('Insert code block','Code',()=>editor.chain().focus().toggleCodeBlock().run())}{button('Upload image','Image',()=>input.current?.click())}{button('Insert literal slash','/',()=>editor.chain().focus().insertContent('/').run())}<button type="button" onClick={()=>{setSlash(false);editor.commands.focus();}}>Cancel</button></div>}
    {localError&&<p role="alert" className={styles.error}>{localError}</p>}
    <EditorContent editor={editor} className={styles.richSurface}/>
    {floating&&!slash&&<div className={styles.floatingTools} style={{left:floating.left,top:floating.top}} role="toolbar" aria-label={floating.image?'Selected image actions':'Selected text formatting'}>{floating.image?imageButtons('Selection: '):formatButtons('Selection: ')}</div>}
    <div className={styles.editorFoot}><small>{wordCount(value)} words · {Math.max(1,Math.ceil(wordCount(value)/200))} min read</small><small>Type / on an empty paragraph to insert a block</small></div>
  </div>;
}
