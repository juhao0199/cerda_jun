import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyArticleEdition, applyPostEdition, applyWebsiteEdition} from '../lib/editorial-release.ts';
import {readingMinutes} from '../lib/blog-content.ts';

function read(name) {
  return JSON.parse(readFileSync(new URL(`../content/${name}.json`, import.meta.url), 'utf8'));
}
const original = read('website').fields;
const editor = read('editorial');
const articles = read('articles');

test('website supplements preserve newer published fields and indexing controls', () => {
  const current = structuredClone(original);
  current.homeTitle = 'New release from Website Studio';
  current.copy.heroIntro = 'Updated hero on the published website';
  current.faq = [{question:'Latest question',answer:'Latest published answer'}];
  current.homeNoindex = true;
  const next = applyWebsiteEdition(current, original, editor.website);
  assert.equal(next.homeTitle, current.homeTitle);
  assert.equal(next.copy.heroIntro, current.copy.heroIntro);
  assert.deepEqual(next.faq, current.faq);
  assert.equal(next.homeNoindex, true);
  assert.deepEqual(next.guidance, editor.website.guidance);
  assert.equal(next.blogDescription, editor.website.blogDescription);
  assert.equal(current.blogDescription, original.blogDescription);
  assert.deepEqual(applyWebsiteEdition(original, original, editor.website).faq, editor.website.faq);
});

test('article notes preserve the source and never override a newer public revision', () => {
  const source = articles.find(post => post.document);
  const notes = editor.insights[source.slug];
  const enhanced = applyArticleEdition(source, source, notes);
  assert.deepEqual(enhanced.document, source.document);
  assert.equal(enhanced.seoTitle, notes.seoTitle);
  assert.equal(enhanced.takeaway, notes.takeaway);
  const card = applyPostEdition(source, source, notes);
  assert.equal(card.summary, notes.summary);
  assert.equal(card.minutes, enhanced.minutes);
  assert.equal(card.minutes, readingMinutes(source, notes.sectionsToAppend));
  const live = {...source, modifiedAt:'2027-01-09T00:00:00Z', seoTitle:'Updated CMS title'};
  assert.equal(applyArticleEdition(live, source, notes), live);
  assert.equal(applyPostEdition(live, source, notes), live);
});
