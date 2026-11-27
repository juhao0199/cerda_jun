import {test,expect} from '@playwright/test';
test('owner submits a saved draft and schedules its reviewed version',async({page})=>{
  let plan={id:1,kind:'article',slug:'test-article',title:'Editorial article',version:1,targetVersion:3,currentVersion:3,status:'review',stale:false,scheduledAt:null as string|null,publishedAt:null as string|null,updatedAt:'2026-11-25T12:00:00Z',events:[] as {action:string;note:string;actorId:number;createdAt:string}[]};let exists=false;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{const p=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(p.endsWith('/auth/me'))return r.fulfill({json:{username:'owner',role:'owner'}});
    if(p.endsWith('/auth/csrf'))return r.fulfill({json:{csrfToken:'mock'}});
    if(p.endsWith('/publishing/list'))return r.fulfill({json:{results:exists?[plan]:[],hasMore:false,calendar:plan.scheduledAt?[plan]:[],calendarTruncated:false}});
    if(p.endsWith('/publishing/detail/1'))return r.fulfill({json:plan});
    if(p.endsWith('/blog/list'))return r.fulfill({json:{results:[{slug:plan.slug,title:plan.title,version:3,status:'draft',hasUnpublishedChanges:true}],hasMore:false}});
    if(p.endsWith('/publishing/submit')){expect(r.request().postDataJSON().targetVersion).toBe(3);exists=true;return r.fulfill({json:plan});}
    if(p.endsWith('/publishing/change')){const body=r.request().postDataJSON();expect(body.version).toBe(plan.version);expect(r.request().headers()['x-csrftoken']).toBe('mock');expect(body.targetVersion).toBe(3);plan={...plan,status:body.action==='approve'?'approved':'scheduled',version:plan.version+1,scheduledAt:body.scheduledAt};return r.fulfill({json:plan});}
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/calendar');await page.getByLabel('Saved draft').selectOption('test-article');await page.getByRole('button',{name:'Submit for review'}).click();await expect(page.getByText('Draft submitted for review. Public content is unchanged.')).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Approve draft'}).click();await expect(page.getByLabel('Release time (UTC)')).toBeVisible();await page.getByLabel('Release time (UTC)').fill('2027-01-15T12:00');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Schedule release'}).click();await expect(page.getByText('Release scheduled. The publishing runner must be active.')).toBeVisible();expect(plan.scheduledAt).toBe('2027-01-15T12:00:00.000Z');
});
test('client cannot fetch publishing plans',async({page})=>{let read=false;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'').endsWith('/auth/me'))return r.fulfill({json:{username:'client',role:'client'}});if(r.request().url().includes('/publishing/'))read=true;return r.fulfill({status:403,json:{error:'Denied'}});});await page.goto('/workspace/calendar');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(read).toBe(false);});
