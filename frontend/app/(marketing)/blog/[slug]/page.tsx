import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound,permanentRedirect} from 'next/navigation';
import {headers} from 'next/headers';
import {cache} from 'react';
import {publicArticle,siteUrl} from '@/lib/blog-server';
import {coverPath,validSlug,type PublicArticle} from '@/lib/blog-content';
import {RichRender} from '@/components/blog/rich-render';
const getPost=cache(async(slug:string):Promise<PublicArticle|null>=>{const result=await publicArticle(slug);if(result&&'redirectSlug' in result){if(!validSlug(result.redirectSlug))throw new Error('Invalid canonical slug.');permanentRedirect(`/blog/${result.redirectSlug}`);}return result;});
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const post=await getPost((await params).slug);
  if(!post)return {title:'Article not found',robots:{index:false,follow:false}};
  const title=post.seoTitle||`${post.title} | Cedar & Cursor`,description=post.seoDescription||post.summary,url=`${siteUrl()}/blog/${post.slug}`,cover=coverPath(post.cover);
  return {title,description,robots:{index:!post.noindex,follow:true},alternates:{canonical:url},openGraph:{title,description,url,type:'article',publishedTime:post.publishedAt,modifiedTime:post.modifiedAt??post.publishedAt,tags:post.tags,...(cover?{images:[{url:`${siteUrl()}${cover}`,alt:post.coverAlt??''}]}:{})}};
}
export default async function Article({params}:Props){
  const post=await getPost((await params).slug);if(!post)notFound();
  const cover=coverPath(post.cover),nonce=(await headers()).get('x-nonce')??undefined;
  const structured={'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.summary,datePublished:post.publishedAt,dateModified:post.modifiedAt??post.publishedAt,mainEntityOfPage:`${siteUrl()}/blog/${post.slug}`,author:{'@type':post.author&&post.author!=='Cedar & Cursor'?'Person':'Organization',name:post.author||'Cedar & Cursor'},publisher:{'@type':'Organization',name:'Cedar & Cursor'},...(cover?{image:`${siteUrl()}${cover}`}:{})};
  return <main id="main" className="article-page"><script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:JSON.stringify(structured).replace(/</g,'\\u003c')}}/><article className="wrap article-wrap"><Link className="textbtn" href="/blog">← All insights</Link><div className="article-intro"><span>{post.category} · {post.minutes} min read · {post.author||'Cedar & Cursor'}</span><h1>{post.title}</h1><p>{post.summary}</p></div>{cover&&<img className="blog-cover" src={cover} alt={post.coverAlt??''}/>}<div className="article-body">{post.document?<RichRender document={post.document}/>:post.sections.map((s,i)=><section key={i}><h2>{s.heading}</h2>{s.body.split(/\n\s*\n/).map((p,j)=><p key={j} className="blog-paragraph">{p}</p>)}</section>)}{post.tags.length>0&&<p className="blog-tags">{post.tags.join(' · ')}</p>}<Link className="btn darkbtn" href="/#estimate">Explore your project ↗</Link></div></article></main>
}
