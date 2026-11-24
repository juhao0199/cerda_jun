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
      const b=req.postDataJSON();expect(req.headers()['x-csrftoken']).toBe('mock-token');expect(b.slug).toBe('example-article');expect(b.fields.title).toBe('Example article');expect(b).not.toHaveProperty('status');writes++;
      post={slug:b.slug,title:b.fields.title,category:b.fields.category,status:'draft',version:1,updatedAt:'2026-11-25T00:00:00Z',hasUnpublishedChanges:true,draft:b.fields,history:[{version:1,status:'draft',action:'create',createdAt:'2026-11-25T00:00:00Z'}]};return route.fulfill({status:201,json:post});
    }
    if(path==='/api/v1/staff/blog/change'&&post){const b=req.postDataJSON();expect(req.headers()['x-csrftoken']).toBe('mock-token');expect(b).toEqual({slug:'example-article',version:1,action:'publish'});writes++;post={...post,status:'published',version:2,hasUnpublishedChanges:false,history:[{version:2,status:'published',action:'publish',createdAt:'2026-11-25T00:00:00Z'},...post.history]};return route.fulfill({json:post});}
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');await page.getByRole('button',{name:'+ New article',exact:true}).click();await page.getByLabel('Article title',{exact:true}).fill('Example article');await page.getByLabel('URL slug',{exact:false}).fill('example-article');await page.getByLabel('Summary',{exact:true}).fill('A practical summary');await page.getByLabel('Category',{exact:true}).fill('Web');await page.getByLabel('Heading 1',{exact:true}).fill('Introduction');await page.getByLabel('Body 1',{exact:true}).fill('A useful paragraph.');await page.getByLabel('Cover image',{exact:true}).selectOption('web');await page.getByRole('button',{name:'Preview draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Example article',exact:true})).toBeVisible();await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByRole('button',{name:'Create draft',exact:true}).click();await expect(page.getByText('Draft saved.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Publish article',exact:true})).toBeEnabled();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish article',exact:true}).click();await expect(page.getByText('Article published.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'View published article ↗'})).toBeVisible();expect(writes).toBe(2);
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
