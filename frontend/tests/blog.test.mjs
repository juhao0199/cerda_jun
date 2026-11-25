import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validSlug,coverPath,xml,blankArticle,readingMinutes} from '../lib/blog-content.ts';
test('blog slugs and cover paths reject arbitrary URLs',()=>{
  assert.equal(validSlug('website-design-2027'),true);
  for(const s of ['','../draft','javascript:alert(1)','A','a--b','a\n','a'.repeat(101)])assert.equal(validSlug(s),false);
  assert.equal(coverPath('ai'),'/blog-covers/ai.svg');assert.equal(coverPath('https://example.com/x'),null);assert.equal(coverPath(''),null);
});
test('RSS XML escaping and reading time',()=>{
  assert.equal(xml('<script>&"\''),'&lt;script&gt;&amp;&quot;&apos;');
  assert.equal(readingMinutes(blankArticle()),1);
  const a=blankArticle();a.sections[0].body='word '.repeat(401);assert.equal(readingMinutes(a),3);
});

test('uploaded covers use separate private and public paths',()=>{
  const id='12345678-1234-1234-1234-123456789abc';
  assert.equal(coverPath('upload:'+id),'/api/v1/public/blog/cover/'+id);
  assert.equal(coverPath('upload:'+id,true),'/api/v1/staff/blog/cover/'+id);
  assert.equal(coverPath('upload:'+id+'\n'),null);
  assert.equal(coverPath('upload:../../private'),null);
});

import {legacyDocument,safeLink,wordCount,hasContent} from '../lib/rich-document.ts';
test('legacy article conversion preserves headings and line breaks',()=>{
  const d=legacyDocument([{heading:'Heading',body:'A first line\nSecond line\n\nNext paragraph'}]);
  assert.equal(d.content[0].attrs.level,2);
  assert.equal(d.content[1].content[1].type,'hardBreak');
  assert.equal(d.content[2].content[0].text,'Next paragraph');
  assert.equal(wordCount(d),8);assert.equal(hasContent(d),true);
  assert.equal(hasContent(legacyDocument([{heading:'',body:''}])),false);
});
test('rich links use a narrow URL allowlist',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','//example.com','/\\example.com','https://example.com\n','https://a:b@example.com','http:/example.com'])assert.equal(safeLink(url),false);
  assert.equal(safeLink('/blog/intro'),true);assert.equal(safeLink('https://example.com'),true);
});

import {metadataChecks,contentChecks} from '../lib/editorial-seo.ts';
test('SEO checks use actual metadata fallbacks and warn about missing cover alt',()=>{
  const f={...blankArticle(),title:'AI automation for your business',summary:'A short summary.',focusKeyword:'ai automation',cover:'web'};
  const checks=metadataChecks(f,'ai-automation');
  assert.equal(checks.find(x=>x.label.includes('phrase appears in title')).pass,true);
  assert.equal(checks.find(x=>x.label.includes('alt text')).pass,false);
  assert.equal(checks.find(x=>x.label.includes('Description is')).pass,false);
  assert.equal(metadataChecks({...f,coverAlt:'Architecture diagram'},'Bad Slug').find(x=>x.label.includes('URL')).pass,false);
});
test('SEO content checks detect skipped headings and safe relative internal links',()=>{
  const f={...blankArticle(),focusKeyword:'workflows',sections:[],document:{type:'doc',content:[{type:'heading',attrs:{level:3},content:[{type:'text',text:'Workflows'}]},{type:'paragraph',content:[{type:'text',text:'Contact',marks:[{type:'link',attrs:{href:'/#contact'}}]}]},{type:'studioImage',attrs:{alt:''}}]}};
  const checks=contentChecks(f);
  assert.equal(checks[0].pass,false);assert.equal(checks[1].pass,false);assert.equal(checks[2].pass,true);assert.equal(checks[3].pass,true);
});
