import {test,expect} from '@playwright/test';
test('hero switches between meaningful capability diagrams',async({page})=>{
 await page.goto('/');
 const hero=page.locator('#home');
 await expect(hero.getByRole('img',{name:/responsive web layout/i})).toBeVisible();
 await hero.getByRole('button',{name:'Software',exact:true}).click();
 await expect(hero.getByRole('img',{name:/events moving/i})).toBeVisible();
 await hero.getByRole('button',{name:'AI',exact:true}).click();
 await expect(hero.getByRole('img',{name:/question routed/i})).toBeVisible();
 await hero.getByRole('button',{name:'Pause motion'}).click();
 await expect(hero.getByRole('button',{name:'Play motion'})).toHaveAttribute('aria-pressed','true');
});
test('guided estimate and local brief export',async({page})=>{
 await page.goto('/#estimate');
 const region=page.locator('#estimate');
 await expect(region.getByRole('button',{name:'Continue'})).toBeDisabled();
 await region.getByRole('button',{name:/A website that brings in customers/}).click();
 await region.getByRole('button',{name:'Continue'}).click();
 await region.getByRole('button',{name:'Stand out visually'}).click();
 await region.getByRole('button',{name:'Continue'}).click();
 await region.getByRole('button',{name:'Manage content'}).click();
 await region.getByRole('button',{name:'Continue'}).click();
 await region.getByRole('button',{name:'Ready to build'}).click();
 await region.getByRole('button',{name:'Continue'}).click();
 await expect(region.getByText('$900 – $1,250')).toBeVisible();
 await region.getByRole('link',{name:/Prepare a tailored brief/}).click();
 const contact=page.locator('#contact');
 await contact.getByLabel('Project overview').fill('A multilingual business website for our customers.');
 await contact.getByRole('button',{name:'Continue'}).click();
 await contact.getByLabel('Your name').fill('Test Client');
 await contact.getByLabel('Email').fill('client@example.com');
 await contact.getByRole('button',{name:'Continue'}).click();
 const download=page.waitForEvent('download');
 await contact.getByRole('button',{name:/Export brief/}).click();
 expect((await download).suggestedFilename()).toBe('cedar-cursor-project-brief.txt');
});
test('workflow responds to stage selection',async({page})=>{
 await page.goto('/#process');
 await page.getByRole('tab',{name:'Build'}).click();
 await expect(page.getByRole('tabpanel')).toContainText('A working product');
 await page.getByRole('button',{name:'Next stage'}).click();
 await expect(page.getByRole('tab',{name:'Refine'})).toHaveAttribute('aria-selected','true');
});
test('blog routes and unknown slug',async({page})=>{
 await page.goto('/blog');
 await page.getByRole('link',{name:/What should you budget for a business website/}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('What should you budget for a business website?');
 const response=await page.goto('/blog/unknown-post');
 expect(response?.status()).toBe(404);
});

test('additive studio demos work without replacing the original site',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'}); // isolate manual interactions from the automatic preview
 await page.goto('/');
 await expect(page.locator('#home')).toBeVisible();
 await expect(page.locator('#estimate')).toBeVisible();
 const web=page.locator('#studio-web');
 await web.getByRole('button',{name:'Mobile preview'}).click();
 await expect(web.getByRole('button',{name:'Mobile preview'})).toHaveAttribute('aria-pressed','true');
 await web.getByRole('button',{name:'Explore the menu'}).click();
 await expect(web.getByRole('button',{name:/Chongqing Mala Pot/})).toBeVisible();
 const ops=page.locator('#studio-operations');
 await ops.getByRole('button',{name:'List',exact:true}).click();
 await ops.getByRole('textbox',{name:'Search demo projects'}).fill('Website');
 await ops.getByLabel('Move Website refresh').selectOption('Complete');
 await expect(ops.getByText('2 complete / 8')).toBeVisible();
 const knowledge=page.locator('#studio-knowledge');
 await knowledge.getByRole('button',{name:'Can the assistant approve a payment?'}).click();
 await knowledge.getByRole('button',{name:/Approval policy/}).click();
 await expect(knowledge.getByText('Financial approvals must remain with authorized human reviewers.')).toBeVisible();
 const flow=page.locator('#studio-workflows');
 await flow.getByRole('button',{name:'Run example'}).click();
 for(let i=0;i<3;i++)await flow.getByRole('button',{name:'Next step'}).click();
 await expect(flow.getByText('Approval required',{exact:true})).toBeVisible();
 await flow.getByRole('button',{name:'Approve example'}).click();
 await expect(flow.getByText('Example completed',{exact:true})).toBeVisible();
 await expect(page.locator('#contact')).toBeVisible();
});


