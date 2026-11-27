import { websiteDefaults, type SiteCopy } from '@/lib/website-content';
import Link from 'next/link';
import { publicPosts } from '@/lib/blog-server';
import { ArticleGrid } from './blog/article-card';

export async function Insights({ all = false, page = 1, copy = websiteDefaults.copy }: { all?: boolean; page?: number; copy?: SiteCopy }) {
  let result;
  try {
    result = await publicPosts(page);
  } catch (error) {
    if (all) throw error;
    return <section className="section insights" id="insights"><div className="wrap">
      <div className="section-head"><h2>{copy.insightsHeading}</h2><p>Insights are temporarily unavailable.</p></div>
      <Link className="textbtn" href="/blog">Read the blog ↗</Link>
    </div></section>;
  }

  const posts = all ? result.results : result.results.slice(0, 3);
  const Heading = all ? 'h1' : 'h2';
  return <section className="section insights" id="insights"><div className="wrap">
    <div className="section-head" data-cedar-route={all ? "" : undefined} data-cedar-reveal={all ? undefined : "copy"}><Heading>{all ? 'Insights.' : copy.insightsHeading}</Heading><p>{copy.insightsIntro}</p></div>
    {posts.length ? <ArticleGrid posts={posts} headingLevel={all ? 2 : 3} eagerCovers={all} /> : <p>No published articles on this page.</p>}
    {all ? <nav aria-label="Blog pagination" className="blog-pagination">
      {page > 1 && <Link className="textbtn" href={page === 2 ? '/blog' : `/blog?page=${page - 1}`}>← Previous</Link>}
      {result.hasMore && <Link className="textbtn" href={`/blog?page=${page + 1}`}>Next →</Link>}
      <a className="textbtn" href="/rss.xml">RSS ↗</a>
    </nav> : <Link className="textbtn" href="/blog">Read the blog ↗</Link>}
  </div></section>;
}
