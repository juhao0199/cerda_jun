import { readingMinutes, type PublicArticle, type PublicPost } from './blog-content.ts';
import type { PublicWebsiteFields } from './website-content';

export type ArticleNotes = {
  seoTitle: string;
  seoDescription: string;
  summary: string;
  takeaway: string;
  sectionsToAppend: PublicArticle['sections'];
  related: string[];
};
export type EditorialArticle = PublicArticle & {
  takeaway?: string;
  guidance?: PublicArticle['sections'];
  related?: string[];
};

type ReplaceableField = 'homeTitle' | 'homeDescription' | 'blogTitle' | 'blogDescription' | 'faq' | 'guidance';
export type WebsiteEdition = Pick<PublicWebsiteFields, ReplaceableField> & { copy: Partial<PublicWebsiteFields['copy']> };
const textFields = ['homeTitle', 'homeDescription', 'blogTitle', 'blogDescription'] as const;

// The edition is based on a known public release. A later edit published in the CMS wins.
export function applyWebsiteEdition(current: PublicWebsiteFields, baseline: PublicWebsiteFields, edition: WebsiteEdition): PublicWebsiteFields {
  const fields = { ...current, copy: { ...current.copy } };
  for (const key of textFields) {
    if (current[key] === baseline[key]) fields[key] = edition[key];
  }
  for (const key of Object.keys(edition.copy) as Array<keyof PublicWebsiteFields['copy']>) {
    const change = edition.copy[key];
    if (change !== undefined && current.copy[key] === baseline.copy[key]) fields.copy[key] = change;
  }
  for (const key of ['faq', 'guidance'] as const) {
    const questionsEqual = current[key].length === baseline[key].length
      && current[key].every((item, index) => item.question === baseline[key][index].question && item.answer === baseline[key][index].answer);
    if (questionsEqual) fields[key] = edition[key];
  }
  return fields;
}

function samePublication(post: PublicPost, baseline: PublicPost | undefined) {
  return baseline && post.slug === baseline.slug && post.title === baseline.title
    && post.summary === baseline.summary && post.category === baseline.category
    && post.cover === baseline.cover && post.publishedAt === baseline.publishedAt
    && (post.modifiedAt ?? post.publishedAt) === (baseline.modifiedAt ?? baseline.publishedAt);
}

export function applyPostEdition(post: PublicPost, baseline: PublicArticle | undefined, notes: ArticleNotes | undefined): PublicPost {
  if (!notes || !baseline || !samePublication(post, baseline)) return post;
  return { ...post, summary: notes.summary, minutes: readingMinutes(baseline, notes.sectionsToAppend) };
}

export function applyArticleEdition(post: PublicArticle, baseline: PublicArticle | undefined, notes: ArticleNotes | undefined): EditorialArticle {
  if (!notes || !samePublication(post, baseline)) return post;
  return {
    ...post,
    summary: notes.summary,
    minutes: readingMinutes(post, notes.sectionsToAppend),
    seoTitle: notes.seoTitle,
    seoDescription: notes.seoDescription,
    takeaway: notes.takeaway,
    guidance: notes.sectionsToAppend,
    related: notes.related,
  };
}
