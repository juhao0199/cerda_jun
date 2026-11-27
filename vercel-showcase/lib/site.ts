export const studioName = 'Cedar & Cursor';
export const studioEmail = 'jun@cedarandcursor.com';
export const organizationId = () => `${siteUrl()}/#organization`;
export const isPreview = () => process.env.VERCEL_ENV === 'preview';

export function siteUrl() {
  const url = new URL(process.env.SITE_URL || 'https://cedarandcursor.com');
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('SITE_URL must be HTTPS.');
  return url.origin;
}

export function breadcrumb(items: Array<{ name: string; path: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, path }, index) => ({
      '@type': 'ListItem', position: index + 1, name, item: `${siteUrl()}${path}`,
    })),
  };
}
