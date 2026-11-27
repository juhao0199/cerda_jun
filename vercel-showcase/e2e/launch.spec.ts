import { expect, test } from '@playwright/test';

const origin = 'https://cedarandcursor.com';
const pages = ['/', '/blog', '/blog/business-website-budget', '/blog/when-to-build-custom-software', '/blog/practical-ai-for-business', '/services/web-development', '/services/business-software', '/services/ai-systems', '/services/automation'];

test('every public page is readable, indexable and canonical', async ({ page }) => {
  test.setTimeout(75_000);
  const errors: string[] = [];
  const localRequestErrors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).hostname === '127.0.0.1') localRequestErrors.push(r.url()); });
  const titles = new Set<string>();
  for (const path of pages) {
    const response = await page.goto(path, {waitUntil:'domcontentloaded'});
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main h1')).toHaveCount(1);
    expect(new URL((await page.locator('link[rel=canonical]').getAttribute('href'))!).href).toBe(origin+path);
    expect(await page.locator('meta[name=robots]').getAttribute('content')).not.toContain('noindex');
    expect((await page.locator('meta[name=description]').getAttribute('content'))!.length).toBeGreaterThan(80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    titles.add(await page.title());
    for (const text of await page.locator('script[type="application/ld+json"]').allTextContents()) {
      expect(JSON.parse(text)['@context']).toBe('https://schema.org');
    }
  }
  expect(titles.size).toBe(pages.length);
  expect(errors).toEqual([]);
  expect(localRequestErrors).toEqual([]);
});

test('sitemap, robots, feed and published media are available', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  for (const path of pages) expect(xml).toContain(`<loc>${origin}${path}</loc>`);
  expect(xml).not.toContain('/workspace');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  const rss = await request.get('/rss.xml');
  expect(rss.ok()).toBe(true);
  expect((await rss.text()).match(/<item>/g)).toHaveLength(3);
  const article = await request.get('/blog/practical-ai-for-business');
  const image = (await article.text()).match(/\/published-media\/[a-f0-9-]+\.(?:jpg|webp|png)/)?.[0];
  expect(image).toBeTruthy();
  const media = await request.get(image!);
  expect(media.ok()).toBeTruthy();
  expect(media.headers()['content-type']).toMatch(/^image\//);
  expect((await request.get('/workspace')).status()).toBe(404);
});

test('FAQ schema matches real questions, service guides are reachable and contact is direct', async ({ page }, info) => {
  await page.goto('/');
  const faq = page.locator('#faq');
  const questions = faq.locator('summary');
  await expect(questions).toHaveCount(9);
  await questions.first().click();
  const answer = questions.first().locator('..').locator('p');
  await expect(answer).toBeVisible();
  expect((await answer.innerText()).length).toBeGreaterThan(150);
  const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() || '{}')['@graph'];
  const faqs = graph.find((entry: {'@type':string}) => entry['@type'] === 'FAQPage');
  const names = faqs.mainEntity.map((item: {name:string}) => item.name);
  for (const question of await questions.allTextContents()) expect(names).toContain(question.replace(/\+$/, '').trim());
  const contact = page.locator('#contact');
  await expect(contact.getByRole('link',{name:'jun@cedarandcursor.com'})).toHaveAttribute('href','mailto:jun@cedarandcursor.com');
  await page.locator('#service-guides').getByRole('link',{name:/Business software/}).click();
  await expect(page.locator('h1')).toHaveText('Software for a workflow your team already understands');
  await page.getByRole('link',{name:'Read the related guide'}).click();
  await expect(page.getByText('Quick answer',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('insight.png')});
});
