import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptRun,activateDataset,readCsvFile} from './market_state.js';

test('late results cannot attach awards to a different day',()=>{
  const state={};activateDataset(state,{dataset_id:'day1',hours:[{index:0},{index:1}]});
  acceptRun(state,{dataset_id:'day1',hours:[{index:0,status:'complete',objective_dollars:410}]});
  assert.equal(state.results.get(0).objective_dollars,410);
  activateDataset(state,{dataset_id:'day2',hours:[{index:0}]});
  assert.equal(state.results.size,0);
  assert.equal(acceptRun(state,{dataset_id:'day1',hours:[{index:0,objective_dollars:999}]}),false);
  assert.equal(state.results.size,0);
});

test('CSV upload preserves UTF-8 BOM bytes and rejects corrupt encoding',async()=>{
  const bytes=new Uint8Array([239,187,191,65,44,66,10]);
  const text=await readCsvFile(new File([bytes],'valid.csv'));
  assert.deepEqual(new TextEncoder().encode(text),bytes);
  await assert.rejects(()=>readCsvFile(new File([new Uint8Array([255])],'bad.csv')),/UTF-8/);
});

test('day progress retains only matching valid interval results and errors',()=>{
  const state={};activateDataset(state,{dataset_id:'day',hours:[{index:0},{index:1}]});
  assert.equal(acceptRun(state,{dataset_id:'day',hours:[{index:0,status:'complete'},{index:1,status:'infeasible'}, {index:99,status:'complete'}]}),true);
  assert.equal(state.results.size,2);
  assert.equal(state.results.get(1).status,'infeasible');
});
import {acceptComparison} from './market_state.js';
test('comparison results require matching dataset, known hour and baseline',()=>{
 const state={dataset:{dataset_id:'a'},hourIndex:0,results:new Map([[0,{baseline_run_id:'r'}]]),comparisons:new Map()};
 assert.equal(acceptComparison(state,{dataset_id:'b',hour_index:0,baseline_run_id:'r'}),false);
 assert.equal(acceptComparison(state,{dataset_id:'a',hour_index:1,baseline_run_id:'r'}),false);
 assert.equal(acceptComparison(state,{dataset_id:'a',hour_index:0,baseline_run_id:'old'}),false);
 assert.equal(acceptComparison(state,{dataset_id:'a',hour_index:0,baseline_run_id:'r',status:'complete'}),true);
});
test('comparison completion is cached while a different hour is visible',()=>{
 const state={dataset:{dataset_id:'a'},hourIndex:1,results:new Map([[0,{baseline_run_id:'r'}]]),comparisons:new Map()};
 assert.equal(acceptComparison(state,{dataset_id:'a',hour_index:0,baseline_run_id:'r',status:'complete'}),true);
 assert.equal(state.comparisons.get(0).status,'complete');
});
