import 'server-only';
import articleSnapshot from '@/content/articles.json';
import editorial from '@/content/editorial.json';
import type { PublicArticle, PublicPost } from './blog-content';

export { siteUrl } from './site';
type EditorialNote = {
  seoTitle: string;
  seoDescription: string;
  summary: string;
  takeaway: string;
  sectionsToAppend: PublicArticle['sections'];
  related: string[];
};
export type ShowcaseArticle = PublicArticle & {
  takeaway?: string;
  guidance?: PublicArticle['sections'];
  related?: string[];
};

const notes: Record<string, EditorialNote> = editorial.insights;
export const articles: ShowcaseArticle[] = (articleSnapshot as PublicArticle[]).map(article => {
  const note = notes[article.slug];
  if (!note) return article;
  return {
    ...article,
    summary: note.summary,
    seoTitle: note.seoTitle,
    seoDescription: note.seoDescription,
    takeaway: note.takeaway,
    guidance: note.sectionsToAppend,
    related: note.related,
  };
});

export async function publicPosts(page = 1): Promise<{results: PublicPost[]; page: number; hasMore: boolean}> {
  const pageSize = 12;
  return {
    results: articles.slice((page - 1) * pageSize, page * pageSize),
    page,
    hasMore: articles.length > page * pageSize,
  };
}

export async function publicArticle(slug: string): Promise<ShowcaseArticle | null> {
  return articles.find(article => article.slug === slug) ?? null;
}
