import {test,expect,type Page} from '@playwright/test';
const reference='12345678-1234-4123-8123-123456789abc';
async function mock(page:Page,role:'owner'|'staff'){
  let row:Record<string,unknown>|null=null;let writes=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/\/$/,'');
    if(req.method()==='GET'){
      if(path==='/api/v1/auth/me')return route.fulfill({json:{username:role,role}});
      if(path==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'mock-token'}});
      const matches=row&&Boolean(row.archived)===(url.searchParams.get('archived')==='1');
      if(path==='/api/v1/staff/crm/overview')return route.fulfill({json:{total:matches?1:0,clients:0,stages:{new:matches?1:0,qualified:0,proposal:0,won:0,lost:0}}});
      if(path==='/api/v1/staff/crm/leads')return route.fulfill({json:{page:1,hasMore:false,results:matches&&(!url.searchParams.get('stage')||url.searchParams.get('stage')==='new')?[row]:[]}});
      if(path===`/api/v1/staff/crm/leads/${reference}`&&row)return route.fulfill({json:{...row,canEdit:!row.archived,canArchive:role==='owner',canEditEmail:role==='owner',canAssign:false,allowedStages:row.archived?[]:['qualified','lost'],activity:[]}});
    }
    if(req.method()==='POST'){
      expect(req.headers()['x-csrftoken']).toBe('mock-token');const data=req.postDataJSON();writes++;
      if(path==='/api/v1/staff/crm/create'){
        expect(role).toBe('owner');expect(data.name).toBe('Manual example');expect(data.source).toBe('linkedin');expect(data.expectedValue).toBe('1250.50');expect(data.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(data.allowDuplicate).toBe(false);
        row={...data,reference,version:1,stage:'new',clientId:null,assignedTo:null,createdAt:'2026-11-24T00:00:00Z',archived:false};return route.fulfill({status:201,json:row});
      }
      if(path==='/api/v1/staff/crm/edit'&&row){expect(data.version).toBe(1);expect(data.priority).toBe('urgent');row={...row,...data,version:2};return route.fulfill({json:row});}
      if(path==='/api/v1/staff/crm/archive'&&row){expect(data.version).toBe(row.version);row={...row,archived:data.archived,version:Number(row.version)+1};return route.fulfill({json:row});}
    }
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/leads');await expect(page.getByRole('button',{name:'Board',exact:true})).toBeEnabled();return ()=>writes;
}
test('owner creates, edits, archives and restores a manual lead',async({page})=>{
  const writes=await mock(page,'owner');await page.getByRole('button',{name:'+ New lead',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'New lead',exact:true});await editor.getByLabel('Name',{exact:true}).fill('Manual example');await editor.getByLabel('Email',{exact:true}).fill('example@example.com');await editor.getByLabel('Source',{exact:true}).selectOption('linkedin');await editor.getByLabel('Expected value',{exact:true}).fill('1250.50');await editor.getByRole('button',{name:'Create lead',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Manual example',exact:true});await expect(drawer).toBeVisible();await expect(drawer.getByText('USD 1250.50',{exact:true})).toBeVisible();await drawer.getByRole('button',{name:'Edit lead',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit lead',exact:true});await edit.getByLabel('Priority',{exact:true}).selectOption('urgent');await edit.getByRole('button',{name:'Save changes',exact:true}).click();await expect(drawer.getByText('urgent',{exact:true})).toBeVisible();
  page.once('dialog',d=>d.accept());await drawer.getByRole('button',{name:'Archive lead',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(page.getByRole('region',{name:'New column'}).getByRole('button',{name:'Manual example',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Archived leads',exact:true}).click();await page.getByRole('button',{name:'Manual example',exact:true}).click();await expect(drawer.getByText('Archived · read only',{exact:true})).toBeVisible();await expect(drawer.getByRole('button',{name:'Edit lead',exact:true})).toHaveCount(0);
  page.once('dialog',d=>d.accept());await drawer.getByRole('button',{name:'Restore lead',exact:true}).click();await expect(drawer).toHaveCount(0);await page.getByRole('button',{name:'Active leads',exact:true}).click();await expect(page.getByRole('button',{name:'Manual example',exact:true})).toBeVisible();expect(writes()).toBe(4);
});
test('staff cannot create or browse archived leads',async({page})=>{
  const writes=await mock(page,'staff');await expect(page.getByRole('button',{name:'+ New lead',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Archived leads',exact:true})).toHaveCount(0);expect(writes()).toBe(0);
});
