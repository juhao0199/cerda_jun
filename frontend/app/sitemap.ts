import type {MetadataRoute} from 'next';
import {publicPosts,siteUrl} from '@/lib/blog-server';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const site=siteUrl();const entries:MetadataRoute.Sitemap=[{url:site+'/'},{url:site+'/blog'},{url:site+'/privacy'}];
  for(let page=1;page<=1000;page++){
    const result=await publicPosts(page);entries.push(...result.results.map(p=>({url:`${site}/blog/${p.slug}`,lastModified:p.publishedAt})));
    if(!result.hasMore)return entries;
  }
  throw new Error('Blog sitemap pagination limit reached.');
}
