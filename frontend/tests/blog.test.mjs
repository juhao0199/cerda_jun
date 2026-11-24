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
