const NS='http://www.w3.org/2000/svg';
export const format=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function node(tag,attrs={},label) {const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(label!==undefined)el.textContent=label;return el;}
function text(root,x,y,label,anchor='start') {root.append(node('text',{x,y,'text-anchor':anchor,class:'market-chart-text'},label));}
function line(root,x1,y1,x2,y2,cls='market-chart-axis') {root.append(node('line',{x1,y1,x2,y2,class:cls}));}
export function drawCurve(root,submission,award,modelPrice) {
  root.replaceChildren();const w=Math.max(root.clientWidth,280),h=Math.max(root.clientHeight,180);root.setAttribute('viewBox',`0 0 ${w} ${h}`);
  if(!submission){text(root,w/2,h/2,'SELECT A SOURCE SUBMISSION','middle');return;}
  let lo=submission.lower_mw,hi=submission.upper_mw;
  if(lo===hi){lo-=1;hi+=1;}
  const values=submission.points.map(p=>p[1]);if(Number.isFinite(modelPrice))values.push(modelPrice);
  let ymin=Math.min(...values),ymax=Math.max(...values);const pad=Math.max((ymax-ymin)*.1,1);ymin-=pad;ymax+=pad;
  const x=q=>58+(q-lo)/(hi-lo)*(w-80),y=p=>h-42-(p-ymin)/(ymax-ymin)*(h-72);
  for(const f of [0,.5,1]){const q=lo+(hi-lo)*f,p=ymin+(ymax-ymin)*f;line(root,58,y(p),w-22,y(p));text(root,52,y(p)+4,format(p,1),'end');text(root,x(q),h-23,format(q,1),'middle');}
  text(root,58,16,'MARGINAL PRICE · $/MWh');text(root,w/2,h-5,'RESOURCE QUANTITY · MW','middle');
  let path='';for(const [a,b,p,g]of submission.segments){path+=`${path?'L':'M'} ${x(a)} ${y(p)} L ${x(b)} ${y(p+g*(b-a))} `;}
  root.append(node('path',{d:path,class:'market-chart-source'}));
  for(const [q,p]of submission.points)root.append(node('circle',{cx:x(q),cy:y(p),r:3,fill:'#356046'}));
  if(Number.isFinite(modelPrice))line(root,58,y(modelPrice),w-22,y(modelPrice),'market-chart-reference');
  if(award){const q=award.quantity_mw,segment=submission.segments.find(([a,b])=>q>=a-1e-8&&q<=b+1e-8);const p=segment?segment[2]+segment[3]*(q-segment[0]):submission.points[0][1];line(root,x(q),30,x(q),h-42,'market-chart-award');root.append(node('circle',{cx:x(q),cy:y(p),r:5,fill:'#345b70'}));}
}
export function drawDaily(root,series,reference,selected) {
  root.replaceChildren();const w=Math.max(root.clientWidth,250),h=Math.max(root.clientHeight,65);root.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const values=[...series,...(reference||[])].filter(Number.isFinite);
  if(!values.length){text(root,w/2,h/2,'RUN AN HOUR TO SEE MODEL PRICES','middle');return;}
  let min=Math.min(...values),max=Math.max(...values);const pad=Math.max((max-min)*.12,1);min-=pad;max+=pad;
  const count=series.length,x=i=>55+i*(w-73)/Math.max(count-1,1),y=v=>h-18-(v-min)/(max-min)*(h-24);
  for(const f of [0,1]){const v=min+(max-min)*f;line(root,55,y(v),w-18,y(v));text(root,49,y(v)+3,format(v,0),'end');}
  const trace=(data,cls)=>{let path='',open=false;for(let i=0;i<data.length;i++){if(Number.isFinite(data[i])){path+=`${open?'L':'M'} ${x(i)} ${y(data[i])} `;open=true;}else open=false;}root.append(node('path',{d:path,class:cls}));};
  if(reference)trace(reference,'market-chart-reference');trace(series,'market-chart-source');
  for(let i=0;i<count;i++)if(count<=8||i%4===0||i===count-1)text(root,x(i),h-3,String(i+1).padStart(2,'0'),'middle');
  line(root,x(selected),4,x(selected),h-18,'market-chart-selected');
  if(Number.isFinite(series[selected]))root.append(node('circle',{cx:x(selected),cy:y(series[selected]),r:3,fill:'#345b70'}));
}

