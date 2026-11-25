import {test,expect} from '@playwright/test';
import type {MediaAsset} from '../components/blog/media-library';
const id='12345678-1234-1234-1234-123456789abc';
const asset:MediaAsset={id,ref:'upload:'+id,filename:'Architecture.png',alt:'System architecture',caption:'Overview',width:1200,height:630,bytes:50000,version:1,createdAt:'2026-11-25T00:00:00Z',storage:'database'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ9sAAAAASUVORK5CYII=','base64');
test('owner reuses library asset as article cover without uploading',async({page})=>{
  let uploads=0;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),async route=>{
    const path=new URL(route.request().url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/staff/blog/list')return route.fulfill({json:{results:[],page:1,hasMore:false,counts:{draft:0,published:0,archived:0}}});
    if(path==='/api/v1/staff/blog/media/list')return route.fulfill({json:{results:[asset],page:1,hasMore:false,count:1,bytes:asset.bytes}});
    if(path==='/api/v1/staff/blog/media/detail/'+id)return route.fulfill({json:{...asset,articles:[],articleCount:0,revisionCount:0}});
    if(path==='/api/v1/staff/blog/cover/'+id)return route.fulfill({contentType:'image/png',body:png});
    if(path==='/api/v1/staff/blog/cover/upload')uploads++;
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/blog');await page.getByRole('button',{name:'+ New article',exact:true}).click();
  await page.getByRole('button',{name:'Choose from media library',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Media picker'});
  const pickerHeader=picker.getByRole('heading',{name:'Choose an image',exact:true}).locator('xpath=ancestor::header[1]');
  await expect(pickerHeader).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(pickerHeader).toHaveCSS('position','static');
  await picker.getByRole('button',{name:/Architecture\.png/}).click();
  await picker.getByRole('button',{name:'Use image',exact:true}).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('img',{name:'Current cover preview'})).toHaveAttribute('src','/api/v1/staff/blog/cover/'+id);
  expect(uploads).toBe(0);
});
test('client cannot open the library or query assets',async({page})=>{
  let calls=0;await page.route(url=>url.pathname.startsWith('/api/v1/'),route=>{
    if(new URL(route.request().url()).pathname.replace(/\/$/,'')==='/api/v1/auth/me')return route.fulfill({json:{username:'client',role:'client'}});
    calls++;return route.fulfill({status:403,json:{error:'Access denied'}});
  });await page.goto('/workspace/media');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(calls).toBe(0);
});

test('media workspace header does not inherit the public site navigation style',async({page})=>{
  await page.route(url=>url.pathname.startsWith('/api/v1/'),route=>{
    const path=new URL(route.request().url()).pathname.replace(/\/$/,'');
    if(path==='/api/v1/auth/me')return route.fulfill({json:{username:'owner',role:'owner'}});
    if(path==='/api/v1/staff/blog/media/list')return route.fulfill({json:{results:[],page:1,hasMore:false,count:0,bytes:0}});
    return route.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/media');
  const heading=page.getByRole('heading',{name:'Media library',exact:true});
  await expect(heading).toBeVisible();
  const header=heading.locator('xpath=ancestor::header[1]');
  await expect(header).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(header).toHaveCSS('color','rgb(37, 39, 43)');
  await expect(header).toHaveCSS('position','static');
  await expect(header).toHaveCSS('border-bottom-width','0px');
  await expect(page.getByRole('button',{name:'+ Upload images',exact:true})).toBeVisible();
  await expect(page.getByText('No matching images.',{exact:true})).toBeVisible();
});
