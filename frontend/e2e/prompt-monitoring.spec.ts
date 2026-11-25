import {test,expect} from '@playwright/test';
const keys=['answer','brand','citation'] as const;
const empty={total:0,...Object.fromEntries(keys.flatMap(k=>['present','absent','inconclusive'].map(o=>[`${k}_${o}`,0])))};
test('owner records independent brand and site citation observations',async({page})=>{
  let saved=false;let records:unknown[]=[];
  const prompt={id:'1',question:'Which studios offer AI services?',language:'English',market:'Southeast Asia',intent:'commercial',engines:['ChatGPT Search','Perplexity'],cadenceDays:7,active:true,version:'1',checks:[{engine:'ChatGPT Search',due:true,lastObserved:null},{engine:'Perplexity',due:true,lastObserved:null}]};
  const stats=()=>saved?{...empty,total:1,answer_present:1,brand_absent:1,citation_present:1}:empty;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{const p=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(p.endsWith('/auth/me'))return r.fulfill({json:{username:'owner',role:'owner'}});
    if(p.endsWith('/auth/csrf'))return r.fulfill({json:{csrfToken:'mock'}});
    if(p.endsWith('/monitoring/list'))return r.fulfill({json:{results:[prompt],hasMore:false,activeCount:1,metrics:stats()}});
    if(p.endsWith('/monitoring/history'))return r.fulfill({json:{prompt,citations:saved?[{url:'https://cedarandcursor.com/',checks:1}]:[],results:records,hasMore:false,metrics:stats(),engines:[{engine:'ChatGPT Search',...stats()}]}});
    if(p.endsWith('/monitoring/record')){const d=r.request().postDataJSON();expect(r.request().headers()['x-csrftoken']).toBe('mock');expect(d.answer).toBe('present');expect(d.brand).toBe('absent');expect(d.citation).toBe('present');expect(d.sources).toBe('https://cedarandcursor.com/');saved=true;records=[{id:d.requestId,engine:d.engine,observedAt:d.observedAt,recordedAt:d.observedAt,context:d.context,answer:d.answer,brand:d.brand,citation:d.citation,sources:[{url:d.sources,owned:true}],evidence:d.evidence}];return r.fulfill({status:201,json:records[0]});}
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/monitoring');await expect(page.getByRole('heading',{name:'AI visibility monitoring'})).toBeVisible();await page.getByRole('button',{name:'Open prompt'}).click();await page.getByRole('button',{name:'Record result'}).first().click();
  await page.getByLabel('Search context / model / region').fill('Fresh search session');
  for(const [name,value] of [['Relevant answer','present'],['Brand mention','absent'],['Site citation','present']] as const){
    const field=page.getByRole('combobox',{name,exact:true});
    await expect(field).toHaveAccessibleName(name);
    await field.selectOption(value);
    await expect(field).toHaveValue(value);
  }
  await page.getByLabel('Observed source URLs',{exact:false}).fill('https://cedarandcursor.com/');await page.getByLabel('Evidence / short excerpt').fill('Link appeared without the company name.');await page.getByRole('button',{name:'Save observed result'}).click();await expect(page.getByText('Observation recorded.',{exact:true})).toBeVisible();await expect(page.getByText('Found / Not found / Found',{exact:true})).toBeVisible();expect(saved).toBe(true);
});
test('client cannot access AI visibility monitoring',async({page})=>{let calls=0;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'').endsWith('/auth/me'))return r.fulfill({json:{username:'client',role:'client'}});calls++;return r.fulfill({status:403,json:{error:'Denied'}});});await page.goto('/workspace/monitoring');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(calls).toBe(0);});
