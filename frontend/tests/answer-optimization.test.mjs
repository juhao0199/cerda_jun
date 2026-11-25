import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankArticle} from '../lib/blog-content.ts';
import {answerChecks,insertOpeningAnswer,appendQuestionAnswer,appendReference,nodeText} from '../lib/answer-optimization.ts';
const legacy=()=>({...blankArticle(),title:'AI',sections:[{heading:'Original',body:'Original body'}]});
test('AEO inserts visible answer and Q&A without mutating legacy or rich content',()=>{
  const original=legacy();const a=insertOpeningAnswer(original,'Automation can simplify repetitive work when rules are clearly defined.');const b=appendQuestionAnswer(a,'What is automation?','A way to execute repetitive tasks using defined rules.');
  assert.equal(original.document,undefined);assert.deepEqual(original.sections,[{heading:'Original',body:'Original body'}]);assert.deepEqual(b.sections,[]);assert.equal(b.document.content[0].type,'paragraph');assert.equal(nodeText(b.document.content[2]),'Original body');assert.equal(nodeText(b.document.content[3]),'What is automation?');assert.equal(a.document.content.length,3);assert.equal(answerChecks(b)[0].pass,true);assert.equal(answerChecks(b)[1].pass,true);
});
test('AEO reference requires user supplied safe HTTPS URL and checks are heuristic',()=>{
  const f=legacy();assert.throws(()=>appendReference(f,'Unsafe','javascript:alert(1)'));assert.throws(()=>appendReference(f,'Unsafe','https://user:pass@example.com'));assert.throws(()=>appendReference(f,'Insecure','http://example.com'));assert.throws(()=>appendQuestionAnswer(f,'Statement','Text'));assert.throws(()=>insertOpeningAnswer(f,' '));const next=appendReference(f,'Example documentation','https://example.com/docs');assert.equal(answerChecks(next).find(c=>c.label==='External HTTPS reference').pass,true);assert.equal(answerChecks({...next,noindex:true}).at(-1).pass,false);assert.equal(answerChecks(next).find(c=>c.label==='Explicit author attribution').pass,false);
});
