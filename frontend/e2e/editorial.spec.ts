import {test,expect} from '@playwright/test';
test('owner manages public author directory with protected write',async({page})=>{
  let created=false;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async r=>{
    const url=new URL(r.request().url()),path=url.pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return r.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/auth/csrf')return r.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/terms/list')return r.fulfill({json:{results:created&&url.searchParams.get('kind')==='author'?[{id:'2',kind:'author',name:'Example Writer',active:true,version:1}]:[],page:1,hasMore:false}});
    if(path==='/api/v1/staff/blog/terms/change'){expect(r.request().headers()['x-csrftoken']).toBe('mock-token');expect(r.request().postDataJSON()).toEqual({action:'create',kind:'author',name:'Example Writer'});created=true;return r.fulfill({status:201,json:{id:'2',kind:'author',name:'Example Writer',active:true,version:1}});}
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/editorial');await page.getByRole('button',{name:'Authors',exact:true}).click();await page.getByLabel('New author').fill('Example Writer');await page.getByRole('button',{name:'Add author',exact:true}).click();await expect(page.getByRole('cell',{name:'Example Writer'})).toBeVisible();expect(created).toBe(true);
});
test('separate SEO AEO GEO editors save the same versioned draft',async({page})=>{
  let saves=0;
  const draft={title:'Example article',summary:'Short',category:'AI',tags:[],seoTitle:'',seoDescription:'',cover:'web',coverAlt:'',focusKeyword:'example',noindex:true,sections:[{heading:'Original section',body:'Original body text.'}]};
  let detail={slug:'example-article',title:draft.title,category:draft.category,status:'published',version:2,updatedAt:'2026-11-25T00:00:00Z',hasUnpublishedChanges:true,draft,history:[]};
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{
    const path=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return r.fulfill({json:{username:'staff',role:'staff'}});
    if(path==='/api/v1/auth/csrf')return r.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/seo/list')return r.fulfill({json:{results:[{...detail.draft,slug:detail.slug,status:detail.status,hasUnpublishedChanges:true}],page:1,hasMore:false}});
    if(path==='/api/v1/staff/blog/discovery/list')return r.fulfill({json:{results:[],page:1,hasMore:false,counts:{present:0,absent:0,inconclusive:0}}});
    if(path==='/api/v1/staff/blog/detail/example-article')return r.fulfill({json:detail});
    if(path==='/api/v1/staff/blog/change'){
      const body=r.request().postDataJSON();expect(body.action).toBe('save');expect(body.version).toBe(detail.version);expect(r.request().headers()['x-csrftoken']).toBe('mock-token');expect(body.fields.seoTitle).toBe('Example SEO title');expect(JSON.stringify(body.fields)).toContain('Original body text.');if(saves>=1){expect(body.fields.sections).toEqual([]);expect(JSON.stringify(body.fields.document)).toContain('What is automation?');}if(saves===2)expect(JSON.stringify(body.fields.document)).toContain('Evidence and context');saves++;
      detail={...detail,version:detail.version+1,draft:body.fields};return r.fulfill({json:detail});
    }
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  for(const mode of ['seo','aeo','geo']){
    await page.goto('/workspace/'+mode);await expect(page.getByRole('heading',{name:mode.toUpperCase()+' center',exact:true})).toBeVisible();await page.getByRole('button',{name:mode.toUpperCase()+' editor',exact:true}).click();await page.getByRole('button',{name:'Optimize Example article'}).click();await expect(page).toHaveURL(new RegExp('/workspace/'+mode+'$'));
    if(mode==='seo'){await page.getByLabel('SEO title',{exact:false}).fill('Example SEO title');await expect(page.getByLabel('Question',{exact:true})).toHaveCount(0);}
    if(mode==='aeo'){await page.getByLabel('Question',{exact:true}).fill('What is automation?');await page.getByLabel('Answer',{exact:true}).fill('Automation performs repeated tasks using defined rules.');await page.getByRole('button',{name:'Append question & answer'}).click();}
    if(mode==='geo'){await page.getByLabel('Factual statement').fill('A documented observation.');await page.getByLabel('Context, method and limitations').fill('A limited example with a reference.');await page.getByLabel('Source name').fill('Example');await page.getByLabel('Source HTTPS URL').fill('https://example.com/evidence');await page.getByRole('button',{name:'Append evidence section'}).click();}
    await page.getByRole('button',{name:'Body preview'}).click();await expect(page.getByText('Original body text.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Save optimization draft'}).click();await expect(page.getByText('Optimization draft saved. Public content is unchanged until Owner publishes.')).toBeVisible();
  }
  expect(saves).toBe(3);
});
test('AEO dashboard records an observation without invented analytics',async({page})=>{
  let saved=false;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{
    const path=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return r.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/auth/csrf')return r.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/seo/list')return r.fulfill({json:{results:[],page:1,hasMore:false}});
    if(path==='/api/v1/staff/blog/discovery/list')return r.fulfill({json:{results:saved?[{id:'1',engine:'ChatGPT Search',prompt:'Example question?',target:'/',outcome:'absent',evidence:'Observed no answer in this sample.',recordedAt:'2026-11-25T00:00:00Z'}]:[],counts:{present:0,absent:saved?1:0,inconclusive:0},hasMore:false}});
    if(path==='/api/v1/staff/blog/discovery/create'){expect(r.request().headers()['x-csrftoken']).toBe('mock-token');expect(r.request().postDataJSON()).toMatchObject({mode:'aeo',target:'/',outcome:'absent'});saved=true;return r.fulfill({status:201,json:{id:'1'}});}
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/aeo');await expect(page.getByText('No observations recorded yet. No visibility conclusion can be drawn.')).toBeVisible();await page.getByRole('button',{name:'Record observation'}).click();await page.getByLabel('Search question or prompt').fill('Example question?');await page.getByLabel('Observed outcome').selectOption('absent');await page.getByLabel('Evidence and context').fill('Observed no answer in this sample.');await page.getByRole('button',{name:'Save observation'}).click();await expect(page.getByRole('cell',{name:'Observed no answer in this sample.'})).toBeVisible();expect(saved).toBe(true);
});
test('client cannot request editorial or SEO data',async({page})=>{let calls=0;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'')==='/api/v1/auth/me')return r.fulfill({json:{username:'client',role:'client'}});calls++;return r.fulfill({status:403,json:{error:'Denied'}});});for(const section of ['editorial','seo','aeo','geo']){await page.goto('/workspace/'+section);await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();}expect(calls).toBe(0);});
