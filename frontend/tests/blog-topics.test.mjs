import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rankRelatedPosts, relatedSlugsFor, topicsFor} from '../lib/blog-topics.ts';

const published = JSON.parse(readFileSync(new URL('../content/articles.json', import.meta.url), 'utf8'));

test('published cards have unique useful topic labels', () => {
  for (const article of published) {
    const topics = topicsFor(article);
    assert.ok(topics.length >= 1, article.slug);
    assert.equal(topics.length, new Set(topics.map(topic => topic.toLowerCase())).size, article.slug);
  }
  assert.deepEqual(topicsFor({slug:'contact-form-delivery-setup',category:'Web'}), ['Contact forms','Email delivery','Reply-To']);
});

test('published taxonomy takes precedence and new posts can fall back to their category', () => {
  assert.deepEqual(topicsFor({slug:'website-launch-checklist',category:'Web',tags:['website launch',' Verification ']}), ['website launch','Verification','Quality assurance','Search indexing']);
  assert.deepEqual(topicsFor({slug:'constructor',category:'Automation'}), ['Automation']);
});

test('every bundled article has three distinct published recommendations', () => {
  const slugs = new Set(published.map(article => article.slug));
  for (const article of published) {
    const related = relatedSlugsFor(article.slug);
    assert.equal(related.length, 3, article.slug);
    assert.ok(related.every(slug => slug !== article.slug && slugs.has(slug)), article.slug);
  }
  assert.equal(relatedSlugsFor('website-launch-checklist')[0], 'contact-form-delivery-setup');
  assert.deepEqual(relatedSlugsFor('unknown', ['unknown', 'guide', 'guide']), ['guide']);
});

test('fallback recommendations favor a shared topic, then the current category', () => {
  const post = {slug: 'new', category: 'Web', tags: ['Email delivery']};
  const related = rankRelatedPosts(post, [
    post,
    {slug: 'unrelated', category: 'Software'},
    {slug: 'web-guide', category: ' web '},
    {slug: 'automation-guide', category: 'Automation', tags: ['email delivery']},
    {slug: 'web-email-guide', category: 'Web', tags: ['Email delivery']},
  ]);
  assert.deepEqual(related.map(article => article.slug), ['web-email-guide', 'automation-guide', 'web-guide']);
});
