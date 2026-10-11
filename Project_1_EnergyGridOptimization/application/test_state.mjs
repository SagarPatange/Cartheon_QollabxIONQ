import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, editControls, selectHour, resetControls, beginRun, receiveRun, failRun, displayStatus} from './state.js';

const defaults = {load_percent:100, units:{base:{enabled:true}},line_limits_mw:{}};
const report = {status:'complete', commitment:{objective_dollars:321}};
const finish = (state,id='first') => receiveRun(state,{run_id:id,revision:state.active.revision,status:'complete',data:report});
test('edits during polling keep the completed result stale',()=>{
 const s=createState(defaults); beginRun(s); receiveRun(s,{run_id:'first',revision:0,status:'queued'});
 editControls(s,c=>{c.load_percent=120}); finish(s);
 assert.equal(s.result_revision,0); assert.equal(s.input_revision,1); assert.equal(displayStatus(s),'STALE');
 assert.equal(s.result.commitment.objective_dollars,321); assert.equal(s.busy,false);
});
test('hour changes preserve current results and do not revise inputs',()=>{
 const s=createState(defaults); beginRun(s); finish(s); selectHour(s,17);
 assert.equal(s.selected_hour,17); assert.equal(s.input_revision,0); assert.equal(displayStatus(s),'VERIFIED');
});
test('reset during a run discards its late result and prevents duplicates until it finishes',()=>{
 const s=createState(defaults); beginRun(s); editControls(s,c=>{c.units.base.enabled=false}); resetControls(s,defaults);
 assert.equal(beginRun(s),null); finish(s);
 assert.equal(s.result,null); assert.equal(s.busy,false); assert.equal(s.controls.units.base.enabled,true);
 assert.equal(displayStatus(s),'READY'); assert.equal(s.input_revision,2);
});
test('reset after completion preserves prior results explicitly stale',()=>{
 const s=createState(defaults); beginRun(s); finish(s); resetControls(s,defaults);
 assert.equal(displayStatus(s),'STALE'); assert.equal(s.result_revision,0); assert.equal(s.input_revision,1);
});
test('infeasible run keeps prior report and fault status',()=>{
 const s=createState(defaults); beginRun(s); finish(s); editControls(s,c=>{c.load_percent=200}); beginRun(s);
 receiveRun(s,{run_id:'second',revision:1,status:'infeasible',error:'Insufficient capacity'});
 assert.equal(displayStatus(s),'FAULT'); assert.equal(s.result.commitment.objective_dollars,321);
 assert.equal(s.result_revision,0); assert.equal(s.error,'Insufficient capacity');
});
test('a mismatched id or revision cannot finish another active run',()=>{
 const s=createState(defaults); beginRun(s); receiveRun(s,{run_id:'first',revision:0,status:'running'});
 receiveRun(s,{run_id:'other',revision:0,status:'complete',data:report});
 receiveRun(s,{run_id:'first',revision:3,status:'complete',data:report});
 assert.equal(s.busy,true); assert.equal(s.result,null); finish(s); assert.equal(displayStatus(s),'VERIFIED');
});
test('a request snapshot cannot be mutated by later edits; faults mark old results stale',()=>{
 const s=createState(defaults); beginRun(s); finish(s); const request=beginRun(s);
 editControls(s,c=>{c.units.base.enabled=false});
 assert.equal(request.controls.units.base.enabled,true); assert.equal(defaults.units.base.enabled,true);
 failRun(s,'Connection lost'); assert.equal(displayStatus(s),'FAULT'); assert.equal(s.busy,false);
});