export function dispatchGroups(rows,awards,selected,limit=6) {
 const solved=awards!==null,byId=new Map((awards||[]).map(a=>[a.row_id,a]));
 const groups={solved,supply:{nodes:[],omittedCount:0,omittedMw:0},withdrawal:{nodes:[],omittedCount:0,omittedMw:0}};
 for(const row of rows){
  const award=byId.get(row.row_id);
  const net=solved?(award?.net_injection_mw||0):row.side*(Math.abs(row.lower_mw)>Math.abs(row.upper_mw)?row.lower_mw:row.upper_mw);
  if(Math.abs(net)<1e-7&&row.row_id!==selected)continue;
  groups[net>0||(Math.abs(net)<1e-7&&row.side===1)?'supply':'withdrawal'].nodes.push({row,net,mw:Math.abs(net)});
 }
 for(const group of [groups.supply,groups.withdrawal]){
  group.nodes.sort((a,b)=>b.mw-a.mw||a.row.row_id.localeCompare(b.row.row_id));
  const all=group.nodes,chosen=all.slice(0,limit),picked=all.find(n=>n.row.row_id===selected);
  if(picked&&!chosen.includes(picked)){chosen.pop();chosen.push(picked);}
  const ids=new Set(chosen.map(n=>n.row.row_id)),omitted=all.filter(n=>!ids.has(n.row.row_id));
  group.nodes=chosen;group.omittedCount=omitted.length;group.omittedMw=omitted.reduce((sum,n)=>sum+n.mw,0);
 }
 return groups;
}
export function drawDispatchGraph(root,rows,awards,selected,fixedDemand,onSelect) {
 root.replaceChildren();const w=Math.max(root.clientWidth,760),h=720;root.setAttribute('viewBox',`0 0 ${w} ${h}`);
 const groups=dispatchGroups(rows,awards,selected),cx=w/2,cy=350,boxW=Math.min(230,w*.26);
 const defs=node('defs');const marker=node('marker',{id:'transfer-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(node('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#536b53'}));defs.append(marker);root.append(defs);
 text(root,24,28,groups.solved?'SUPPLYING ENERGY':'OFFERED CAPACITY');text(root,w-24,28,groups.solved?'CONSUMING ENERGY':'WITHDRAWAL CAPACITY','end');
 const max=Math.max(1,...groups.supply.nodes.map(n=>n.mw),...groups.withdrawal.nodes.map(n=>n.mw));
 for(const [name,left] of [['supply',true],['withdrawal',false]]){
  const group=groups[name],x=left?18:w-boxW-18;
  group.nodes.forEach((item,i)=>{
   const y=58+i*87,edge=node('path',{d:left?`M ${x+boxW} ${y+29} Q ${cx-90} ${y+29} ${cx-65} ${cy}`:`M ${cx+65} ${cy} Q ${cx+90} ${y+29} ${x} ${y+29}`,fill:'none',stroke:'#536b53','stroke-width':groups.solved?1+5*item.mw/max:1.5,'stroke-dasharray':groups.solved?'':'5 5','marker-end':groups.solved?'url(#transfer-arrow)':''});root.append(edge);
   const g=node('g',{role:'button',tabindex:0,'aria-label':`Inspect ${item.row.rcode}, ${format(item.mw)} MW`,'aria-pressed':String(item.row.row_id===selected),'data-resource-id':item.row.row_id,class:'dispatch-node'});
   g.append(node('rect',{x,y,width:boxW,height:64,fill:item.row.row_id===selected?'#c6dbb7':'#eeeee1',stroke:item.row.row_id===selected?'#345b70':'#89947d','stroke-width':item.row.row_id===selected?3:1}));
   text(g,x+12,y+24,item.row.rcode);text(g,x+12,y+47,`${format(item.mw)} MW${groups.solved?'':' capacity'}`);
   g.addEventListener('click',()=>onSelect(item.row.row_id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(item.row.row_id);}});root.append(g);
  });
  if(group.omittedCount){text(root,x,622,`+ ${group.omittedCount.toLocaleString()} other submissions`);if(groups.solved)text(root,x,647,`${format(group.omittedMw)} MW combined`);}
 }
 const hub=node('g');hub.append(node('rect',{x:cx-69,y:cy-53,width:138,height:106,fill:'#d2dfbf',stroke:'#356046','stroke-width':2}));text(hub,cx,cy-16,'ENERGY','middle');text(hub,cx,cy+8,'MARKET','middle');text(hub,cx,cy+32,'SINGLE NODE','middle');root.append(hub);
 root.append(node('path',{d:`M ${cx} ${cy+53} L ${cx} 566`,stroke:'#345b70','stroke-width':3,'marker-end':'url(#transfer-arrow)','stroke-dasharray':groups.solved?'':'5 5'}));
 text(root,cx,594,'HISTORICAL FIXED DEMAND','middle');text(root,cx,620,`${format(fixedDemand)} MW`,'middle');
 text(root,cx,693,'SCHEMATIC TRANSFERS / NO TRANSMISSION TOPOLOGY','middle');
 if(!rows.length)text(root,cx,100,'LOADING RESOURCES','middle');
}
