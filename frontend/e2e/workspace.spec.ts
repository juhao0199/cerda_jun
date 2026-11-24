import { test, expect, type Page } from '@playwright/test';

type Role = 'owner' | 'staff' | 'client';
async function mockWorkspace(page: Page, role: Role) {
  await page.route('**/api/v1/auth/me', route => route.fulfill({json:{username:'test-account',role}}));
  await page.route('**/api/v1/staff/crm/overview', route => route.fulfill({json:{stages:{new:0,qualified:0,proposal:0,won:0,lost:0},total:0,clients:0}}));
  await page.route(/\/api\/v1\/staff\/crm\/(leads|clients)\?/, route => route.fulfill({json:{results:[],page:1,hasMore:false}}));
  await page.route(url => url.pathname.replace(/\/$/, '') === '/api/v1/staff/security-center', route => route.fulfill({json:{results:[],page:1,hasMore:false}}));
  await page.route('**/api/v1/staff/security-events', route => route.fulfill({json:{results:[{action:'login.success',actorId:1,createdAt:'2026-11-24T16:47:35.738428+00:00'}]}}));
}
async function openNavigation(page: Page) {
  const toggle=page.getByRole('button',{name:'Toggle workspace navigation'});
  if(await toggle.isVisible() && await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
}
test('workspace has independent navigation and separate account settings',async({page})=>{
  await mockWorkspace(page,'owner');
  await page.goto('/workspace');
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.getByLabel('Current password')).toHaveCount(0);
  await openNavigation(page);
  await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Leads',exact:true}).click();
  await expect(page).toHaveURL(/\/workspace\/leads$/);
  await expect(page.getByRole('heading',{name:'Leads',exact:true})).toBeVisible();
  await openNavigation(page);
  await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Account settings',exact:true}).click();
  await expect(page.getByLabel('Current password')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Recent inquiries'})).toHaveCount(0);
});
test('staff direct security route is denied without querying audit endpoint',async({page})=>{
  await mockWorkspace(page,'staff');
  let requested=false;
  page.on('request',request=>{if(/\/staff\/(security-events|security-center)/.test(request.url()))requested=true;});
  await page.goto('/workspace/security');
  await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();
  expect(requested).toBe(false);
});
test('client direct CRM route is denied without fetching CRM',async({page})=>{
  await mockWorkspace(page,'client');
  let requested=false;
  page.on('request',request=>{if(request.url().includes('/staff/crm/'))requested=true;});
  await page.goto('/workspace/leads');
  await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();
  expect(requested).toBe(false);
});
test('public website keeps marketing navigation and footer',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});
