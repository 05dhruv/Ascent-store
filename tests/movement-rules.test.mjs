import test from 'node:test';
import assert from 'node:assert/strict';
import { quantity, receiptQuantities, requestSignature, splitReceipt, transferPrices, transferState } from '../src/lib/movementRules.mjs';
import { parseMovementFilters } from '../src/lib/movementReportFilters.mjs';

test('SOP 95 dispatched, 93 usable, 1 damaged and 1 short conserves quantity',()=>{
  const c=receiptQuantities({received:94,accepted:93,damaged:1,rejected:0,short:1,excess:0},95);
  assert.equal(c.settled,95);
  assert.equal(transferState([{dispatched_qty:95,received_qty:94,short_qty:1,excess_qty:0}],2),'under_dispute');
  assert.equal(transferState([{dispatched_qty:95,received_qty:94,short_qty:1,excess_qty:0}],0),'closed');
});
test('partial receipt leaves balance outstanding, not a declared shortage',()=>{
  assert.equal(receiptQuantities({received:40,accepted:40,damaged:0,rejected:0,short:0,excess:0},95).settled,40);
  assert.equal(transferState([{dispatched_qty:95,received_qty:40,short_qty:0,excess_qty:0}],0),'partially_received');
});
test('reject inconsistent counts, overreceipt, invalid numbers and unsupported precision',()=>{
  assert.throws(()=>receiptQuantities({received:5,accepted:4,damaged:0,rejected:0,short:0,excess:0},5));
  assert.throws(()=>receiptQuantities({received:6,accepted:6,damaged:0,rejected:0,short:0,excess:0},5));
  for(const value of [-1,NaN,Infinity,'invalid','',null,undefined,{},[],0.0001]) assert.throws(()=>quantity(value));
});
test('replayed requests are stable regardless of JSON object property order',()=>{
  assert.equal(requestSignature({action:'receive',requestKey:'first',items:[{id:1,received:2}],remarks:'ok'}),
    requestSignature({remarks:'ok',items:[{received:2,id:1}],requestKey:'second',action:'receive'}));
  assert.notEqual(requestSignature({action:'receive',items:[{id:1,received:2}]}),requestSignature({action:'receive',items:[{id:1,received:3}]}));
});
test('transferred batches retain valid source pricing when the line price is missing',()=>{
  assert.deepEqual(transferPrices({cost_price:10,mrp:0,destination_mrp:0,selling_price:0},{costPrice:11,mrp:15,sellingPrice:13}),
    {costPrice:11,mrp:15,sellingPrice:13});
});
test('movement report filters reject invalid IDs and reversed dates',()=>{
  const params=new URLSearchParams('store=5&project=7&from=2026-09-01&to=2026-09-11&search=cement');
  assert.deepEqual(parseMovementFilters(params),{store:5,project:7,from:'2026-09-01',to:'2026-09-11',search:'cement'});
  for(const value of ['store=0','store=2.1','store=x','from=2026-02-30','from=2026-09-12&to=2026-09-11']) assert.throws(()=>parseMovementFilters(new URLSearchParams(value)));
});
test('approved excess has a consistent settlement equation',()=>{
  assert.equal(receiptQuantities({received:102,accepted:100,damaged:2,rejected:0,short:0,excess:2},100).settled,100);
});
test('successive receipts preserve allocation batch identity',()=>{
  const batches=[{batchId:1,qty:30},{batchId:2,qty:65}];
  assert.deepEqual(splitReceipt(batches,40),[{batchId:1,qty:30},{batchId:2,qty:10}]);
  assert.deepEqual(splitReceipt(batches,54,40),[{batchId:2,qty:54}]);
  assert.throws(()=>splitReceipt(batches,56,40));
});
test('fractional material quantities reconcile at three decimals',()=>{
  assert.equal(receiptQuantities({received:0.3,accepted:0.1,damaged:0.2,rejected:0,short:0,excess:0},0.3).settled,0.3);
  assert.deepEqual(splitReceipt([{qty:0.1},{qty:0.2}],0.3),[{qty:0.1},{qty:0.2}]);
});
