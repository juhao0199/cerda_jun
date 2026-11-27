import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';
import { publicArticle, publicRelatedPosts } from '@/lib/blog-server';
import { coverPath, validSlug } from '@/lib/blog-content';
import { breadcrumb, organizationId, siteUrl } from '@/lib/site';
import { pageMetadata } from '@/lib/website-server';
import { safeJsonLd } from '@/lib/website-schema';
import { RichRender } from '@/components/blog/rich-render';
import { ArticleGrid, RelatedTopics } from '@/components/blog/article-card';
import { topicsFor } from '@/lib/blog-topics';
import styles from './article-detail.module.css';

type Props = { params: Promise<{ slug: string }> };

const getPost = cache(async (slug: string) => {
  const result = await publicArticle(slug);
  if (result && 'redirectSlug' in result) {
    if (!validSlug(result.redirectSlug)) throw new Error('Invalid canonical slug.');
    permanentRedirect(`/blog/${result.redirectSlug}`);
  }
  return result;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: 'Article not found', robots: { index: false, follow: false } };

  const path = `/blog/${post.slug}`;
  const title = post.seoTitle || `${post.title} | Cedar & Cursor`;
  const description = post.seoDescription || post.summary;
  const cover = coverPath(post.cover);
  const image = `${siteUrl()}${cover || '/share.png'}`;
  const base = pageMetadata(title, description, path, post.noindex);

  return {
    ...base,
    openGraph: {
      type: 'article', title, description, url: `${siteUrl()}${path}`, publishedTime: post.publishedAt,
      modifiedTime: post.modifiedAt ?? post.publishedAt, tags: post.tags,
      images: [{ url: image, alt: cover ? post.coverAlt ?? '' : 'Cedar & Cursor Insights' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function Article({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();

  const cover = coverPath(post.cover);
  const path = `/blog/${post.slug}`;
  const url = `${siteUrl()}${path}`;
  const [requestHeaders, related] = await Promise.all([headers(), publicRelatedPosts(post)]);
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const topics = topicsFor(post);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting', '@id': `${url}#article`, headline: post.title, description: post.summary,
        datePublished: post.publishedAt, dateModified: post.modifiedAt ?? post.publishedAt,
        mainEntityOfPage: url, inLanguage: 'en',
        author: post.author && post.author !== 'Cedar & Cursor'
          ? { '@type': 'Person', name: post.author }
          : { '@type': 'Organization', '@id': organizationId(), name: 'Cedar & Cursor', url: siteUrl() },
        publisher: { '@id': organizationId() }, image: `${siteUrl()}${cover || '/share.png'}`,
      },
      breadcrumb([{ name: 'Home', path: '/' }, { name: 'Insights', path: '/blog' }, { name: post.title, path }]),
    ],
  };

  return <main id="main" className="article-page">
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: safeJsonLd(graph) }} />
    <article className="wrap article-wrap">
      <nav className="page-crumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/blog">Insights</Link></nav>
      <div className="article-intro" data-cedar-route="">
        <span>{post.category} · {post.minutes} min read · {post.author || 'Cedar & Cursor'}</span>
        <h1>{post.title}</h1><p>{post.summary}</p>
      </div>
      {cover && <div data-cedar-media="feature"><img className="blog-cover" src={cover} alt={post.coverAlt ?? ''} width={1200} height={630} /></div>}
      <div className="article-body">
        {post.takeaway && <aside className="article-takeaway"><strong>Quick answer</strong><p>{post.takeaway}</p></aside>}
        {post.document ? <RichRender document={post.document} /> : post.sections.map((section, index) => <section key={index}>
          <h2 data-cedar-reveal="copy">{section.heading}</h2>
          {section.body.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="blog-paragraph">{paragraph}</p>)}
        </section>)}
        {post.guidance?.map(section => <section key={section.heading}>
          <h2 data-cedar-reveal="copy">{section.heading}</h2>
          {section.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="blog-paragraph">{paragraph}</p>)}
        </section>)}
        <aside className={styles.topics} aria-label="Article topics"><RelatedTopics topics={topics} /></aside>
      </div>
      {related.length > 0 && <section id="related-articles" className={styles.related} aria-labelledby="related-articles-heading">
        <h2 id="related-articles-heading" data-cedar-reveal="copy">Related articles</h2>
        <ArticleGrid posts={related} headingLevel={3} />
      </section>}
      <div className={styles.actions}>
        <Link className="btn darkbtn" href="/#estimate">Explore your project</Link>
      </div>
    </article>
  </main>;
}
