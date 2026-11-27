import { expect, test } from '@playwright/test';

test('sections enter once while native page scrolling remains available', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const entrance = page.locator('#studio-solutions [data-cedar-reveal]').first();
  await expect(entrance).toBeAttached();
  await entrance.evaluate(element => {
    const initial = element.hasAttribute('data-cedar-entered') ? 1 : 0;
    element.setAttribute('data-test-entries', String(initial));
    new MutationObserver(records => {
      const observed = Number(element.getAttribute('data-test-entries'));
      element.setAttribute('data-test-entries', String(observed + records.length));
    }).observe(element, { attributeFilter: ['data-cedar-entered'] });
  });

  if (isMobile) {
    await entrance.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  } else {
    const [delta, viewportHeight] = await entrance.evaluate(element => [
      element.getBoundingClientRect().top - innerHeight * 0.46,
      innerHeight,
    ]);
    const initialY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(28, Math.round(viewportHeight / 2));
    await page.mouse.wheel(0, Math.max(delta, viewportHeight * 0.28));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialY);
  }

  await expect(entrance).toHaveAttribute('data-cedar-entered', /.*/);
  await expect(entrance).not.toHaveCSS('animation-name', 'none');
  await expect.poll(() => entrance.evaluate(element =>
    element.getAnimations().every(animation => animation.playState === 'finished')
  )).toBe(true);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await entrance.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(entrance).toHaveAttribute('data-test-entries', '1');
  await expect(entrance).toHaveAttribute('data-cedar-entered', /.*/);
});

test('reduced motion keeps sections and navigation still and usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const entrance = page.locator('#studio-solutions [data-cedar-reveal]').first();
  await entrance.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(entrance).toBeVisible();
  await expect(entrance).not.toHaveAttribute('data-cedar-entered', /.*/);
  await expect(entrance).toHaveCSS('animation-name', 'none');
  await expect(entrance).toHaveCSS('opacity', '1');

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const openMenu = nav.getByRole('button', { name: 'Open menu' });
  if (await openMenu.isVisible()) await openMenu.click();
  await nav.getByRole('link', { name: 'Blog', exact: true }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const photo = page.locator('[data-cedar-media] > img').first();
  await expect(photo).toHaveCSS('animation-name', 'none');
});

test('desktop hero scale responds to scroll and retains the original mode switch', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The hero departure effect is desktop-only.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const supportsViewTimeline = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
  test.skip(!supportsViewTimeline, 'This browser does not support view timelines.');

  const hero = page.locator('#home');
  const visual = hero.locator('.system-visual');
  const visualScale = () => visual.evaluate(element => {
    const style = getComputedStyle(element);
    const matrix = style.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
    const scale = Number.parseFloat(style.scale);
    return Math.hypot(matrix.m11, matrix.m12, matrix.m13) * (Number.isFinite(scale) ? scale : 1);
  });

  const atStart = await visualScale();
  const position = await hero.evaluate(element => element.getBoundingClientRect().height * 0.55);
  await page.evaluate(offset => window.scrollTo({ top: offset, behavior: 'instant' }), position);
  await expect.poll(async () => Math.abs((await visualScale()) - atStart)).toBeGreaterThan(0.003);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(async () => Math.abs((await visualScale()) - atStart)).toBeLessThan(0.003);
  await hero.getByRole('button', { name: 'Software', exact: true }).click();
  await expect(hero.getByRole('img', { name: /events moving/i })).toBeVisible();
});

test('article photos use scroll transitions and linked detail still loads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/blog');
  const photo = page.locator('[data-cedar-media] > img').first();
  await expect(photo).toBeVisible();

  if (await page.evaluate(() => CSS.supports('animation-timeline: view()'))) {
    await expect.poll(() => photo.evaluate(element => getComputedStyle(element).getPropertyValue('animation-timeline'))).not.toBe('auto');
  }

  const firstArticle = page.getByRole('main').getByRole('article').first();
  const articleLink = firstArticle.getByRole('link').first();
  const href = await articleLink.getAttribute('href');
  if (!href) throw new Error('Expected a real article link.');
  await articleLink.click();
  await expect(page).toHaveURL(new URL(href, page.url()).href);
  const intro = page.locator('[data-cedar-route]').first();
  await expect(intro.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(intro).not.toHaveCSS('animation-name', 'none');
});

