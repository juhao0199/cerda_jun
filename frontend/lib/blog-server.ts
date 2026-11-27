import 'server-only';
import type { PublicArticle, PublicPost } from './blog-content';
import { validSlug } from './blog-content';
import { rankRelatedPosts, relatedSlugsFor } from './blog-topics';
import { publicOnly } from './deployment';
import { applyArticleEdition, applyPostEdition, type ArticleNotes, type EditorialArticle } from './editorial-release';
import bundledArticles from '@/content/articles.json';
import releaseNotes from '@/content/editorial.json';

export { siteUrl } from './site';
const snapshots: PublicArticle[] = bundledArticles;
const notes: Record<string, ArticleNotes> = releaseNotes.insights;
const snapshot = (slug: string) => snapshots.find(post => post.slug === slug);

// Forward neither browser credentials nor request headers to the public CMS API.
async function request(path: string) {
  const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const site = new URL(process.env.BLOG_BACKEND_ORIGIN || backend);
  return fetch(`${backend}/api/v1/public/blog/${path}`, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json', Host: site.host, 'X-Forwarded-Proto': site.protocol.slice(0, -1) },
  });
}

type PostPage = { results: PublicPost[]; page: number; hasMore: boolean };

export async function publicPosts(page = 1): Promise<PostPage> {
  if (publicOnly) {
    const pageSize = 24;
    return {
      results: snapshots.slice((page - 1) * pageSize, page * pageSize).map(post => applyPostEdition(post, post, notes[post.slug])),
      page,
      hasMore: snapshots.length > page * pageSize,
    };
  }
  const response = await request(`list/?page=${page}`);
  if (!response.ok) throw new Error('Public blog is unavailable.');
  const result: PostPage = await response.json();
  return { ...result, results: result.results.map(post => applyPostEdition(post, snapshot(post.slug), notes[post.slug])) };
}

export async function publicArticle(slug: string): Promise<EditorialArticle | { redirectSlug: string } | null> {
  if (!validSlug(slug)) return null;
  if (publicOnly) {
    const post = snapshot(slug);
    return post ? applyArticleEdition(post, post, notes[slug]) : null;
  }
  const response = await request(`detail/${slug}/`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public blog is unavailable.');
  const post: PublicArticle | { redirectSlug: string } = await response.json();
  return 'redirectSlug' in post ? post : applyArticleEdition(post, snapshot(post.slug), notes[post.slug]);
}

const relatedLimit = 3;

export async function publicRelatedPosts(post: EditorialArticle): Promise<PublicPost[]> {
  const slugs = relatedSlugsFor(post.slug, post.related).slice(0, relatedLimit);
  const lookups = await Promise.allSettled(slugs.map(async slug => {
    const result = await publicArticle(slug);
    return result && 'redirectSlug' in result ? publicArticle(result.redirectSlug) : result;
  }));

  const related = new Map<string, PublicPost>();
  for (const lookup of lookups) {
    if (lookup.status !== 'fulfilled') continue;
    const article = lookup.value;
    if (article && !('redirectSlug' in article) && article.slug !== post.slug) {
      related.set(article.slug, article);
    }
  }

  if (related.size < relatedLimit) {
    try {
      const { results } = await publicPosts();
      for (const candidate of rankRelatedPosts(post, results)) {
        if (!related.has(candidate.slug)) related.set(candidate.slug, candidate);
        if (related.size === relatedLimit) break;
      }
    } catch {
      // An unavailable recommendation feed should not prevent reading the article.
    }
  }

  return [...related.values()];
}
