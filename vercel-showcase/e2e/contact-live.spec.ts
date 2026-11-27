import { expect, test } from '@playwright/test';

test('configured contact form preserves the message on failed delivery and retries once safely', async ({page})=>{
  test.skip(process.env.CEDAR_TEST_CONTACT_MODE !== 'enabled','Run against the dedicated contact-mode test build.');
  const ids: string[] = [];
  await page.route('**/api/inquiries', async route => {
    const data = route.request().postDataJSON();
    expect(data.email).toBe('test@example.com');
    expect(data.consent).toBe(true);
    expect(data.overview).toBe('A local browser-only test inquiry for the Cedar website.');
    ids.push(data.requestId);
    await route.fulfill(ids.length===1 ? {status:502,json:{error:'Delivery could not be confirmed. Please retry.'}} : {status:201,json:{reference:'CC-test-reference'}});
  });
  await page.goto('/#contact');
  const contact = page.locator('#contact');
  await contact.getByLabel('Project overview').fill('A local browser-only test inquiry for the Cedar website.');
  await contact.getByRole('button',{name:'Continue'}).click();
  await contact.getByLabel('Your name').fill('Browser test');
  await contact.getByLabel('Email').fill('test@example.com');
  await contact.getByRole('button',{name:'Continue'}).click();
  await contact.getByRole('checkbox').check();
  await contact.getByRole('button',{name:/Send inquiry/}).click();
  await expect(contact.getByRole('status')).toContainText('Delivery could not be confirmed');
  await expect(contact.getByText('A local browser-only test inquiry',{exact:false})).toBeVisible();
  await contact.getByRole('button',{name:/Send inquiry/}).click();
  await expect(contact.getByRole('status')).toContainText('CC-test-reference');
  await expect(contact.getByRole('button',{name:'Inquiry submitted'})).toBeDisabled();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
