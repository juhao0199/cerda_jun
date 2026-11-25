/* Run locally: sample the public site's actual rendered colors, no credentials. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const target = 'https://www.sunlit-hotpot-bkk.com/';
async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(target, {waitUntil:'domcontentloaded', timeout:45000});
    await page.locator('h1').first().waitFor({state:'visible',timeout:20000});
    await page.evaluate(() => document.fonts.ready);
    if (new URL(page.url()).hostname !== 'www.sunlit-hotpot-bkk.com' && new URL(page.url()).hostname !== 'sunlit-hotpot-bkk.com') throw new Error('Unexpected website redirect');
    const tokens = await page.evaluate(() => {
      const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
      const rgb = str => { const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(str); return m ? '#' + m.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join('') : null; };
      const bg = el => {for(let e=el;e;e=e.parentElement){const v=rgb(getComputedStyle(e).backgroundColor);if(v)return v;}return null;};
      const color = el => el ? rgb(getComputedStyle(el).color) : null;
      const h = [...document.querySelectorAll('h1')].find(visible);
      const section = [...document.querySelectorAll('h2')].find(visible);
      const header = [...document.querySelectorAll('header,nav,[role=navigation]')].find(visible);
      const candidates = [...document.querySelectorAll('a,button')].filter(e=>visible(e)&&/^(reserve table|reserve|book (?:a|my) table)$/i.test(e.textContent.trim()));
      const cta=candidates.find(e=>rgb(getComputedStyle(e).backgroundColor));
      if(!h || !section || !header || !cta) throw new Error('Cannot identify visible brand elements and filled reservation CTA. Inspect the live website before retrying.');
      const result={ '--sunlit-bg':bg(section), '--sunlit-ink':color(section), '--sunlit-muted':color(section.parentElement.querySelector('p')) || color(section), '--sunlit-nav':bg(header), '--sunlit-nav-ink':color(header.querySelector('a') || header), '--sunlit-cta':rgb(getComputedStyle(cta).backgroundColor), '--sunlit-cta-ink':color(cta), '--sunlit-hero-ink':color(h) };
      for(const [name,value] of Object.entries(result)) if(!value) throw new Error('No opaque sampled color for '+name);
      return result;
    });
    // Preserve the original foreground when readable; otherwise choose a neutral accessible one.
    const lum = hex => { const v=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4); return v[0]*.2126+v[1]*.7152+v[2]*.0722; };
    const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    for(const [fg,bg] of [['--sunlit-ink','--sunlit-bg'],['--sunlit-muted','--sunlit-bg'],['--sunlit-nav-ink','--sunlit-nav'],['--sunlit-cta-ink','--sunlit-cta']]){
      if(ratio(tokens[fg],tokens[bg])<4.5){const before=tokens[fg];tokens[fg]=ratio('#ffffff',tokens[bg])>ratio('#111111',tokens[bg])?'#ffffff':'#111111';console.warn(`${fg}: ${before} adjusted to ${tokens[fg]} for contrast`);}
    }
    const dest=path.resolve(__dirname,'../components/sunlit-brand.json');
    fs.writeFileSync(dest+'.tmp',JSON.stringify(tokens,null,2)+'\n');fs.renameSync(dest+'.tmp',dest);
    console.log('Sampled Sunlit brand colors:',tokens);
  } finally {await browser.close();}
}
main().catch(e=>{console.error('Brand sampling failed; existing palette unchanged:',e.message);process.exitCode=1;});
