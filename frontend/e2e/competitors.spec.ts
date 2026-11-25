import {test,expect} from '@playwright/test';

test('paired competitor evidence becomes a private article opportunity',async({page})=>{
  const c={id:'1',name:'Example Studio',domain:'example.org',market:'Myanmar',active:true,version:'1'};
  const prompt={id:'2',question:'Which studios serve SMEs?',language:'English',market:'Myanmar'};
  const measurement={id:'a06f9534-122a-43f6-a0c9-34814dfec8c1',engine:'ChatGPT Search',observedAt:'2026-11-25T00:00:00Z',context:'Fresh search',brand:'absent',citation:'absent',sources:[{url:'https://example.org/guide',owned:false}],evidence:'Example Studio named.'};
  let registered=false, observed=false, gapSaved=false, drafted=false;
  const obs={id:'1',measurementId:measurement.id,promptId:prompt.id,question:prompt.question,engine:measurement.engine,observedAt:measurement.observedAt,context:measurement.context,ownBrand:'absent',ownCitation:'absent',brand:'present',sources:['https://example.org/guide'],evidence:'Named competitor.'};
  const metrics=()=>({paired:Number(observed),comparable:Number(observed),ownMentions:0,competitorMentions:Number(observed),ownOnly:0,competitorOnly:Number(observed),both:0,neither:0,competitorSources:Number(observed),citationGapSignals:Number(observed),ownShare:observed?0:null});
  const gap=()=>({id:'3',promptId:prompt.id,question:prompt.question,measurementId:measurement.id,competitorId:c.id,competitor:c.name,title:'New SME guide',brief:'Internal comparison note',target:'',priority:'high',status:drafted?'in_progress':'open',version:drafted?'2':'1',postSlug:drafted?'sme-guide':'',postStatus:drafted?'draft':''});
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{
    const p=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(p.endsWith('/auth/me'))return r.fulfill({json:{username:'owner',role:'owner'}});
    if(p.endsWith('/auth/csrf'))return r.fulfill({json:{csrfToken:'mock'}});
    if(p.endsWith('/monitoring/list'))return r.fulfill({json:{results:[prompt],hasMore:false}});
    if(p.endsWith('/monitoring/history'))return r.fulfill({json:{results:[measurement],hasMore:false}});
    if(p.endsWith('/competitors/list'))return r.fulfill({json:{results:registered?[c]:[],hasMore:false}});
    if(p.endsWith('/competitors/benchmark'))return r.fulfill({json:{competitor:c,metrics:metrics(),results:observed?[obs]:[],hasMore:false}});
    if(p.endsWith('/competitors/gaps'))return r.fulfill({json:{results:gapSaved?[gap()]:[],hasMore:false}});
    if(p.endsWith('/competitors/coverage'))return r.fulfill({json:{scanned:3,complete:true,matchCount:0,results:[],matchesTruncated:false}});
    if(p.endsWith('/competitors/create')){expect(r.request().headers()['x-csrftoken']).toBe('mock');expect(r.request().postDataJSON()).toEqual({name:c.name,domain:c.domain,market:c.market});registered=true;return r.fulfill({status:201,json:c});}
    if(p.endsWith('/competitors/observe')){expect(r.request().postDataJSON()).toEqual({id:c.id,measurementId:measurement.id,brand:'present',evidence:'Named competitor.'});observed=true;return r.fulfill({status:201,json:obs});}
    if(p.endsWith('/competitors/gaps/create')){expect(r.request().postDataJSON()).toEqual({promptId:prompt.id,measurementId:measurement.id,competitorId:c.id,title:'New SME guide',brief:'Internal comparison note',target:'',priority:'high'});gapSaved=true;return r.fulfill({status:201,json:gap()});}
    if(p.endsWith('/competitors/gaps/draft')){expect(r.request().postDataJSON()).toEqual({id:'3',version:'1',slug:'sme-guide',title:'New SME guide',summary:'A public summary',category:'Web',body:'Public article body'});drafted=true;return r.fulfill({status:201,json:gap()});}
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/competitors');await expect(page.getByRole('heading',{name:'Competitors & content gaps'})).toBeVisible();
  await page.getByRole('button',{name:'Add competitor'}).click();await page.getByLabel('Company name',{exact:true}).fill(c.name);await page.getByLabel('Website hostname',{exact:true}).fill(c.domain);await page.getByLabel('Target market',{exact:true}).fill(c.market);await page.getByRole('button',{name:'Save competitor'}).click();await expect(page.getByText('Competitor registered.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Which studios serve SMEs/}).click();await page.getByRole('button',{name:/ChatGPT Search/}).click();await page.getByRole('button',{name:'Record competitor result'}).click();await page.getByLabel('Competitor brand mention',{exact:true}).selectOption('present');await page.getByLabel('Competitor evidence',{exact:true}).fill('Named competitor.');await page.getByRole('button',{name:'Save competitor observation'}).click();await expect(page.getByText('Competitor observation recorded.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Create opportunity',exact:true}).click();await page.getByLabel('Opportunity title',{exact:true}).fill('New SME guide');await page.getByLabel('Content gap / action brief (private)',{exact:true}).fill('Internal comparison note');await page.getByLabel('Priority',{exact:true}).selectOption('high');await page.getByRole('button',{name:'Save opportunity'}).click();await expect(page.getByText('Opportunity created.',{exact:true})).toBeVisible();
  await page.getByLabel('Content phrase',{exact:true}).fill('SME automation');await page.getByRole('button',{name:'Check content coverage'}).click();await expect(page.getByText('0 matching articles / 3 scanned',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Create article draft'}).click();await page.getByLabel('URL slug',{exact:true}).fill('sme-guide');await page.getByLabel('Article summary',{exact:true}).fill('A public summary');await page.getByLabel('Category',{exact:true}).fill('Web');await page.getByLabel('Initial article body',{exact:true}).fill('Public article body');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Save private draft'}).click();await expect(page.getByRole('link',{name:'Open draft article →'})).toHaveAttribute('href','/workspace/blog?edit=sme-guide');expect(drafted).toBe(true);
});

test('client cannot request competitor evidence',async({page})=>{
  let calls=0;await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{if(new URL(r.request().url()).pathname.replace(/\/$/,'').endsWith('/auth/me'))return r.fulfill({json:{username:'client',role:'client'}});calls++;return r.fulfill({status:403,json:{error:'Denied'}});});await page.goto('/workspace/competitors');await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();expect(calls).toBe(0);
});
