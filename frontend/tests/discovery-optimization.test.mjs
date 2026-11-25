import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankArticle} from '../lib/blog-content.ts';
import {geoChecks,appendEvidence,optimizationConfig} from '../lib/discovery-optimization.ts';
const original=()=>({...blankArticle(),title:'Test',sections:[{heading:'Original',body:'Original body'}]});
test('GEO adds visible evidence without mutating previous article and metadata',()=>{
 const f=original(),next=appendEvidence(f,'Verified claim','Method and limitations','Source','https://example.com/docs');
 assert.equal(f.document,undefined);assert.equal(next.document.content.length,6);assert.equal(next.document.content[1].content[0].text,'Original body');assert.deepEqual(next.sections,[]);assert.equal(next.title,f.title);assert.equal(geoChecks(next).find(c=>c.label==='Evidence or methodology section').pass,true);assert.equal(geoChecks(next).find(c=>c.label==='Linked HTTPS references').pass,true);assert.equal(geoChecks({...next,noindex:true}).at(-1).pass,false);
});
test('GEO rejects unsafe reference and missing evidence; three distinct workspaces',()=>{
 for(const href of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','//example.com'])assert.throws(()=>appendEvidence(original(),'Claim','Context','Source',href));
 assert.throws(()=>appendEvidence(original(),'Claim',' ','Source','https://example.com'));
 assert.equal(new Set(Object.values(optimizationConfig).map(x=>x.editor)).size,3);
});
