import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import {cache} from 'react';
import {publicArticle,siteUrl} from '@/lib/blog-server';
import {coverPath} from '@/lib/blog-content';
const getPost=cache(publicArticle);
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const post=await getPost((await params).slug);
  if(!post)return {title:'Article not found',robots:{index:false,follow:false}};
  const title=post.seoTitle||`${post.title} | Cedar & Cursor`,description=post.seoDescription||post.summary,url=`${siteUrl()}/blog/${post.slug}`,cover=coverPath(post.cover);
  return {title,description,alternates:{canonical:url},openGraph:{title,description,url,type:'article',publishedTime:post.publishedAt,tags:post.tags,...(cover?{images:[`${siteUrl()}${cover}`]}:{})}};
}
export default async function Article({params}:Props){
  const post=await getPost((await params).slug);if(!post)notFound();
  const cover=coverPath(post.cover),nonce=(await headers()).get('x-nonce')??undefined;
  const structured={'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.summary,datePublished:post.publishedAt,mainEntityOfPage:`${siteUrl()}/blog/${post.slug}`,author:{'@type':'Organization',name:'Cedar & Cursor'},publisher:{'@type':'Organization',name:'Cedar & Cursor'},...(cover?{image:`${siteUrl()}${cover}`}:{})};
  return <main id="main" className="article-page"><script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:JSON.stringify(structured).replace(/</g,'\\u003c')}}/><article className="wrap article-wrap"><Link className="textbtn" href="/blog">← All insights</Link><div className="article-intro"><span>{post.category} · {post.minutes} min read</span><h1>{post.title}</h1><p>{post.summary}</p></div>{cover&&<img className="blog-cover" src={cover} alt=""/>}<div className="article-body">{post.sections.map((s,i)=><section key={i}><h2>{s.heading}</h2>{s.body.split(/\n\s*\n/).map((p,j)=><p key={j} className="blog-paragraph">{p}</p>)}</section>)}{post.tags.length>0&&<p className="blog-tags">{post.tags.join(' · ')}</p>}<Link className="btn darkbtn" href="/#estimate">Explore your project ↗</Link></div></article></main>
}
