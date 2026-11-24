import type {Metadata} from 'next';
import {Insights} from '@/components/insights';
import {siteUrl} from '@/lib/blog-server';
import {notFound} from 'next/navigation';
type Props={searchParams:Promise<{page?:string|string[]}>};
function pageNumber(value:string|string[]|undefined){if(value===undefined)return 1;if(typeof value!=='string'||!/^\d{1,4}$/.test(value)||Number(value)<1||Number(value)>1000)notFound();return Number(value);}
export async function generateMetadata({searchParams}:Props):Promise<Metadata>{const page=pageNumber((await searchParams).page);return {title:'Insights | Cedar & Cursor',description:'Practical notes on websites, software and AI for business owners.',alternates:{canonical:`${siteUrl()}/blog${page>1?`?page=${page}`:''}`,types:{'application/rss+xml':`${siteUrl()}/rss.xml`}}};}
export default async function BlogPage({searchParams}:Props){return <main id="main"><Insights all page={pageNumber((await searchParams).page)}/></main>}
