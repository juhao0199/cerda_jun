import 'server-only';
import type { Metadata } from 'next';
import snapshot from '@/content/website.json';
import editorial from '@/content/editorial.json';
import type { PublicWebsiteFields } from './website-content';
import { isPreview, siteUrl, studioName } from './site';

export const publicWebsite = {
  ...snapshot,
  fields: {
    ...snapshot.fields,
    ...editorial.website,
    copy: { ...snapshot.fields.copy, ...editorial.website.copy },
  } satisfies PublicWebsiteFields,
};

export function pageMetadata(title: string, description: string, path: string, noindex = false): Metadata {
  const url = `${siteUrl()}${path}`;
  return {
    title, description, robots: { index: !isPreview() && !noindex, follow: !isPreview() },
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: studioName, images: ['/share.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/share.png'] },
  };
}

export function websiteMetadata(route: 'home' | 'blog'): Metadata {
  const fields = publicWebsite.fields;
  const home = route === 'home';
  const metadata = pageMetadata(home ? fields.homeTitle : fields.blogTitle, home ? fields.homeDescription : fields.blogDescription, home ? '/' : '/blog', home ? fields.homeNoindex : fields.blogNoindex);
  return home ? metadata : { ...metadata, alternates: { ...metadata.alternates, types: { 'application/rss+xml': `${siteUrl()}/rss.xml` } } };
}
