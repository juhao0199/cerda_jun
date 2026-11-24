import type {MetadataRoute} from 'next';
import {siteUrl} from '@/lib/blog-server';
export const dynamic='force-dynamic';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/workspace','/login','/api/']},sitemap:siteUrl()+'/sitemap.xml'};}
