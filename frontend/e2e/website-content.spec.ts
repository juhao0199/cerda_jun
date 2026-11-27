import {test,expect} from '@playwright/test';
import defaults from '../lib/website-defaults.json';

test('website editor saves draft, publishes explicitly, and restores revisions',async({page})=>{
  let data={version:1,draft:structuredClone(defaults),published:structuredClone(defaults),publishedAt:null as string|null,history:[] as {version:number;action:string;createdAt:string}[]};
  const original=defaults.homeTitle;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async r=>{
    const path=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(path.endsWith('/auth/me'))return r.fulfill({json:{username:'owner',role:'owner'}});
    if(path.endsWith('/auth/csrf'))return r.fulfill({json:{csrfToken:'mock'}});
    if(path.endsWith('/website/detail'))return r.fulfill({json:data});
    if(path.endsWith('/website/change')){
      const body=r.request().postDataJSON();expect(body.version).toBe(data.version);expect(r.request().headers()['x-csrftoken']).toBe('mock');
      if(body.action==='save')data={...data,draft:body.fields,version:data.version+1};
      else if(body.action==='publish')data={...data,published:structuredClone(data.draft),publishedAt:new Date().toISOString(),version:data.version+1};
      else if(body.action==='restore')data={...data,draft:structuredClone(defaults),version:data.version+1};
      else throw new Error('Unexpected action');
      data.history.unshift({version:data.version,action:body.action,createdAt:new Date().toISOString()});return r.fulfill({json:data});
    }
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/website');
  const heading=page.locator('header').filter({has:page.getByRole('heading',{name:'Website optimization',exact:true})});
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(heading).toHaveCSS('position','static');
  await expect(heading.getByRole('heading',{name:'Website optimization',exact:true})).toHaveCSS('color','rgb(36, 39, 43)');
  await page.getByLabel('Page title',{exact:false}).fill('Website test title');
  await expect(page.getByRole('button',{name:'Publish website'})).toBeDisabled();
  await page.getByRole('button',{name:'AEO / FAQs'}).click();
  await page.getByLabel('faq question 1',{exact:true}).fill('What is our delivery process?');
  await page.getByRole('button',{name:'GEO / Schema'}).click();
  await page.getByLabel('Include FAQPage from the visible FAQs and guidance').check();
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.getByText('Draft saved. Public website is unchanged.')).toBeVisible();
  expect(data.published.homeTitle).toBe(original);expect(data.draft.faq[0].question).toBe('What is our delivery process?');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish website'}).click();
  await expect(page.getByText('Website published. Public HTML uses the new snapshot.')).toBeVisible();
  expect(data.published.homeTitle).toBe('Website test title');expect(data.published.faqSchema).toBe(true);
  await page.getByRole('button',{name:'History',exact:true}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore to draft'}).first().click();
  await expect(page.getByText('Revision restored to draft. Review and publish separately.')).toBeVisible();
  expect(data.published.homeTitle).toBe('Website test title');
});

test('client cannot open website optimization or request draft',async({page})=>{
  let read=false;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{
    if(new URL(r.request().url()).pathname.replace(/\/$/,'').endsWith('/auth/me'))return r.fulfill({json:{username:'client',role:'client'}});
    if(r.request().url().includes('/website/'))read=true;
    return r.fulfill({status:403,json:{error:'Denied'}});
  });
  await page.goto('/workspace/website');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(read).toBe(false);
});
