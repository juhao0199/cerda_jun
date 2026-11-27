import {createElement,type ReactNode} from 'react';
import {coverPath,uploadedCover} from '@/lib/blog-content';
import {safeLink,type RichNode} from '@/lib/rich-document';

// React escapes all text. Do not replace this renderer with raw HTML injection.
function render(n:RichNode,key:number,privatePreview:boolean):ReactNode {
  const children=n.content?.map((c,i)=>render(c,i,privatePreview));
  switch(n.type){
    case 'text': {
      let content:ReactNode=n.text??'';
      for(const mark of n.marks??[]){
        const tag=({bold:'strong',italic:'em',underline:'u',strike:'s',code:'code'} as Record<string,string>)[mark.type];
        if(tag)content=createElement(tag,null,content);
        else if(mark.type==='link'&&safeLink(mark.attrs?.href))content=<a href={mark.attrs.href} rel="noopener noreferrer">{content}</a>;
      }
      return <span key={key}>{content}</span>;
    }
    case 'doc':return <div className="rich-document" key={key}>{children}</div>;
    case 'paragraph':return <p key={key}>{children}</p>;
    case 'heading':{const level=Number(n.attrs?.level);return createElement(`h${Number.isInteger(level)&&level>=2&&level<=6?level:2}`,{key},children);}
    case 'hardBreak':return <br key={key}/>;
    case 'horizontalRule':return <hr key={key}/>;
    case 'bulletList':return <ul key={key}>{children}</ul>;
    case 'orderedList':return <ol key={key} start={typeof n.attrs?.start==='number'?n.attrs.start:1}>{children}</ol>;
    case 'listItem':return <li key={key}>{children}</li>;
    case 'blockquote':return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock':return <pre key={key}><code>{children}</code></pre>;
    case 'table':return <div className="rich-table" key={key}><table><tbody>{children}</tbody></table></div>;
    case 'tableRow':return <tr key={key}>{children}</tr>;
    case 'tableHeader':return <th key={key}>{children}</th>;
    case 'tableCell':return <td key={key}>{children}</td>;
    case 'studioImage':{
      const ref=n.attrs?.ref;if(typeof ref!=='string'||!uploadedCover(ref))return null;
      const alt=typeof n.attrs?.alt==='string'?n.attrs.alt:'';
      const caption=typeof n.attrs?.caption==='string'?n.attrs.caption:'';
      return <figure key={key}><img src={coverPath(ref,privatePreview)!} alt={alt} loading="lazy"/>{caption&&<figcaption>{caption}</figcaption>}</figure>;
    }
    default:return null;
  }
}
export function RichRender({document,privatePreview=false}:{document:RichNode;privatePreview?:boolean}){return render(document,0,privatePreview);}
