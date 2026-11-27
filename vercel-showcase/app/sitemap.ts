import type { MetadataRoute } from 'next';
import { articles } from '@/lib/blog-server';
import { publicWebsite } from '@/lib/website-server';
import { servicePages } from '@/lib/service-content';
import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  const { fields, publishedAt } = publicWebsite;
  const routes: MetadataRoute.Sitemap = [];
  if (!fields.homeNoindex) routes.push({ url:`${site}/`, ...(publishedAt ? { lastModified:publishedAt } : {}) });
  if (!fields.blogNoindex) routes.push({ url:`${site}/blog` });
  for (const service of servicePages) routes.push({ url:`${site}/services/${service.slug}` });
  for (const post of articles.filter(item => !item.noindex)) routes.push({ url:`${site}/blog/${post.slug}`, lastModified:post.modifiedAt ?? post.publishedAt });
  return routes;
}
