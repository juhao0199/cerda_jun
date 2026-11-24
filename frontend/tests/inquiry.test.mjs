import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateInquiry,inquiryPayload} from '../lib/inquiry.ts';
const valid=()=>({requestId:randomUUID(),name:' Test ',email:' TEST@example.com ',company:'',overview:' A website for our business. ',discovery:null,consent:true,website:''});
test('normalizes data',()=>{const r=validateInquiry(valid());assert.equal(r.ok,true);assert.equal(r.data.email,'test@example.com');assert.equal(r.data.name,'Test');});
test('rejects invalid fields, no consent and bot trap',()=>{for(const change of [{email:'bad'},{consent:false},{website:'spam'},{requestId:'invalid'},{overview:'short'},{discovery:{}}])assert.equal(validateInquiry({...valid(),...change}).ok,false);});
test('server computes estimate and ignores client supplied price',()=>{const r=validateInquiry({...valid(),estimate:{low:1},discovery:{type:'website',goal:'design',stage:'ready',features:['cms']}});assert.equal(r.ok,true);assert.equal(inquiryPayload(r.data).estimate.low,900);});
test('rejects incompatible or duplicate features',()=>{for(const features of [['dashboard'],['cms','cms']])assert.equal(validateInquiry({...valid(),discovery:{type:'website',goal:'design',stage:'ready',features}}).ok,false);});
