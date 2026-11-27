import { publicOnly } from './deployment';

export const studioName = 'Cedar & Cursor';
export const studioEmail = 'jun@cedarandcursor.com';
export const isPreview = () => publicOnly && process.env.VERCEL_ENV === 'preview';

export function siteUrl() {
  const fallback = publicOnly ? 'https://cedarandcursor.com' : 'http://localhost:3000';
  return new URL(process.env.SITE_URL || fallback).origin;
}

export const organizationId = () => `${siteUrl()}/#organization`;

export function breadcrumb(items: Array<{ name: string; path: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, path }, index) => ({
      '@type': 'ListItem', position: index + 1, name, item: `${siteUrl()}${path}`,
    })),
  };
}
