import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, role = 'owner') {
  let active = true, version = '1';
  const member = () => ({ id: '2', username: 'studio-staff', role: 'staff', active, version, lastLogin: null, protected: false });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/v1/auth/me') return route.fulfill({json:{username:'studio-owner',role}});
    if (path === '/api/v1/auth/csrf') return route.fulfill({json:{csrfToken:'test-only-token'}});
    if (path === '/api/v1/staff/team') return route.fulfill({json:{results:[member()],page:1,hasMore:false}});
    if (path === '/api/v1/staff/team/action') {
      const payload = route.request().postDataJSON();
      expect(payload).toEqual({id:'2',version:'1',action:'disable',password:'test-only-passphrase',code:'123456'});
      expect(route.request().headers()['x-csrftoken']).toBe('test-only-token');
      active=false; version='2'; return route.fulfill({json:member()});
    }
    return route.fulfill({status:404,json:{error:'Unexpected test API'}});
  });
}
test('owner can disable staff after explicit step-up confirmation', async ({ page }) => {
  await setup(page);
  await page.goto('/workspace/team');
  await expect(page.getByRole('heading',{name:'Team & access'})).toBeVisible();
  await page.getByRole('button',{name:'Manage studio-staff'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const action = dialog.getByLabel('Action', { exact: true });
  await expect(action).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue('revoke');
  await action.selectOption('role');
  const newRole = dialog.getByLabel('New role', { exact: true });
  await expect(newRole).toBeVisible();
  await expect(newRole).toHaveValue('client');
  await action.selectOption('disable');
  await expect(action).toHaveValue('disable');
  await expect(newRole).toHaveCount(0);
  await dialog.getByLabel('Your password').fill('test-only-passphrase');
  await dialog.getByLabel('Authenticator code').fill('123456');
  await dialog.getByRole('button',{name:'Disable account'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({hasText:'studio-staff'})).toContainText('Disabled');
});
test('staff cannot open team or query the directory', async ({page}) => {
  await setup(page,'staff');
  let requested=false;
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/v1/staff/team'))requested=true;});
  await page.goto('/workspace/team');
  await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();
  expect(requested).toBe(false);
});
