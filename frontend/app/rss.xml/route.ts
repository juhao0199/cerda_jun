import {publicPosts,siteUrl} from '@/lib/blog-server';
import {xml} from '@/lib/blog-content';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const {results}=await publicPosts(),site=siteUrl();
    const items=results.slice(0,20).map(p=>{const url=`${site}/blog/${p.slug}`;return `<item><title>${xml(p.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><description>${xml(p.summary)}</description><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate></item>`;}).join('');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Cedar &amp; Cursor Insights</title><link>${xml(site+'/blog')}</link><description>Practical notes on websites, software and AI.</description>${items}</channel></rss>`,{headers:{'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return new Response('Feed temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
