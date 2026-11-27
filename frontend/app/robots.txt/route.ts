import { publicOnly } from '@/lib/deployment';
import { isPreview, siteUrl } from '@/lib/site';

export const dynamic='force-dynamic';
export async function GET(){
  if (publicOnly) {
    const rules = isPreview() ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /workspace\nDisallow: /login\nSitemap: ${siteUrl()}/sitemap.xml\n`;
    return new Response(rules, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const backend=(process.env.BACKEND_URL||'http://127.0.0.1:8000').replace(/\/$/,'');
  try{
    const upstream=new URL(process.env.BLOG_BACKEND_ORIGIN||backend);
    const response=await fetch(`${backend}/api/v1/public/blog/robots/`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'text/plain',Host:upstream.host,'X-Forwarded-Proto':upstream.protocol.slice(0,-1)}});
    if(!response.ok)throw new Error('Policy unavailable');
    return new Response(await response.text(),{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return new Response('Robots policy unavailable.\n',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
