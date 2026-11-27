import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { articles, publicArticle } from '@/lib/blog-server';
import { coverPath } from '@/lib/blog-content';
import { breadcrumb, organizationId, siteUrl } from '@/lib/site';
import { pageMetadata } from '@/lib/website-server';
import { safeJsonLd } from '@/lib/website-schema';
import { RichRender } from '@/components/blog/rich-render';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return articles.map(({slug}) => ({slug})); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await publicArticle((await params).slug) ?? notFound();
  const path = `/blog/${post.slug}`;
  const title = post.seoTitle || `${post.title} | Cedar & Cursor`;
  const description = post.seoDescription || post.summary;
  const image = coverPath(post.cover) || '/share.png';
  const base = pageMetadata(title, description, path, post.noindex);
  return {
    ...base,
    openGraph: { type:'article', title, description, url:`${siteUrl()}${path}`, publishedTime:post.publishedAt, modifiedTime:post.modifiedAt ?? post.publishedAt, tags:post.tags, images:[{url:image, alt:post.coverAlt || 'Cedar & Cursor Insights'}] },
    twitter: { card:'summary_large_image', title, description, images:[image] },
  };
}

export default async function Article({ params }: Props) {
  const post = await publicArticle((await params).slug) ?? notFound();
  const cover = coverPath(post.cover);
  const path = `/blog/${post.slug}`;
  const url = `${siteUrl()}${path}`;
  const related = (post.related ?? []).flatMap(slug => articles.filter(item => item.slug === slug));
  const wordCount = [...post.sections, ...(post.guidance ?? [])].reduce((n,s)=>n+s.body.trim().split(/\s+/).length,0);
  const minutes = Math.max(post.minutes, Math.ceil(wordCount / 200));
  const graph = { '@context':'https://schema.org', '@graph': [
    { '@type':'BlogPosting', '@id':`${url}#article`, headline:post.title, description:post.summary, datePublished:post.publishedAt, dateModified:post.modifiedAt ?? post.publishedAt, mainEntityOfPage:url, inLanguage:'en', author:post.author && post.author !== 'Cedar & Cursor' ? {'@type':'Person',name:post.author} : {'@type':'Organization','@id':organizationId(),name:'Cedar & Cursor',url:siteUrl()}, publisher:{'@id':organizationId()}, image:`${siteUrl()}${cover || '/share.png'}` },
    breadcrumb([{name:'Home',path:'/'},{name:'Insights',path:'/blog'},{name:post.title,path}]),
  ] };
  return <main id="main" className="article-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(graph)}} />
    <article className="wrap article-wrap">
      <nav className="page-crumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/blog">Insights</Link></nav>
      <div className="article-intro"><span>{post.category} · {minutes} min read · {post.author || 'Cedar & Cursor'}</span><h1>{post.title}</h1><p>{post.summary}</p></div>
      {cover && <img className="blog-cover" src={cover} alt={post.coverAlt ?? ''} />}
      <div className="article-body">
        {post.takeaway && <aside className="article-takeaway"><strong>Quick answer</strong><p>{post.takeaway}</p></aside>}
        {post.document ? <RichRender document={post.document} /> : post.sections.map(section => <section key={section.heading}><h2>{section.heading}</h2><p className="blog-paragraph">{section.body}</p></section>)}
        {post.guidance?.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="blog-paragraph">{paragraph}</p>)}</section>)}
        {post.tags.length > 0 && <p className="blog-tags">{post.tags.join(' · ')}</p>}
        {related.length > 0 && <section className="reading-next"><h2>Related guides</h2><ul>{related.map(item => <li key={item.slug}><Link href={`/blog/${item.slug}`}>{item.title}</Link></li>)}</ul></section>}
        <Link className="btn darkbtn" href="/#estimate">Explore your project</Link>
      </div>
    </article>
  </main>;
}
