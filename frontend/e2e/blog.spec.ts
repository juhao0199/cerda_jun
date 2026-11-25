import {test,expect} from '@playwright/test';
import type {BlogDetail} from '../lib/blog-content';

test('owner creates and publishes a saved article',async({page})=>{
  let post:BlogDetail|null=null,writes=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/list')return route.fulfill({json:{results:post?[post]:[],page:1,hasMore:false,counts:{draft:post?.status==='draft'?1:0,published:post?.status==='published'?1:0,archived:0}}});
    if(path==='/api/v1/staff/blog/create'){
      const b=req.postDataJSON();expect(req.headers()['x-csrftoken']).toBe('mock-token');expect(b.slug).toBe('example-article');expect(b.fields.title).toBe('Example article');expect(b.fields.document.type).toBe('doc');expect(b.fields.document.content[0].type).toBe('heading');expect(b.fields.sections).toEqual([]);expect(b).not.toHaveProperty('status');writes++;
      post={slug:b.slug,title:b.fields.title,category:b.fields.category,status:'draft',version:1,updatedAt:'2026-11-25T00:00:00Z',hasUnpublishedChanges:true,draft:b.fields,history:[{version:1,status:'draft',action:'create',createdAt:'2026-11-25T00:00:00Z'}]};return route.fulfill({status:201,json:post});
    }
    if(path==='/api/v1/staff/blog/change'&&post){const b=req.postDataJSON();expect(req.headers()['x-csrftoken']).toBe('mock-token');expect(b).toEqual({slug:'example-article',version:1,action:'publish'});writes++;post={...post,status:'published',version:2,hasUnpublishedChanges:false,history:[{version:2,status:'published',action:'publish',createdAt:'2026-11-25T00:00:00Z'},...post.history]};return route.fulfill({json:post});}
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');await page.getByRole('button',{name:'+ New article',exact:true}).click();await page.getByLabel('Article title',{exact:true}).fill('Example article');await page.getByLabel('URL slug',{exact:false}).fill('example-article');await page.getByLabel('Summary',{exact:true}).fill('A practical summary');await page.getByLabel('Category',{exact:true}).fill('Web');await page.getByRole('textbox',{name:'Article body',exact:true}).fill('A useful paragraph.');await page.getByRole('combobox',{name:'Text style',exact:true}).selectOption('2');await page.getByLabel('Cover image',{exact:true}).selectOption('web');await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect(page.getByRole('dialog',{name:'Full screen article editor'})).toBeVisible();await expect(page.getByRole('button',{name:'Create draft',exact:true})).toBeVisible();await page.getByRole('button',{name:'Hide article settings',exact:true}).click();await expect(page.getByRole('complementary',{name:'Article settings',exact:true})).toBeHidden();await page.getByRole('button',{name:'Show article settings',exact:true}).click();await page.getByRole('button',{name:'Preview draft',exact:true}).click();await expect(page.getByRole('article').getByRole('heading',{name:'Example article',exact:true})).toBeVisible();await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByRole('button',{name:'Create draft',exact:true}).click();await expect(page.getByText('Draft saved.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Publish article',exact:true})).toBeEnabled();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish article',exact:true}).click();await expect(page.getByText('Article published.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Exit full screen',exact:true}).click();await expect(page.getByRole('dialog',{name:'Full screen article editor'})).toHaveCount(0);await expect(page.getByRole('link',{name:'View published article ↗'})).toBeVisible();expect(writes).toBe(2);
});

test('client cannot open blog CMS or request private data',async({page})=>{
  let calls=0;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'')==='/api/v1/auth/me')return r.fulfill({json:{username:'client',role:'client'}});calls++;return r.fulfill({status:403,json:{error:'Access denied'}});});await page.goto('/workspace/blog');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(calls).toBe(0);
});

test('owner uploads a private cover and can remove it before saving',async({page})=>{
  const id='12345678-1234-1234-1234-123456789abc';let uploads=0;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ9sAAAAASUVORK5CYII=','base64');
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/list')return route.fulfill({json:{results:[],page:1,hasMore:false,counts:{draft:0,published:0,archived:0}}});
    if(path==='/api/v1/staff/blog/cover/upload'){
      expect(req.method()).toBe('POST');expect(req.headers()['x-csrftoken']).toBe('mock-token');expect(req.headers()['content-type']).toBe('application/octet-stream');expect(req.postDataBuffer()).toEqual(png);uploads++;
      return route.fulfill({status:201,json:{cover:'upload:'+id,width:1,height:1}});
    }
    if(path==='/api/v1/staff/blog/cover/'+id)return route.fulfill({contentType:'image/png',body:png});
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');await page.getByRole('button',{name:'+ New article',exact:true}).click();
  await page.getByLabel('Upload cover image',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('img',{name:'Current cover preview'})).toHaveAttribute('src','/api/v1/staff/blog/cover/'+id);
  await expect(page.getByText('Cover uploaded. Save the draft to keep this selection.')).toBeVisible();
  await page.getByRole('button',{name:'Remove cover',exact:true}).click();
  await expect(page.getByRole('img',{name:'Current cover preview'})).toHaveCount(0);expect(uploads).toBe(1);
});

