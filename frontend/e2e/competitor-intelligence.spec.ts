import {test,expect} from '@playwright/test';

test('owner runs website analysis, reviews actual signals and compares topics',async({page})=>{
  let c={id:'1',name:'Attio',domain:'attio.com',market:'SaaS',active:true,version:'1',kind:'unclassified'};
  const summary={id:'8',competitorId:'1',recordedAt:'2026-11-25T12:00:00Z',state:'sampled',measured:1,discovered:2};
  const report={...summary,delta:{previousId:'7',previousAt:'2026-11-24T12:00:00Z',overlap:1,newlySampled:[],notResampled:['/old'],changes:[{path:'/',fields:['title']}]},report:{analysisVersion:2,sampleKinds:['home'],host:'attio.com',robots:'available',sitemap:'sampled',state:'sampled',requests:3,discovered:2,scope:'Bounded public HTML sample',notes:['Partial sample.'],pages:[{path:'/',status:200,ms:70,measured:true,pageKind:'home',contentScope:'main landmark',missingAltAttribute:1,emptyAlt:0,decorativeImages:1,nonemptyAlt:1,images:3,recommendations:[{key:'alt',priority:'medium',evidence:'1 sampled image lacks an alt attribute.',action:'Review image purpose.'}],title:'Example CRM',description:'Example description',canonical:'https://attio.com/',wordCount:180,headings:[{level:1,text:'Custom software'}],checks:{seo:{title:true,description:true},aeo:{questionHeading:false},geo:{substantiveText:true}},schemaTypes:['Organization'],technology:['Example signature']}]}};
  let scanned=false;
  await page.route(url=>url.pathname.startsWith('/api/v1/'),r=>{const p=new URL(r.request().url()).pathname.replace(/\/$/,'');
    if(p.endsWith('/auth/me'))return r.fulfill({json:{username:'owner',role:'owner'}});
    if(p.endsWith('/auth/csrf'))return r.fulfill({json:{csrfToken:'mock'}});
    if(p.endsWith('/competitors/list'))return r.fulfill({json:{results:[c],hasMore:false}});
    if(p.endsWith('/competitors/benchmark'))return r.fulfill({json:{competitor:c,metrics:{paired:0,comparable:0,ownMentions:0,competitorMentions:0,ownOnly:0,competitorOnly:0,both:0,neither:0,competitorSources:0,citationGapSignals:0,ownShare:null},results:[],hasMore:false}});
    if(p.endsWith('/intelligence/history'))return r.fulfill({json:{competitor:c,enabled:true,results:scanned?[summary]:[]}});
    if(p.endsWith('/intelligence/classify')){expect(r.request().postDataJSON()).toEqual({id:'1',version:'1',kind:'reference'});c={...c,version:'2',kind:'reference'};return r.fulfill({json:c});}
    if(p.endsWith('/intelligence/run')){expect(r.request().headers()['x-csrftoken']).toBe('mock');expect(r.request().postDataJSON()).toEqual({id:'1',variant:'apex'});scanned=true;return r.fulfill({status:201,json:report});}
    if(p.endsWith('/intelligence/detail'))return r.fulfill({json:report});
    if(p.endsWith('/intelligence/compare'))return r.fulfill({json:{competitorScanned:1,competitorMatches:[{path:'/',title:'Example CRM'}],ownScanned:3,ownMatchCount:0,ownBodyMatchCount:1,ownMatches:[],ownComplete:true,ownSectionCount:10,ownSectionMatches:[],ownSectionScope:'Curated local homepage section labels and headings.'}});
    if(p.endsWith('/monitoring/list')||p.endsWith('/competitors/gaps'))return r.fulfill({json:{results:[],hasMore:false}});
    return r.fulfill({status:501,json:{error:'Unexpected request'}});
  });
  await page.goto('/workspace/competitors');await page.getByRole('button',{name:'Open benchmark'}).click();await page.getByRole('button',{name:'Open website intelligence'}).click();
  await expect(page.getByText('No website sample recorded.',{exact:true})).toBeVisible();
  await page.getByLabel('Competitor relationship',{exact:true}).selectOption('reference');await page.getByRole('button',{name:'Save relationship'}).click();await expect(page.getByText('Competitor classification updated.',{exact:true})).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Run website analysis'}).click();await expect(page.getByText('Website sample recorded. Review the scope and any incomplete checks.',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Priority review',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Historical changes',exact:true})).toBeVisible();
  await expect(page.getByText('Newly sampled: None · Not resampled: /old',{exact:true})).toBeVisible();
  await page.getByText('Inspect findings',{exact:true}).click();await expect(page.getByText('Detected · Page title',{exact:true})).toBeVisible();
  await page.getByLabel('Comparison phrase',{exact:true}).fill('custom software');await page.getByRole('button',{name:'Compare coverage'}).click();await expect(page.getByText('Research opportunity:',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Local homepage inventory',exact:true})).toBeVisible();expect(scanned).toBe(true);
});
