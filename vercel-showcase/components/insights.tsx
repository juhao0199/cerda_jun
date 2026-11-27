import {websiteDefaults,type SiteCopy} from '@/lib/website-content';
import {InsightsView} from './insights-view';
import {publicPosts} from '@/lib/blog-server';
export async function Insights({all=false,page=1,copy=websiteDefaults.copy}:{all?:boolean;page?:number;copy?:SiteCopy}={}) {
  return <InsightsView all={all} page={page} copy={copy} result={await publicPosts(page)}/>;
}
