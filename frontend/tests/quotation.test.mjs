import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewTotals} from '../components/quotations/pricing.ts';
test('quotation preview rounds each line then discount then tax',()=>assert.deepEqual(previewTotals([{quantity:'1.50',unitPrice:'10.01'},{quantity:'2',unitPrice:'50'}],'10','7'),{subtotal:'115.02',discountAmount:'11.50',taxAmount:'7.25',total:'110.77'}));
test('quotation preview rejects unsupported decimals and rates',()=>{for(const x of ['NaN','-1','1e2','1.001','101'])assert.equal(previewTotals([{quantity:'1',unitPrice:'10'}],x,'0'),null);assert.equal(previewTotals([{quantity:'0',unitPrice:'10'}],'0','0'),null);});
