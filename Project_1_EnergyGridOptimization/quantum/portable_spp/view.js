const $=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'Unavailable';
function el(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function price(p){return !p?'No feasible sample':Number.isFinite(p.value)?fmt(p.value)+' $/MWh':p.range?`${fmt(p.range[0])} to ${fmt(p.range[1])} $/MWh`:p.status;}
export function showError(message){$('status').textContent='Run failed: '+message;}
export function render(result){
 $('status').textContent='COMPLETE / ONE BACKEND JOB / ACTUAL SPP SUBPROBLEM';$('price').textContent=fmt(result.source.full_auction_price);$('hour').textContent=result.source.cpt_end+' CPT / '+result.source.utc_end+' UTC';$('demand').textContent='Historical fixed demand: '+fmt(result.source.fixed_demand_mw)+' MW';
 $('reference').textContent=`Exact minimum: $${fmt(result.exact.objective_dollars)} across ${result.exact.unique_candidates} candidates. ${result.shots} candidate occurrences per method in this run. Exact enumeration always identifies the minimum.`;
 const cards=$('methods');cards.replaceChildren();
 for(const [key,title]of [['uniform','CLASSICAL RANDOM'],['one_bit','CLASSICAL ONE-BIT SEARCH'],['qaoa','QAOA']]){const m=result.methods[key],s=m.score,c=el('article');c.className='method';c.append(el('h3',title),el('strong',`${fmt(s.optimal_hit_rate*100)}% optimal hits`));for(const [label,value]of [['BEST NET COST',Number.isFinite(s.best_objective_dollars)?'$'+fmt(s.best_objective_dollars):'No feasible sample'],['COST GAP',Number.isFinite(s.best_gap_dollars)?'$'+fmt(s.best_gap_dollars):'Unavailable'],['FEASIBLE SAMPLES',fmt(s.observed_feasible_rate*100)+'%'],['CONDITIONAL PRICE',price(m.conditional_price)]]){const p=el('p');p.append(el('span',label),el('b',value));c.append(p);}cards.append(c);}
 const recorded=result.recorded_local;$('recorded').textContent=`Previously recorded local run: ${recorded.repeats} trials x ${recorded.shots} candidates; QAOA ${fmt(recorded.qaoa*100)}%, one-bit ${fmt(recorded.one_bit*100)}%, random ${fmt(recorded.uniform*100)}% optimal hits. All found the optimum in 5/5 trials. These are historical results, not the current backend run.`;
 $('timing').textContent=`Recorded table preparation: ${fmt(result.timing.preparation_seconds)} s; current tuning: ${fmt(result.timing.tuning_seconds)} s (${result.tuning.evaluations} evaluations, ${result.tuning.converged?'converged':'not converged'}); joint uniform/QAOA backend job: ${fmt(result.timing.joint_backend_seconds)} s; classical search: ${fmt(result.timing.classical_search_seconds)} s.`;
 $('disclosure').textContent=result.disclosure;
 drawGraph(result,result.resources[0].row_id);
}
function svg(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function drawGraph(result,selected){
 const root=$('graph');root.replaceChildren();root.setAttribute('viewBox','0 0 900 570');
 const current=result.methods.qaoa.resource_quantities;
 root.append(svg('rect',{x:375,y:235,width:150,height:90,fill:'#d2dfbf',stroke:'#356046'}),svg('text',{x:450,y:275,'text-anchor':'middle'},'ENERGY MARKET'),svg('text',{x:450,y:300,'text-anchor':'middle'},'SINGLE NODE'));
 let supply=0,withdrawal=0;
 for(const r of result.resources){const q=current?.[r.row_id]??r.baseline_mw;const left=r.side*q>=0;const x=left?15:650,y=70+(left?supply++:withdrawal++)*96;
  root.append(svg('path',{d:left?`M 245 ${y+30} L 375 280`:`M 525 280 L 650 ${y+30}`,stroke:'#536b53',fill:'none','stroke-width':2}));
  const g=svg('g',{class:'asset',role:'button',tabindex:0,'data-row-id':r.row_id,'aria-label':'Inspect '+r.rcode});g.append(svg('rect',{x,y,width:230,height:65,fill:r.row_id===selected?'#c6dbb7':'#eeeee1',stroke:r.row_id===selected?'#345b70':'#89947d','stroke-width':r.row_id===selected?3:1}),svg('text',{x:x+12,y:y+24},r.rcode+(r.balancer?' / BALANCE':'')),svg('text',{x:x+12,y:y+48},`${fmt(r.side*q)} MW net`));g.addEventListener('click',()=>drawGraph(result,r.row_id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();drawGraph(result,r.row_id);}});root.append(g);
 }
 root.append(svg('text',{x:20,y:32},'SELECTED SUPPLY'),svg('text',{x:650,y:32},'SELECTED WITHDRAWALS'),svg('text',{x:20,y:480},`Frozen supply: ${fmt(result.frozen.supply_mw)} MW`),svg('text',{x:520,y:480},`Frozen withdrawals: ${fmt(result.frozen.withdrawal_mw)} MW`),svg('text',{x:450,y:525,'text-anchor':'middle'},`Fixed demand: ${fmt(result.source.fixed_demand_mw)} MW`));
 const r=result.resources.find(x=>x.row_id===selected),box=$('inspector');box.replaceChildren();box.append(el('strong',r.rcode),el('p',r.row_id),el('p',r.balancer?'Continuous balancing submission':'Binary study dispatch choice'),el('p',`Classical baseline: ${fmt(r.baseline_mw)} MW`),el('p',`Live QAOA best: ${current?fmt(current[r.row_id]):'No feasible sample'} MW`));if(r.levels_mw)box.append(el('p',`Study levels: ${r.levels_mw.map(fmt).join(' / ')} MW`));box.append(el('p','Resource quantity is signed; net injection = side x quantity. The graph uses the best feasible QAOA candidate, or the recorded baseline if none was sampled.'));
}
