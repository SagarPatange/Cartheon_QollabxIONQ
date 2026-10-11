import {createState,editControls,selectHour,resetControls,displayStatus,loadConfiguration,runScenario} from './state.js';
import {renderNetwork,renderTrace,frame,format,unitName} from './diagram.js';

const $=id=>document.getElementById(id);
let config,state;
const fields={capacity_percent:['CAP','%', 'Maximum output'],ramp_percent:['RAMP','%', 'Normal ramp rate'],offer_percent:['OFFER','%', 'Energy offer price'],startup_dollars:['START','$/start','Startup cost'],no_load_dollars_per_hour:['IDLE','$/h','No-load cost']};
function element(tag,cls,text) {
  const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;
}
function numeric(parent,key,label,unit,description,value,domain,change) {
  const row=element('div','control-row'),name=element('label','',label),input=element('input');
  input.id=`control-${key}`;input.type='number';input.required=true;input.min=domain.min;input.max=domain.max;input.step='any';input.value=value;
  input.setAttribute('aria-label',`${description} (${unit})`);input.title=`${description}: ${domain.min}–${domain.max} ${unit}`;name.htmlFor=input.id;
  input.addEventListener('input',()=>{editControls(state,c=>change(c,input.valueAsNumber));render();});
  row.append(name,input,element('span','unit',unit));parent.append(row);
}
function toggle(parent,key,label,value,change) {
  const row=element('div','toggle-row'),name=element('label'),input=element('input');
  input.type='checkbox';input.id=`control-${key}`;input.checked=value;name.append(input,document.createTextNode(label));
  input.addEventListener('change',()=>{editControls(state,c=>change(c,input.checked));render();});row.append(name);parent.append(row);
}
function buildGlobalControls() {
  const root=$('global-controls');root.replaceChildren();
  for (const [key,label,description] of [['load_percent','LOAD','System demand'],['line_percent','LINES','Global line ratings'],['reserve_percent','RESERVE','Reserve requirement']]) {
    numeric(root,key,label,'%',description,state.controls[key],config.domains[key],(c,v)=>{c[key]=v;});
  }
  toggle(root,'reserves_enabled','RESERVE MODE',state.controls.reserves_enabled,(c,v)=>{c.reserves_enabled=v;});
}
function associatedUnit() {
  const asset=state.selected_asset;
  return config.base_case.units.find(u=>asset.type==='unit'?u.unit_id===asset.id:asset.type==='bus'&&u.node===asset.id);
}
function buildAssetControls() {
  const root=$('asset-controls');root.replaceChildren();
  const asset=state.selected_asset,unit=associatedUnit();
  if (unit) {
    root.append(element('p','asset-id',`${unit.unit_id} / BUS ${unit.node}`));
    toggle(root,'enabled','UNIT AVAILABLE',state.controls.units[unit.unit_id].enabled,(c,v)=>{c.units[unit.unit_id].enabled=v;});
    for (const [key,[label,suffix,description]] of Object.entries(fields)) {
      numeric(root,key,label,suffix,`${unitName(unit.unit_id)} ${description}`,state.controls.units[unit.unit_id][key],config.domains.units[key],(c,v)=>{c.units[unit.unit_id][key]=v;});
    }
  } else if (asset.type==='branch') {
    const branch=config.base_case.network.branches.find(b=>b.name===asset.id);
    const overridden=Object.hasOwn(state.controls.line_limits_mw,branch.name);
    numeric(root,'branch_limit','RATING','MW',`Line ${branch.name} rating override`,overridden?state.controls.line_limits_mw[branch.name]:branch.limit_mw*state.controls.line_percent/100,config.domains.line_limits_mw,(c,v)=>{c.line_limits_mw[branch.name]=v;updateOverrideNote();});
    root.append(element('p','control-note'));
    root.lastChild.id='override-note';
    const clear=element('button','small-button','USE GLOBAL LINE SCALE');clear.type='button';
    clear.addEventListener('click',()=>{editControls(state,c=>{delete c.line_limits_mw[branch.name];});buildAssetControls();render();});
    root.append(clear);updateOverrideNote();
  } else root.append(element('p','control-note','LOAD follows the system demand control.'));
}
function updateOverrideNote() {
  const note=$('override-note');if(!note)return;
  note.textContent=Object.hasOwn(state.controls.line_limits_mw,state.selected_asset.id)?'OVERRIDE / replaces global scaling':'GLOBAL / follows line scaling';
}
function selectAsset(type,id) {
  state.selected_asset={type,id};$('asset-select').value=`${type}:${id}`;buildAssetControls();render();
}
function renderReadings() {
  const root=$('asset-readings');root.replaceChildren();root.className='asset-readings';
  const asset=state.selected_asset,f=frame(config,state),h=state.selected_hour;
  const add=(label,value,units)=>{const row=element('div','reading');row.append(element('span','',label),element('span','',`${value} ${units}`));root.append(row);};
  $('asset-kind').textContent=asset.type.toUpperCase();
  if (asset.type==='branch') {
    const b=f.branches.find(b=>b.name===asset.id);
    add('FLOW',format(b.flow),'MW');add('SOLVED LIMIT',state.result?format(b.limit_mw):'—','MW');add('UTILIZATION',format(b.utilization===undefined?undefined:b.utilization*100,1),'%');
    add('DIRECTION',b.flow===undefined?'—':Math.abs(b.flow)<1e-6?'ZERO':b.flow>=0?`${b.from_bus} → ${b.to_bus}`:`${b.to_bus} → ${b.from_bus}`,'');
  } else if(asset.type==='bus') {
    const b=f.buses.find(b=>b.id===asset.id);add('LOAD',format(b.demand),'MW');add('MODEL PRICE',format(b.price,2),'$/MWh');
  }
  const unit=associatedUnit();
  if (unit) {
    const u=f.units.find(u=>u.unit_id===unit.unit_id);
    add('STATE',u.on===undefined?'—':u.on>.5?'ON':'OFF','');add('ENERGY',format(u.energy),'MW');
    add('RESERVE',state.result&&!state.result.reserves_enabled?'OFF':format(u.reserve),'MW');
    add('SOLVED CAP',state.result?format(u.maximum_mw[h]):'—','MW');
  }
}
function render() {
  const status=displayStatus(state),report=state.result;
  const stale=!!report && (state.result_revision!==state.input_revision || !!state.error);
  document.querySelector('.cabinet').classList.toggle('stale-display',stale);
  $('status').textContent=status;
  $('run').disabled=state.busy;$('run').textContent=state.busy?'■ SOLVING':'▶ RUN 24H';
  $('ready-lamp').className=`lamp ${status==='VERIFIED'||status==='READY'?'on':''}`;
  $('run-lamp').className=`lamp ${state.busy||status==='STALE'?'on amber':''}`;
  $('fault-lamp').className=`lamp ${state.error?'on red':''}`;
  $('input-revision').textContent=String(state.input_revision).padStart(2,'0');
  $('result-revision').textContent=report?String(state.result_revision).padStart(2,'0'):'—';
  $('result-state').textContent=report?(stale?'STALE RESULT':'CERTIFIED'):'NO RESULT';
  $('cost').textContent=format(report?.commitment.objective_dollars,2);
  $('bound').textContent=format(report?.commitment.objective_bound_dollars,2);
  $('gap').textContent=format(report?report.commitment.mip_gap*100:undefined,4);
  $('duration').textContent=format(report?.elapsed_seconds,2);
  $('fault-message').hidden=!state.error;
  $('fault-message').textContent=state.error?`FAULT / ${state.error}${report?' · Prior result is stale.':''}`:'';
  const hour=`HOUR ${String(state.selected_hour+1).padStart(2,'0')}`;
  $('hour-label').textContent=hour;$('network-hour').textContent=hour;
  $('hour').setAttribute('aria-valuetext',`${hour}, view only`);
  $('network-validity').textContent=report?(stale?'STALE / RE-RUN':'VERIFIED / FIXED COMMITMENT'):'AWAITING SOLVE';
  // Inputs are built only on selection/reset; polling and edits preserve their focus and text.
  const branchInput=$('control-branch_limit');
  if(branchInput && document.activeElement!==branchInput && !Object.hasOwn(state.controls.line_limits_mw,state.selected_asset.id)) {
    branchInput.value=config.base_case.network.branches.find(b=>b.name===state.selected_asset.id).limit_mw*state.controls.line_percent/100;
  }
  renderReadings();renderNetwork($('network'),config,state,selectAsset);renderTrace($('trace'),state);
  $('run-record').textContent=report?JSON.stringify({run_id:state.result_id,input_revision:state.input_revision,result_revision:state.result_revision,display:stale?'stale':'current',interval_end:report.mapping.interval_end[state.selected_hour],reserves_enabled:report.reserves_enabled,solver:report.commitment.solver,status:report.commitment.status,price_interpretation:report.conditional_pricing.price_interpretation,certificates:report.certificates},null,2):'No completed run.';
}
async function main() {
  config=await loadConfiguration();state=createState(config.default_controls);
  const interval=config.base_case.intervals[0];
  $('operating-day').textContent=String(interval.end || '—').slice(0,10);
  const select=$('asset-select');
  for (const [label,items] of [
    ['UNITS',config.base_case.units.map(u=>[`unit:${u.unit_id}`,`${unitName(u.unit_id)} / BUS ${u.node}`])],
    ['BUSES',config.base_case.network.buses.map(b=>[`bus:${b}`,`BUS ${String(b).padStart(2,'0')}`])],
    ['BRANCHES',config.base_case.network.branches.map(b=>[`branch:${b.name}`,`LINE ${b.name}`])]]) {
    const group=element('optgroup');group.label=label;
    for(const [value,label] of items) {const option=element('option','',label);option.value=value;group.append(option);}select.append(group);
  }
  select.value=`${state.selected_asset.type}:${state.selected_asset.id}`;
  select.addEventListener('change',()=>{const [type,id]=select.value.split(':');selectAsset(type,id);});
  $('hour').addEventListener('input',event=>{selectHour(state,event.target.value);render();});
  window.addEventListener('resize',()=>renderTrace($('trace'),state));
  $('reset').disabled=false;
  $('reset').addEventListener('click',()=>{resetControls(state,config.default_controls);buildGlobalControls();buildAssetControls();render();});
  $('run').addEventListener('click',()=>{
    if (!$('global-controls').reportValidity() || !$('asset-controls').reportValidity())return;
    runScenario(state,render);
  });
  for(const form of document.querySelectorAll('form'))form.addEventListener('submit',event=>event.preventDefault());
  buildGlobalControls();buildAssetControls();render();
}
main().catch(error=>{$('status').textContent='FAULT';$('fault-lamp').className='lamp on red';$('fault-message').hidden=false;$('fault-message').textContent=`CONFIGURATION FAULT / ${error.message}`;});
