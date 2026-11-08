import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentCircleEntry } from './collision.ts';
const p=(x,y)=>({x,y});
test('entry follows circle boundaries rather than center projection',()=>{
  const start=p(0,0),end=p(100,0);
  assert.equal(segmentCircleEntry(start,end,p(60,0),40),.2);
  assert.equal(segmentCircleEntry(start,end,p(30,0),5),.25);
});
test('diagonal, tangent, start overlap, zero motion and nonfinite segments',()=>{
  assert.ok(Math.abs(segmentCircleEntry(p(0,0),p(100,100),p(50,50),10)-(.5-Math.SQRT1_2*.1))<1e-10);
  assert.equal(segmentCircleEntry(p(0,0),p(100,0),p(50,10),10),.5);
  assert.equal(segmentCircleEntry(p(0,0),p(0,0),p(1,0),2),0);
  assert.equal(segmentCircleEntry(p(0,0),p(0,0),p(10,0),2),null);
  assert.equal(segmentCircleEntry(p(0,0),p(100,0),p(-50,0),10),null);
  assert.equal(segmentCircleEntry(p(0,0),p(100,0),p(150,0),10),null);
  assert.equal(segmentCircleEntry(p(NaN,0),p(100,0),p(50,0),10),null);
  assert.equal(segmentCircleEntry(p(0,0),p(Infinity,0),p(50,0),10),null);
});
