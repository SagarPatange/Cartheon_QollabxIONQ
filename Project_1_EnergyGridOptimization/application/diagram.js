const NS='http://www.w3.org/2000/svg';
export const format=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
export const unitName=id=>id.replace('test_','').toUpperCase();
function svg(tag,attrs={},text) {
  const node=document.createElementNS(NS,tag);
  for (const [name,value] of Object.entries(attrs)) node.setAttribute(name,value);
  if (text!==undefined) node.textContent=text;
  return node;
}
function text(parent,x,y,label,cls,anchor='start') { parent.append(svg('text',{x,y,class:cls,'text-anchor':anchor},label)); }
function selectable(group,type,id,state,onSelect,label) {
  group.classList.add('asset');
  group.classList.toggle('selected',state.selected_asset.type===type && state.selected_asset.id===id);
  group.setAttribute('tabindex','0');group.setAttribute('role','button');
  group.setAttribute('aria-label',label);group.setAttribute('aria-pressed',String(state.selected_asset.type===type && state.selected_asset.id===id));
  group.dataset.asset=`${type}:${id}`;
  group.addEventListener('click',()=>onSelect(type,id));
  group.addEventListener('keydown',event=>{if (event.key==='Enter'||event.key===' ') {event.preventDefault();onSelect(type,id);}});
}
export function frame(config,state) {
  const report=state.result, h=state.selected_hour;
  const scenario=report?.scenario || config.base_case;
  const prices=report?.conditional_pricing;
  const mapping=report?.mapping;
  return {
    scenario,
    branches:scenario.network.branches.map(b=>{
      const f=prices?.flows_mw[h][mapping.branch_names.indexOf(b.name)];
      return {...b,flow:f,utilization:f===undefined?undefined:Math.abs(f)/b.limit_mw};
    }),
    buses:scenario.network.buses.map(id=>({id,
      demand:report?scenario.intervals[h].demand_mw[scenario.network.buses.indexOf(id)]:undefined,
      price:prices?.nodal_prices[h][mapping.bus_ids.indexOf(id)]})),
    units:scenario.units.map(u=>{
      const i=mapping?.unit_ids.indexOf(u.unit_id);
      return {...u,energy:prices?.unit_generation_mw[h][i],on:prices?.on[h][i],
        reserve:report?.reserves_enabled?prices.reserve_mw[h][i]:undefined};
    }),
  };
}
export function renderNetwork(root,config,state,onSelect) {
  const focusKey=root.contains(document.activeElement)?document.activeElement.dataset.asset:null;
  root.replaceChildren();
  const f=frame(config,state), coords=config.display.bus_coordinates;
  const defs=svg('defs');
  for (const [name,color] of [['flow','#536d49'],['high','#977125']]) {
    const marker=svg('marker',{id:`arrow-${name}`,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
    marker.append(svg('path',{d:'M 0 1 L 9 5 L 0 9 Z',fill:color}));defs.append(marker);
  }
  root.append(defs);
  for (const b of f.branches) {
    const a=coords[b.from_bus],z=coords[b.to_bus],g=svg('g');
    const high=b.utilization>=.9, width=b.flow===undefined?2:2+4*Math.min(b.utilization,1);
    const path=`M ${a.x} ${a.y} L ${z.x} ${z.y}`;
    g.append(svg('path',{d:path,class:`wire ${b.flow===undefined?'unsolved':''} ${high?'high':''}`,'stroke-width':width}));
    if (b.flow!==undefined && Math.abs(b.flow)>1e-6) {
      const dx=z.x-a.x,dy=z.y-a.y,sign=b.flow>0?1:-1;
      const start=.48-sign*.045,end=.48+sign*.045;
      g.append(svg('path',{d:`M ${a.x+dx*start} ${a.y+dy*start} L ${a.x+dx*end} ${a.y+dy*end}`,class:`wire ${high?'high':''}`,'stroke-width':width,'marker-end':`url(#arrow-${high?'high':'flow'})`}));
    }
    g.append(svg('path',{d:path,class:'wire-hit'}));
    const x=(a.x+z.x)/2,y=(a.y+z.y)/2;
    const vertical=a.x===z.x;
    text(g,x+(vertical?17:0),y-12,b.name,'branch-label',vertical?'start':'middle');
    text(g,x+(vertical?17:0),y+21,`${format(b.flow)} MW · ${format(b.utilization===undefined?undefined:100*b.utilization,0)}%`,'branch-label branch-flow',vertical?'start':'middle');
    selectable(g,'branch',b.name,state,onSelect,`Line ${b.name}, flow ${format(b.flow)} MW, utilization ${format(b.utilization===undefined?undefined:100*b.utilization,0)} percent`);
    root.append(g);
  }
  for (const b of f.buses) {
    const {x,y}=coords[b.id],g=svg('g');
    g.append(svg('rect',{x:x-18,y:y-17,width:36,height:34,class:'selection'}));
    g.append(svg('path',{d:`M ${x-13} ${y} L ${x+13} ${y}`,class:'bus-bar'}));
    g.append(svg('rect',{x:x-25,y:y-24,width:50,height:48,class:'bus-hit'}));
    // Demand instruments stay inside the ring; terminal buses use the outer edge.
    const label={1:[x-20,y+36,'start'],2:[x+65,y-15,'start'],3:[x-15,y+49,'end'],4:[x-22,y-70,'end'],5:[x-15,y+35,'end'],6:[x-15,y+35,'end'],7:[x-26,y-31,'end'],8:[x-27,y+36,'end'],9:[x-80,y-20,'end']}[b.id];
    const [tx,ty,anchor]=label;
    text(g,tx,ty,`BUS ${b.id.padStart(2,'0')}`,'bus-label',anchor);
    text(g,tx,ty+19,`${format(b.demand)} MW`,'bus-data',anchor);
    text(g,tx,ty+36,`${format(b.price)} $/MWh`,'bus-data',anchor);
    selectable(g,'bus',b.id,state,onSelect,`Bus ${b.id}, load ${format(b.demand)} MW, conditional price ${format(b.price)} dollars per MWh`);
    root.append(g);
  }
  const unitPositions={test_base:{x:80,y:210},test_mid:{x:910,y:480},test_peak:{x:890,y:300},test_local:{x:360,y:25}};
  for (const u of f.units) {
    const p=unitPositions[u.unit_id],bus=coords[u.node],g=svg('g');
    g.append(svg('path',{d:`M ${bus.x} ${bus.y} L ${p.x} ${p.y}`,class:'unit-connector'}));
    g.append(svg('rect',{x:p.x-57,y:p.y-46,width:114,height:110,class:'selection'}));
    g.append(svg('circle',{cx:p.x,cy:p.y,r:20,class:`unit-symbol ${u.on>.5?'online':''}`}));
    text(g,p.x,p.y+6,'~','bus-label','middle');
    text(g,p.x,p.y-30,unitName(u.unit_id),'unit-label','middle');
    text(g,p.x,p.y+39,u.on===undefined?'— MW':`${u.on>.5?'ON':'OFF'} ${format(u.energy)} MW`,'unit-data','middle');
    text(g,p.x,p.y+57,state.result&&!state.result.reserves_enabled?'R OFF':`R ${format(u.reserve)} MW`,'unit-data','middle');
    selectable(g,'unit',u.unit_id,state,onSelect,`${unitName(u.unit_id)} unit, ${u.on===undefined?'unsolved':u.on>.5?'on':'off'}, energy ${format(u.energy)} MW`);
    root.append(g);
  }
  if (focusKey) [...root.querySelectorAll('[data-asset]')].find(el=>el.dataset.asset===focusKey)?.focus({preventScroll:true});
}
export function renderTrace(root,state) {
  root.replaceChildren();
  const width=Math.max(root.clientWidth,320);
  const height=Math.max(root.clientHeight,56), bottom=height-22;
  root.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const p=state.result?.conditional_pricing;
  const energy=p?.unit_generation_mw.map(row=>row.reduce((a,b)=>a+b,0));
  const reserve=state.result?.reserves_enabled?p.reserve_mw.map(row=>row.reduce((a,b)=>a+b,0)):null;
  const max=energy?Math.ceil(Math.max(...energy,...(reserve||[0]),1)/50)*50:200;
  const x=h=>48+h*(width-76)/23,y=v=>bottom-v/max*(bottom-8);
  for (const fraction of [0,.5,1]) {
    root.append(svg('line',{x1:48,y1:y(max*fraction),x2:width-28,y2:y(max*fraction),class:'trace-grid'}));
    text(root,38,y(max*fraction)+4,energy?format(max*fraction,0):'—','trace-text','end');
  }
  for (let h=0;h<24;h++) {
    if(width>=650 || [0,5,11,17,23].includes(h))text(root,x(h),height-4,String(h+1).padStart(2,'0'),'trace-text','middle');
  }
  if (energy) {
    const path=values=>values.map((v,h)=>`${h===0?'M':'L'} ${x(h)} ${y(v)}`).join(' ');
    root.append(svg('path',{d:path(energy),class:'trace-energy'}));
    if (reserve) root.append(svg('path',{d:path(reserve),class:'trace-reserve'}));
    root.append(svg('circle',{cx:x(state.selected_hour),cy:y(energy[state.selected_hour]),r:4,fill:'#345b70'}));
  } else text(root,width/2,height/2,width<650?'AWAITING SOLVE':'AWAITING CERTIFIED DISPATCH','trace-empty','middle');
  root.append(svg('line',{x1:x(state.selected_hour),x2:x(state.selected_hour),y1:8,y2:bottom+3,class:'trace-cursor'}));
}
