import assert from 'node:assert/strict';
import { parseQuery, loadQueries, saveQuery } from '../src/query.js';
import { diffAgainst } from '../src/compare.js';
import { treemap } from '../src/layout.js';
import { validateModel } from '../src/model.js';

let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
const b = { id: 'a', name: 'Widget', file: 'src/widget.ts', language: 'typescript', kind: 'class', district: 'src', nom: 4, noa: 2, loc: 100, deps: 0 };
test('query fields, aliases, bare words and AND', () => {
  assert.ok(parseQuery('type:class lang:ts file:widget ext:ts district:src nom>=4 noa<=2 loc=100 deps:0 Widget').test(b));
  assert.ok(!parseQuery('loc>100').test(b));
  assert.ok(parseQuery('').empty);
  assert.ok(parseQuery('lang:tsx').test({...b, language: 'tsx'}));
});
test('all numeric query operators', () => {
  for (const q of ['nom>3', 'nom>=4', 'nom<5', 'nom<=4', 'nom=4', 'nom:4']) assert.ok(parseQuery(q).test(b));
});
const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) };
test('saved queries handle special names and corrupt storage', () => {
  saveQuery('__proto__', 'loc>10');
  assert.equal(loadQueries().__proto__, 'loc>10');
  for (const value of ['null', '[]', 'broken', '2']) { storage.set('codecity.queries', value); assert.deepEqual(loadQueries(), {}); }
});
test('unavailable browser storage does not crash', () => {
  globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.deepEqual(loadQueries(), {});
  assert.equal(saveQuery('test', 'loc>3'), null);
});
test('comparison accounts for new, changed and deleted LOC', () => {
  const diff = diffAgainst({buildings: [{id:'a',loc:10}, {id:'b',loc:7}]}, {buildings:[{id:'a',loc:8}, {id:'c',loc:4}]});
  assert.deepEqual(diff.stats, {added:1, changed:1, removed:1, locDelta:5});
});
test('invalid baselines are rejected', () => {
  for (const value of [null, {}, {buildings:[{id:'a',loc:-1}]}, {buildings:[{id:'a',loc:1},{id:'a',loc:2}]}]) assert.throws(() => diffAgainst({buildings:[]}, value));
});
test('treemap preserves area, bounds, identity and non-overlap', () => {
  const items = Array.from({length:80}, (_, i) => ({value:1 + i % 13, id:i}));
  const result = treemap(items, {x:2,y:3,w:100,h:70});
  const total = items.reduce((s, b) => s + b.value, 0);
  assert.equal(result.length, items.length);
  for (const {item, rect:r} of result) {
    assert.ok([r.x,r.y,r.w,r.h].every(Number.isFinite));
    assert.ok(r.x >= 2-1e-8 && r.y >= 3-1e-8 && r.x+r.w <= 102+1e-8 && r.y+r.h <= 73+1e-8);
    assert.ok(Math.abs(r.w*r.h - 7000*item.value/total) < 1e-7);
  }
  for (let i=0;i<result.length;i++) for(let j=i+1;j<result.length;j++) {
    const a=result[i].rect, b=result[j].rect;
    assert.ok(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x) < 1e-7 || Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y) < 1e-7);
  }
  assert.deepEqual(treemap([{value:0}], {x:0,y:0,w:10,h:10}), []);
});
test('malformed models report a useful error', () => {
  assert.throws(() => validateModel({}), /Invalid city model/);
  const model = {meta:{totals:{buildings:0,districts:0,roads:0,loc:0}},buildings:[],districts:[],roads:[]};
  assert.equal(validateModel(model), model);
  assert.throws(() => validateModel({...model,roads:[{a:'ghost',b:'other',weight:1}]}), /invalid road/);
});
console.log(`${passed} frontend unit tests passed`);
