import {test,expect} from '@playwright/test';

test('marketing navigation opens solutions and reaches the new chapters',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  const menu=nav.getByRole('button',{name:'Open menu'});
  const mobile=await menu.isVisible();
  const trigger=mobile?menu:nav.getByRole('button',{name:'Solutions',exact:true});
  await trigger.click();
  const web=nav.getByRole('link',{name:/Web experiences/});
  await expect(web).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(web).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await web.click();
  await expect(page).toHaveURL(/#studio-web$/);
  await expect(web).toBeHidden();
  await expect(page.locator('header[data-tone]')).toHaveAttribute('data-tone','light');
  await expect(nav).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

test('blog uses light navigation and project actions remain available',async({page})=>{
  await page.goto('/blog');
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(page.locator('header[data-tone]')).toHaveAttribute('data-tone','light');
  const menu=nav.getByRole('button',{name:'Open menu'});
  if(await menu.isVisible())await menu.click();
  await expect(nav.getByRole('link',{name:'Blog',exact:true})).toHaveAttribute('aria-current','page');
  await expect(nav.getByRole('link',{name:'Start a project',exact:true})).toBeVisible();
});