test('studio previews autoplay in view and stop for manual interaction',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/');
 const web=page.locator('#studio-web');
 const frame=web.locator('[data-motion-running]');
 await expect(frame).toHaveAttribute('data-motion-running','false');
 await frame.scrollIntoViewIfNeeded();
 await expect(frame).toHaveAttribute('data-motion-running','true');
 await expect(web.getByRole('button',{name:'Mobile preview'})).toHaveAttribute('aria-pressed','true',{timeout:9000});
 await web.getByRole('button',{name:'Desktop preview'}).click();
 await expect(frame).toHaveAttribute('data-motion-running','false');
 await expect(web.getByRole('button',{name:/Play Web \/ Responsive preview auto preview/})).toBeVisible();
 // A full interval passes without taking control away from the visitor.
 await page.waitForTimeout(3700);
 await expect(web.getByRole('button',{name:'Desktop preview'})).toHaveAttribute('aria-pressed','true');
 await web.getByRole('button',{name:/Play Web \/ Responsive preview auto preview/}).click();
 await expect(frame).toHaveAttribute('data-motion-running','true');
 await page.locator('#home').scrollIntoViewIfNeeded();
 await expect(frame).toHaveAttribute('data-motion-running','false');
});

test('automatic workflow demonstrates the approval gate without auto-approving',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/');
 const flow=page.locator('#studio-workflows');
 await flow.locator('[data-motion-running]').scrollIntoViewIfNeeded();
 await expect(flow.getByText('Approval required',{exact:true})).toBeVisible({timeout:15000});
 await expect(flow.getByText('Example completed',{exact:true})).toHaveCount(0);
 await flow.getByRole('button',{name:'Approve example'}).click();
 await expect(flow.getByText('Example completed',{exact:true})).toBeVisible();
 await expect(flow.locator('[data-motion-running]')).toHaveAttribute('data-motion-running','false');
});

test('reduced motion stops automatic previews but keeps manual controls',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const web=page.locator('#studio-web');
 const frame=web.locator('[data-motion-running]');
 await frame.scrollIntoViewIfNeeded();
 await expect(web.getByRole('button',{name:/Disabled Web \/ Responsive preview auto preview/})).toBeDisabled();
 await page.waitForTimeout(3700);
 await expect(frame).toHaveAttribute('data-motion-running','false');
 await expect(web.getByRole('button',{name:'Desktop preview'})).toHaveAttribute('aria-pressed','true');
 await web.getByRole('button',{name:'Mobile preview'}).click();
 await expect(web.getByRole('button',{name:'Mobile preview'})).toHaveAttribute('aria-pressed','true');
});

