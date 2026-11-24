import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getPost} from '@/lib/posts';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const post=getPost((await params).slug);return post?{title:`${post.title} | Cedar & Cursor`,description:post.summary,openGraph:{title:post.title,description:post.summary,type:'article'}}:{title:'Article not found'};}
export default async function Article({params}:Props){const post=getPost((await params).slug);if(!post)notFound();return <main id="main" className="article-page"><article className="wrap article-wrap"><Link className="textbtn" href="/blog">← All insights</Link><div className="article-intro"><span>{post.category} · {post.minutes} min read</span><h1>{post.title}</h1><p>{post.summary}</p></div><div className="article-body">{post.sections.map(s=><section key={s.heading}><h2>{s.heading}</h2><p>{s.body}</p></section>)}<Link className="btn darkbtn" href="/#estimate">Explore your project ↗</Link></div></article></main>}
