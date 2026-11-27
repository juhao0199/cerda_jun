import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import { publicDefaults, type PublicWebsiteFields } from './website-content';
import { publicOnly } from './deployment';
import { applyWebsiteEdition } from './editorial-release';
import { isPreview, siteUrl, studioName } from './site';
import snapshot from '@/content/website.json';
import editorial from '@/content/editorial.json';

export const publicWebsite = cache(async (): Promise<{ fields: PublicWebsiteFields; publishedAt: string | null; available: boolean }> => {
  if (publicOnly) {
    const fields = applyWebsiteEdition(snapshot.fields, snapshot.fields, editorial.website);
    return { ...snapshot, fields: { ...fields, faqSchema: true }, available: true };
  }
  try {
    const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const site = new URL(process.env.BLOG_BACKEND_ORIGIN || backend);
    const response = await fetch(`${backend}/api/v1/public/blog/website/`, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json', Host: site.host, 'X-Forwarded-Proto': site.protocol.slice(0, -1) },
    });
    if (!response.ok) throw new Error('Website content unavailable');
    const value: { fields: PublicWebsiteFields; publishedAt: string | null } = await response.json();
    if (!value.fields?.copy || !Array.isArray(value.fields.faq) || !Array.isArray(value.fields.guidance)) throw new Error('Invalid public snapshot');
    return { ...value, fields: applyWebsiteEdition(value.fields, snapshot.fields, editorial.website), available: true };
  } catch {
    // Keep the page useful during an outage, without treating fallback copy as a live publication.
    return { fields: { ...publicDefaults, homeNoindex: true, blogNoindex: true }, publishedAt: null, available: false };
  }
});

export function pageMetadata(title: string, description: string, path: string, noindex = false): Metadata {
  const url = `${siteUrl()}${path}`;
  const image = `${siteUrl()}/share.png`;
  return {
    title, description, robots: { index: !isPreview() && !noindex, follow: !isPreview() },
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: studioName, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export function websiteMetadata(fields: PublicWebsiteFields, route: 'home' | 'blog', page = 1): Metadata {
  if (route === 'home') return pageMetadata(fields.homeTitle, fields.homeDescription, '/', fields.homeNoindex);
  const title = page > 1 ? `${fields.blogTitle} | Page ${page}` : fields.blogTitle;
  const metadata = pageMetadata(title, fields.blogDescription, `/blog${page > 1 ? `?page=${page}` : ''}`, fields.blogNoindex);
  return { ...metadata, alternates: { ...metadata.alternates, types: { 'application/rss+xml': `${siteUrl()}/rss.xml` } } };
}
