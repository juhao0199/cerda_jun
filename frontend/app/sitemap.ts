import type {MetadataRoute} from 'next';
import {publicWebsite} from '@/lib/website-server';
import {publicPosts,siteUrl} from '@/lib/blog-server';
import {servicePages} from '@/lib/service-content';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const site=siteUrl();const {fields,publishedAt,available}=await publicWebsite();if(!available)throw new Error('Public website settings unavailable.');const entries:MetadataRoute.Sitemap=[];
  if(!fields.homeNoindex)entries.push({url:site+'/',...(publishedAt?{lastModified:publishedAt}:{})});
  if(!fields.blogNoindex)entries.push({url:site+'/blog'});
  for (const service of servicePages) entries.push({ url: `${site}/services/${service.slug}` });
  for(let page=1;page<=1000;page++){
    const result=await publicPosts(page);entries.push(...result.results.filter(p=>!p.noindex).map(p=>({url:`${site}/blog/${p.slug}`,lastModified:p.modifiedAt??p.publishedAt})));
    if(!result.hasMore)return entries;
  }
  throw new Error('Blog sitemap pagination limit reached.');
}
