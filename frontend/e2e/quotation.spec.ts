import {test,expect} from '@playwright/test';
const lead='12345678-1234-4123-8123-123456789abc';
test('owner creates draft, previews totals and issues a locked quotation',async({page})=>{
  let quote:Record<string,unknown>|null=null;let writes=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async r=>{
    const req=r.request(),path=new URL(req.url()).pathname.replace(/\/$/,'');const root='/api/v1/staff/quotations/';
    if(path==='/api/v1/auth/me')return r.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/auth/csrf')return r.fulfill({json:{csrfToken:'mock-token'}});
    if(path===root+'catalog')return r.fulfill({json:{currencies:['USD','THB'],services:[{code:'web',name:'Website development'}]}});
    if(path==='/api/v1/staff/crm/leads')return r.fulfill({json:{results:[{reference:lead,name:'Example client',email:'example@example.com',company:'Example'}],page:1,hasMore:false}});
    if(path===root+'list')return r.fulfill({json:{results:quote?[{...quote,title:'Project quotation',recipient:'Example client',currency:'USD',total:'96.30'}]:[],page:1,hasMore:false,counts:{draft:quote?.status==='draft'?1:0,issued:quote?.status==='issued'?1:0,void:0}}});
    if(path===root+'create'){
      expect(req.headers()['x-csrftoken']).toBe('mock-token');const b=req.postDataJSON();expect(b.lead).toBe(lead);expect(b.fields.items[0].unitPrice).toBe('100');expect(b.fields).not.toHaveProperty('total');writes++;
      quote={id:b.id,number:'CC-EXAMPLE',lead,version:1,status:'draft',updatedAt:'2026-11-25T00:00:00Z',readOnly:false,history:[{version:1,status:'draft',createdAt:'2026-11-25T00:00:00Z'}],snapshot:{...b.fields,items:[{...b.fields.items[0],total:'100.00'}],subtotal:'100.00',discountAmount:'10.00',taxAmount:'6.30',total:'96.30',recipient:{name:'Example client',company:'Example',email:'example@example.com'}}};return r.fulfill({status:201,json:quote});
    }
    if(path===root+'change'&&quote){const b=req.postDataJSON();expect(b.version).toBe(1);expect(b.action).toBe('issue');writes++;quote={...quote,version:2,status:'issued',history:[{version:2,status:'issued',createdAt:'2026-11-25T00:00:00Z'},{version:1,status:'draft',createdAt:'2026-11-25T00:00:00Z'}]};return r.fulfill({json:quote});}
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/quotations');await page.getByRole('button',{name:'+ New quotation',exact:true}).click();await page.getByLabel('Select lead',{exact:true}).selectOption(lead);await page.getByLabel('Item 1 description',{exact:true}).fill('Website');await page.getByLabel('Unit price 1',{exact:true}).fill('100');await page.getByLabel('Discount (%)',{exact:true}).fill('10');await page.getByLabel('Tax (%)',{exact:true}).fill('7');await page.getByLabel('Payment terms',{exact:true}).fill('50% deposit');await expect(page.getByText('USD 96.30',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Create draft',exact:true}).click();await expect(page.getByRole('button',{name:'Issue quotation',exact:true})).toBeEnabled();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Issue quotation',exact:true}).click();await expect(page.getByRole('button',{name:'Create revision',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toHaveCount(0);expect(writes).toBe(2);
});
test('client cannot open quotation workspace or request quote data',async({page})=>{
  let calls=0;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'')==='/api/v1/auth/me')return r.fulfill({json:{username:'client',role:'client'}});calls++;return r.fulfill({status:403,json:{error:'Access denied'}});});await page.goto('/workspace/quotations');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(calls).toBe(0);
});
