import { test, expect, type Page } from '@playwright/test';

const reference = '12345678-1234-4123-8123-123456789abc';
const stages = ['new', 'qualified', 'proposal', 'won', 'lost'] as const;
type Stage = typeof stages[number];
const contact = (page: Page) => page.getByRole('button', { name: 'Example contact', exact: true });

async function setup(page: Page, conflict = false) {
  let row = { reference, name: 'Example contact', company: 'Example studio', email: 'example@example.com', stage: 'new' as Stage, version: 1, clientId: null, createdAt: '2026-11-24T00:00:00Z' };
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Match the URL path, independently of query ordering and optional trailing slash.
  // Block unexpected calls to avoid exercising live business data in mock tests.
  await page.route(url => url.pathname.startsWith('/api/v1/'), async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/\/$/, '');
    requests.push(`${req.method()} ${path}${url.search}`);
    if (req.method() === 'GET') {
      if (path === '/api/v1/auth/me') return route.fulfill({ json: { username: 'owner', role: 'owner' } });
      if (path === '/api/v1/auth/csrf') return route.fulfill({ json: { csrfToken: 'mock-token' } });
      if (path === '/api/v1/staff/crm/overview') return route.fulfill({ json: { total: 1, clients: 0, stages: Object.fromEntries(stages.map(s => [s, Number(s === row.stage)])) } });
      if (path === '/api/v1/staff/crm/leads') {
        const stage = url.searchParams.get('stage');
        return route.fulfill({ json: { page: 1, hasMore: false, results: !stage || stage === row.stage ? [row] : [] } });
      }
      if (path === `/api/v1/staff/crm/leads/${reference}`) return route.fulfill({ json: { ...row, overview: 'A website project.', allowedStages: row.stage === 'new' ? ['qualified', 'lost'] : ['new', 'proposal', 'lost'], activity: [] } });
    }
    if (req.method() === 'POST' && path === '/api/v1/staff/crm/stage') {
      const body = req.postDataJSON();
      expect(body.reference).toBe(reference);
      expect(body.version).toBe(row.version);
      expect(body.stage).toBe('qualified');
      expect(req.headers()['x-csrftoken']).toBe('mock-token');
      if (conflict) return route.fulfill({ status: 409, json: { error: 'Conflict' } });
      row = { ...row, stage: body.stage, version: row.version + 1 };
      return route.fulfill({ json: row });
    }
    return route.fulfill({ status: 501, json: { error: `Unexpected mock request: ${req.method()} ${path}` } });
  });
  try {
    const response = await page.goto('/workspace/leads');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/workspace\/leads$/);
    await expect(page.getByRole('region', { name: 'Sales pipeline', exact: true })).toBeVisible();
    await expect(contact(page)).toBeVisible({ timeout: 15000 });
    expect(requests.some(r => r.startsWith('GET /api/v1/staff/crm/leads?'))).toBe(true);
  } catch (error) {
    await test.info().attach('pipeline-initialization', { contentType: 'application/json', body: JSON.stringify({ url: page.url(), requests, errors, body: await page.locator('body').innerText().catch(() => '(unavailable)') }, null, 2) });
    throw error;
  }
}

function stageResponse(page: Page, status: number) {
  return page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '') === '/api/v1/staff/crm/stage' && response.request().method() === 'POST' && response.status() === status);
}

test('table and board share lead details and accessible stage controls', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await contact(page).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await Promise.all([stageResponse(page, 200), drawer.getByRole('button', { name: 'Move to Qualified' }).click()]);
  await expect(drawer.getByText('Moved to Qualified.')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Move to Proposal' })).toBeEnabled();
  await drawer.getByRole('button', { name: 'Close lead details' }).click();
  await expect(page.getByRole('table').getByText('Qualified', { exact: true })).toBeVisible();
});

test('conflict restores server state and asks user to review', async ({ page }) => {
  await setup(page, true);
  await contact(page).click();
  const drawer = page.getByRole('dialog');
  await Promise.all([stageResponse(page, 409), drawer.getByRole('button', { name: 'Move to Qualified' }).click()]);
  await expect(drawer.getByText(/This lead changed on the server/)).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Move to Qualified' })).toBeEnabled();
  await drawer.getByRole('button', { name: 'Close lead details' }).click();
  await expect(page.getByRole('region', { name: 'New column' }).getByRole('button', { name: 'Example contact', exact: true })).toBeVisible();
});

test('desktop drag moves a lead with same protected endpoint', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch users use stage buttons');
  await setup(page);
  const source = page.getByRole('region', { name: 'New column' }).locator('article');
  const target = page.getByRole('region', { name: 'Qualified column' });
  await Promise.all([stageResponse(page, 200), source.dragTo(target)]);
  await expect(target.getByRole('button', { name: 'Example contact', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Moved to Qualified.' })).toBeVisible();
});