test('the chapter rail follows scrolling and links reach their scenes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#studio-operations');
  const rail = page.getByRole('navigation', { name: 'Solution chapters' });
  const active = rail.locator('[aria-current="location"]');
  await expect(active).toHaveText(/Business software/);
  const web = rail.getByRole('link', { name: 'Web experiences' });
  await web.click();
  await expect(page).toHaveURL(/#studio-web$/);
  await expect(active).toHaveText(/Web experiences/);
  const progress = () => rail.evaluate(element => Number(element.style.getPropertyValue('--cedar-chapter-progress')));
  const initial = await progress();
  await page.evaluate(() => window.scrollBy({ top: 155, behavior: 'instant' }));
  await expect.poll(progress).toBeGreaterThan(initial + .04);
  expect((await rail.boundingBox())?.y).toBeLessThan(82);
  await rail.getByRole('link', { name: 'Automation' }).click();
  await expect(page).toHaveURL(/#studio-workflows$/);
  await expect(active).toHaveText(/Automation/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('showcase lighting follows the pointer and respects reduced motion', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The spotlight uses a fine pointer.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#studio-web');
  const frame = page.locator('#studio-web [data-cedar-spotlight]');
  await expect.poll(async () => {
    await frame.hover({ position: { x: 45, y: 220 } });
    return frame.getAttribute('data-cedar-pointing');
  }).toBe('');
  const light = () => frame.evaluate(element => Number.parseFloat(element.style.getPropertyValue('--cedar-light-x')));
  const left = await light();
  await frame.hover({ position: { x: 190, y: 220 } });
  await expect.poll(light).toBeGreaterThan(left + 100);
  await page.mouse.move(5, 20);
  await expect(frame).not.toHaveAttribute('data-cedar-pointing', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frame.hover({ position: { x: 72, y: 220 } });
  await expect(frame).not.toHaveAttribute('data-cedar-pointing', '');
  const web = page.getByRole('link', { name: 'Web experiences', exact: true }).first();
  await web.click();
  await expect(page).toHaveURL(/#studio-web$/);
});

test('privacy and the missing-page screen share the public entry motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/privacy');
  await expect(page.locator('[data-cedar-route]').getByRole('heading', { name: 'Website privacy' })).toBeVisible();
  await expect(page.locator('[data-cedar-route]')).not.toHaveCSS('animation-name', 'none');

  const response = await page.goto('/cedar-public-motion-missing');
  expect(response?.status()).toBe(404);
  const missing = page.locator('[data-cedar-route]');
  await expect(missing.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(missing).not.toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(missing).toHaveCSS('animation-name', 'none');
  await missing.getByRole('link', { name: 'Browse insights' }).click();
  await expect(page).toHaveURL(/\/blog$/);
});

test('FAQ and the project steps keep keyboard controls after motion changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#faq');
  const disclosure = page.locator('#faq details').first();
  const summary = disclosure.locator('summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(disclosure).toHaveJSProperty('open', true);
  await expect(disclosure.locator('p')).toBeVisible();
  await summary.press('Enter');
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(disclosure.locator('p')).not.toBeVisible();

  const process = page.locator('#process');
  const build = process.getByRole('tab', { name: 'Build' });
  await build.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await build.click();
  await expect(build).toHaveAttribute('aria-selected', 'true');
  await build.press('ArrowLeft');
  await expect(build).toHaveAttribute('aria-selected', 'false');
  await expect(process.getByRole('tab', { selected: true })).toBeFocused();
});
