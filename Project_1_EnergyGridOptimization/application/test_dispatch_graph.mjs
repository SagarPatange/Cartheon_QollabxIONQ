import {strict as assert} from 'node:assert';
import {dispatchGroups} from './market_charts.js';
const rows=Array.from({length:20},(_,i)=>({row_id:String(i),rcode:'r'+i,side:1,lower_mw:0,upper_mw:i+1}));
const awards=rows.map((r,i)=>({row_id:r.row_id,net_injection_mw:i<10?i+1:-(i+1)}));
const groups=dispatchGroups(rows,awards,'0',6);
assert.equal(groups.supply.nodes.length,6);
assert(groups.supply.nodes.some(x=>x.row.row_id==='0'));
for(const [name,positive] of [['supply',true],['withdrawal',false]]){
 const expected=awards.filter(a=>positive?a.net_injection_mw>0:a.net_injection_mw<0).reduce((s,a)=>s+Math.abs(a.net_injection_mw),0);
 assert.equal(groups[name].nodes.reduce((s,n)=>s+n.mw,0)+groups[name].omittedMw,expected);
}
assert.equal(dispatchGroups(rows,null,null,6).solved,false);
assert.equal(dispatchGroups(rows,[],null,6).supply.nodes.length,0);
console.log('Dispatch subset, selected-node inclusion, and signed aggregate totals pass');

const idle=dispatchGroups(rows,[], '0',6);assert(idle.supply.nodes.some(n=>n.row.row_id==='0'&&n.mw===0));
