import {test,expect,type Page} from '@playwright/test';
const reference='12345678-1234-4123-8123-123456789abc';
async function mock(page:Page,role:'owner'|'staff'){
  let row={reference,name:'Assignment example',company:'Example',email:'example@example.com',stage:'new',version:1,clientId:null,createdAt:'2026-11-24T00:00:00Z',assignedTo:null as {id:string;username:string}|null};
  let directoryReads=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/\/$/,'');
    if(req.method()==='GET'){
      if(path==='/api/v1/auth/me')return route.fulfill({json:{username:role,role}});
      if(path==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'mock-token'}});
      if(path==='/api/v1/staff/crm/overview')return route.fulfill({json:{total:1,clients:0,stages:{new:1,qualified:0,proposal:0,won:0,lost:0}}});
      if(path==='/api/v1/staff/crm/leads')return route.fulfill({json:{page:1,hasMore:false,results:!url.searchParams.get('stage')||url.searchParams.get('stage')==='new'?[row]:[]}});
      if(path===`/api/v1/staff/crm/leads/${reference}`)return route.fulfill({json:{...row,canAssign:role==='owner',overview:'Example project',allowedStages:['qualified','lost'],activity:[]}});
      if(path==='/api/v1/staff/team'){directoryReads++;expect(role).toBe('owner');expect(url.searchParams.get('role')).toBe('staff');expect(url.searchParams.get('status')).toBe('active');return route.fulfill({json:{page:1,hasMore:false,results:[{id:'2',username:'developer01'}]}});}
    }
    if(req.method()==='POST'&&path==='/api/v1/staff/crm/assign'){
      expect(role).toBe('owner');expect(req.headers()['x-csrftoken']).toBe('mock-token');expect(req.postDataJSON()).toEqual({reference,version:1,assigneeId:'2'});
      row={...row,version:2,assignedTo:{id:'2',username:'developer01'}};return route.fulfill({json:row});
    }
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/leads');
  await page.getByRole('button',{name:'Assignment example',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Assignment example'})).toBeVisible();
  return ()=>directoryReads;
}
test('owner assigns an active staff member',async({page})=>{
  await mock(page,'owner');const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Change assignment'}).click();
  await dialog.getByRole('button',{name:'developer01',exact:true}).click();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'')==='/api/v1/staff/crm/assign'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Confirm assignment'}).click();expect((await response).status()).toBe(200);
  await expect(dialog.getByText('Assignment updated.',{exact:true})).toBeVisible();
  await expect(dialog.getByText('developer01',{exact:true})).toBeVisible();
});
test('staff cannot access assignment controls or directory',async({page})=>{
  const reads=await mock(page,'staff');await expect(page.getByRole('dialog').getByRole('button',{name:'Change assignment'})).toHaveCount(0);expect(reads()).toBe(0);
});
