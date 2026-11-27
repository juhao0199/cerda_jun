import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {websiteGraph,safeJsonLd} from '../lib/website-schema.ts';
const defaults=JSON.parse(readFileSync(new URL('../lib/website-defaults.json',import.meta.url),'utf8'));
test('base graph is grounded in actual route and default copy',()=>{
  const g=websiteGraph(defaults,'https://example.com');
  assert.deepEqual(g['@graph'].map(n=>n['@type']),['Organization','WebSite','WebPage']);
  assert.equal(g['@graph'][0].description,defaults.copy.aboutIntro);
  assert.equal(g['@graph'][2].url,'https://example.com/');
});
test('optional schemas are grounded in the same public answers and solution copy',()=>{
  const g=websiteGraph({...defaults,faqSchema:true,serviceSchema:true},'https://example.com');
  assert.equal(g['@graph'].filter(n=>n['@type']==='Service').length,4);
  const faq=g['@graph'].find(n=>n['@type']==='FAQPage');
  assert.equal(faq.mainEntity.length,defaults.faq.length+defaults.guidance.length);
  assert.equal(faq.mainEntity[0].acceptedAnswer.text,defaults.faq[0].answer);
});
test('JSON-LD cannot break out of a script element',()=>{
  const encoded=safeJsonLd({text:'</script><script>test</script>'});
  assert.ok(!encoded.includes('<'));assert.equal(JSON.parse(encoded).text,'</script><script>test</script>');
});