test('automatic project movement preserves card identity and layout',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/');
 const ops=page.locator('#studio-operations');
 const frame=ops.locator('[data-motion-running]');
 await frame.scrollIntoViewIfNeeded();
 await expect(frame).toHaveAttribute('data-motion-running','true');
 const card=ops.locator('[data-layout-key="Website refresh"]');
 await card.evaluate(el=>el.setAttribute('data-original-node','yes'));
 const before=await card.evaluate(el=>el.style.gridColumn);
 await expect.poll(()=>card.evaluate(el=>el.style.gridColumn),{timeout:10000}).not.toBe(before);
 await expect(card).toHaveAttribute('data-original-node','yes');
 await expect(ops.getByRole('button',{name:'Board',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(ops.getByText(/Website refresh · /)).toBeVisible();
});

test('responsive demo keeps browser and page layers mounted during transitions',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const web=page.locator('#studio-web');
 const browser=web.locator('[data-mobile]');
 await browser.evaluate(el=>el.setAttribute('data-original-node','yes'));
 const home=web.locator('[data-active=true]');
 await expect(home).toHaveCount(1);
 await web.getByRole('button',{name:'Mobile preview'}).click();
 await web.getByRole('button',{name:'Explore the menu'}).click();
 await expect(browser).toHaveAttribute('data-original-node','yes');
 await expect(web.getByRole('button',{name:/Chongqing Mala Pot/})).toBeVisible();
 await expect(web.locator('[data-active=false][inert]')).toHaveCount(2);
});

test('Sunlit project preview has real menu highlights and a local reservation review',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/#studio-web');
 const web=page.locator('#studio-web');
 await expect(web.getByRole('link',{name:'View live website'})).toHaveAttribute('href','https://www.sunlit-hotpot-bkk.com/');
 await web.getByRole('button',{name:'Explore the menu'}).click();
 await web.getByRole('button',{name:'Meat & seafood',exact:true}).click();
 await web.getByRole('button',{name:/Seafood selection/}).click();
 await expect(web.getByRole('button',{name:/Seafood selection/})).toHaveAttribute('aria-pressed','true');
 await web.getByRole('button',{name:'Visit',exact:true}).click();
 await web.getByRole('button',{name:'4 guests',exact:true}).click();
 await web.getByRole('button',{name:'Saturday',exact:true}).click();
 await web.getByRole('button',{name:'19:30',exact:true}).click();
 await web.getByRole('button',{name:'Preview reservation',exact:true}).click();
 await expect(web.getByText('4 guests · Saturday · 19:30',{exact:true})).toBeVisible();
 await expect(web.getByText('No reservation has been made.',{exact:true})).toBeVisible();
 await web.getByRole('button',{name:'Edit selection',exact:true}).click();
 await expect(web.getByRole('button',{name:'4 guests',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('additive public scenes use distinct colours and a single preview toolbar',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/#studio-web');
 for(const [id,tone,accent] of [['studio-web','web','#535966'],['studio-operations','software','#41649a'],['studio-knowledge','ai','#75608f'],['studio-workflows','automation','#36796f']] as const){
  const scene=page.locator(`#${id} [data-studio-tone="${tone}"]`);
  await expect(scene).toHaveCount(1);
  await expect(scene.getByRole('button',{name:/Disabled .* auto preview/})).toHaveCount(1);
  expect(await scene.evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim())).toBe(accent);
  expect(await scene.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
 }
 const web=page.locator('#studio-web');
 await web.getByRole('button',{name:'Mobile preview'}).click();
 await web.getByRole('button',{name:'Explore the menu'}).click();
 await expect(web.getByRole('button',{name:/Chongqing Mala Pot/})).toBeVisible();
});

test('home editorial sections retain interaction without nested marketing cards',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const home=page.locator('main.studio-home');
 await expect(home.locator('#services .service-module')).toHaveCount(4);
 await expect(home.locator('#services .service-matrix')).toHaveCSS('display','block');
 await expect(home.locator('#estimate .discovery-shell')).toHaveCSS('border-left-width','0px');
 await expect(home.locator('#process .journey-stage')).toHaveCSS('border-left-width','0px');
 await expect(home.locator('#contact .panel')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await home.locator('#services .service-module').first().getByRole('button',{name:'Mobile',exact:true}).click();
 await expect(home.locator('#services .service-module').first().getByRole('button',{name:'Mobile',exact:true})).toHaveAttribute('aria-pressed','true');
 await home.getByRole('tab',{name:'Build',exact:true}).click();
 await expect(home.getByRole('tabpanel')).toContainText('A working product');
});

test('Sunlit preview uses a single light canvas with readable menu and open booking controls',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/#studio-web');
 const web=page.locator('#studio-web');
 const browser=web.locator('[data-mobile]');
 await expect(browser).toHaveCSS('background-color','rgb(253, 252, 249)');
 await expect(web.getByText('PREVIEW',{exact:true})).toHaveCount(0);
 await web.getByRole('button',{name:'Explore the menu',exact:true}).click();
 await expect(web.getByRole('button',{name:/Chongqing Mala Pot/})).toBeVisible();
 await web.getByRole('button',{name:'Visit',exact:true}).click();
 await expect(web.getByRole('button',{name:'4 guests',exact:true})).toBeVisible();
 await web.getByRole('button',{name:'4 guests',exact:true}).click();
 await web.getByRole('button',{name:'Preview reservation',exact:true}).click();
 await expect(web.getByText('No reservation has been made.',{exact:true})).toBeVisible();
 await web.getByRole('button',{name:'Edit selection',exact:true}).click();
 await expect(web.getByRole('button',{name:'4 guests',exact:true})).toHaveAttribute('aria-pressed','true');
});
