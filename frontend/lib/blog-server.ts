import 'server-only';
import type {PublicArticle,PublicPost} from './blog-content';
import {validSlug} from './blog-content';

// Direct server-to-server public-only API. Do not forward cookies, Authorization or request headers.
export function siteUrl(){return new URL(process.env.SITE_URL || 'http://localhost:3000').origin;}
async function request(path:string){
  const backend=(process.env.BACKEND_URL||'http://127.0.0.1:8000').replace(/\/$/,'');
  const site=new URL(process.env.BLOG_BACKEND_ORIGIN || backend);
  return fetch(`${backend}/api/v1/public/blog/${path}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json',Host:site.host,'X-Forwarded-Proto':site.protocol.slice(0,-1)}});
}
export async function publicPosts(page=1):Promise<{results:PublicPost[];page:number;hasMore:boolean}>{
  const response=await request(`list/?page=${page}`);
  if(!response.ok)throw new Error('Public blog is unavailable.');
  return response.json();
}
export async function publicArticle(slug:string):Promise<PublicArticle|null>{
  if(!validSlug(slug))return null;
  const response=await request(`detail/${slug}/`);
  if(response.status===404)return null;
  if(!response.ok)throw new Error('Public blog is unavailable.');
  return response.json();
}
