import {test,expect} from '@playwright/test';
test('content planning creates a private writing task',async({page})=>{
  let tasks:Record<string,unknown>[]=[];
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{const p=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(p.endsWith('/auth/me'))return r.fulfill({json:{username:'owner',role:'owner'}});
    if(p.endsWith('/auth/csrf'))return r.fulfill({json:{csrfToken:'mock'}});
    if(p.endsWith('/operations/list'))return r.fulfill({json:{tasks,hasMore:false,clusters:[],members:[],clustersTruncated:false,membersTruncated:false}});
    if(p.endsWith('/operations/task')){const b=r.request().postDataJSON();expect(r.request().headers()['x-csrftoken']).toBe('mock');const t={...b.fields,id:1,version:1,opportunityId:null,sourceTitle:'',postSlug:'',release:'unlinked',planId:null,scheduledAt:null};tasks=[t];return r.fulfill({json:t});}
    return r.fulfill({status:501,json:{error:'Unexpected endpoint'}});
  });
  await page.goto('/workspace/content');await page.getByRole('button',{name:'+ New content task'}).click();await page.getByLabel('Task title').fill('AI for small teams');await page.getByLabel('Stage',{exact:true}).selectOption('writing');await page.getByRole('button',{name:'Save task'}).click();await expect(page.getByText('Content task saved.')).toBeVisible();await page.getByRole('button',{name:'List',exact:true}).click();await expect(page.getByRole('button',{name:'AI for small teams',exact:true})).toBeVisible();
});
test('client cannot query content operations',async({page})=>{let read=false;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'').endsWith('/auth/me'))return r.fulfill({json:{username:'client',role:'client'}});if(r.request().url().includes('/operations/'))read=true;return r.fulfill({status:403,json:{error:'Denied'}});});await page.goto('/workspace/content');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(read).toBe(false);});