test('rich editor inserts uploaded body image with accessible caption',async({page})=>{
  const id='12345678-1234-1234-1234-123456789abc';
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ9sAAAAASUVORK5CYII=','base64');
  let uploads=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/list')return route.fulfill({json:{results:[],page:1,hasMore:false,counts:{draft:0,published:0,archived:0}}});
    if(path==='/api/v1/staff/blog/cover/upload'){expect(req.headers()['x-csrftoken']).toBe('mock-token');uploads++;return route.fulfill({status:201,json:{cover:'upload:'+id,width:1,height:1}});}
    if(path==='/api/v1/staff/blog/cover/'+id)return route.fulfill({contentType:'image/png',body:png});
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');await page.getByRole('button',{name:'+ New article',exact:true}).click();
  await page.getByRole('textbox',{name:'Article body',exact:true}).fill('Architecture');
  const prompts:string[]=[];
  const answer=async(d:import('@playwright/test').Dialog)=>{prompts.push(d.message());await d.accept(prompts.length===1?'System architecture':'Overview of the system');};
  page.on('dialog',answer);
  await page.getByLabel('Upload inline image',{exact:true}).setInputFiles({name:'diagram.png',mimeType:'image/png',buffer:png});
  const editorBody=page.getByRole('textbox',{name:'Article body',exact:true});
  const editorFigure=editorBody.locator('figure').filter({has:page.getByRole('img',{name:'System architecture',exact:true})});
  await expect(editorFigure.getByRole('img',{name:'System architecture',exact:true})).toBeVisible();
  await expect(editorFigure.locator('figcaption')).toHaveText('Overview of the system');
  page.off('dialog',answer);
  await page.getByRole('button',{name:'Preview draft',exact:true}).click();
  // Preview keeps the editor mounted but hidden to preserve undo history.
  const mountedEditor=page.locator('[role="textbox"][aria-label="Article body"]');
  await expect(mountedEditor).toHaveCount(1);
  await expect(mountedEditor).toBeHidden();
  const preview=page.getByRole('article');
  const figure=preview.locator('figure').filter({has:page.getByRole('img',{name:'System architecture',exact:true})});
  const image=figure.getByRole('img',{name:'System architecture',exact:true});
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src','/api/v1/staff/blog/cover/'+id);
  await expect(figure.locator('figcaption')).toHaveText('Overview of the system');
  await expect(figure.locator('figcaption')).toBeVisible();
  expect(uploads).toBe(1);expect(prompts).toHaveLength(2);
});

test('saved article autosaves private rich document without publishing',async({page})=>{
  let post:BlogDetail={slug:'saved-article',title:'Saved article',category:'Web',status:'published',version:2,updatedAt:'2026-11-25T00:00:00Z',hasUnpublishedChanges:false,
    draft:{title:'Saved article',summary:'Summary',category:'Web',tags:[],sections:[{heading:'Intro',body:'Original text'}],cover:'',seoTitle:'',seoDescription:''},history:[]};
  let writes=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'staff',role:'staff'}});
    if(path==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'mock-token'}});
    if(path==='/api/v1/staff/blog/list')return route.fulfill({json:{results:[post],page:1,hasMore:false,counts:{draft:0,published:1,archived:0}}});
    if(path==='/api/v1/staff/blog/detail/saved-article')return route.fulfill({json:post});
    if(path==='/api/v1/staff/blog/change'){
      const body=req.postDataJSON();expect(body.action).toBe('save');expect(body.version).toBe(2);expect(body.fields.document.type).toBe('doc');expect(body.fields.sections).toEqual([]);writes++;
      post={...post,version:3,draft:body.fields,hasUnpublishedChanges:true};return route.fulfill({json:post});
    }
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');await page.getByRole('button',{name:'Saved article',exact:true}).click();
  await page.getByRole('textbox',{name:'Article body',exact:true}).fill('Updated private draft.');
  await expect(page.getByText('Draft autosaved.',{exact:true})).toBeVisible({timeout:12000});
  await expect(page.getByText('published · v3',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish article',exact:true})).toHaveCount(0);
  expect(writes).toBe(1);
});

test('editor retains formatting through full screen and preview and guards unsaved exit',async({page})=>{
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const path=new URL(route.request().url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'staff',role:'staff'}});
    if(path==='/api/v1/staff/blog/list')return route.fulfill({json:{results:[],page:1,hasMore:false,counts:{draft:0,published:0,archived:0}}});
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');
  await page.getByRole('button',{name:'+ New article',exact:true}).click();
  const body=page.getByRole('textbox',{name:'Article body',exact:true});
  await body.fill('Keep this text');
  await expect(body).toHaveText('Keep this text');
  // Home/End behavior differs by OS, wrapping and contenteditable implementation.
  // This fixture contains a single paragraph: select its entire content instead.
  await body.press('ControlOrMeta+a');
  await expect.poll(()=>body.evaluate(el=>{
    const selection=window.getSelection();
    if(!selection||!selection.anchorNode||!selection.focusNode||
       !el.contains(selection.anchorNode)||!el.contains(selection.focusNode))return '';
    return selection.toString();
  }),{message:'Select the full editor text before using the formatting toolbar'}).toBe('Keep this text');
  const bold=page.getByRole('toolbar',{name:'Article formatting',exact:true}).getByRole('button',{name:'Bold',exact:true});
  await bold.click();
  await expect(body.locator('strong')).toHaveText('Keep this text');
  await page.getByRole('button',{name:'Full screen',exact:true}).click();
  await expect(body.locator('strong')).toHaveText('Keep this text');
  await page.getByRole('button',{name:'Preview draft',exact:true}).click();
  await expect(page.getByRole('article').locator('strong')).toHaveText('Keep this text');
  await page.getByRole('button',{name:'Editor',exact:true}).click();
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
  await expect(body.locator('strong')).toHaveText('Keep this text');
  await page.getByRole('button',{name:'Exit full screen',exact:true}).click();
  const mobileNav=page.getByRole('button',{name:'Toggle workspace navigation'});
  if(await mobileNav.isVisible())await mobileNav.click();
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await expect(page).toHaveURL(/\/workspace\/blog$/);
  await expect(body.locator('strong')).toHaveText('Keep this text');
});
