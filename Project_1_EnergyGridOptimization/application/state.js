const copy = value => structuredClone(value);

export function createState(defaults) {
  return {controls:copy(defaults), input_revision:0, result_revision:null,
    selected_hour:0, selected_asset:{type:'unit',id:Object.keys(defaults.units)[0]},
    result:null, result_id:null, busy:false, active:null, error:null};
}
export function editControls(state, edit) {
  edit(state.controls);
  state.input_revision++;
  state.error=null;
}
export function selectHour(state, hour) { state.selected_hour=Number(hour); }
export function resetControls(state, defaults) {
  state.controls=copy(defaults);
  state.input_revision++;
  state.error=null;
  if (state.active) state.active.discard=true;
}
export function beginRun(state) {
  if (state.busy) return null;
  state.busy=true;
  state.error=null;
  state.active={id:null,revision:state.input_revision,discard:false};
  return {controls:copy(state.controls),revision:state.input_revision};
}
export function receiveRun(state, response) {
  const active=state.active;
  if (!active || response.revision!==active.revision || (active.id && response.run_id!==active.id)) return;
  active.id=response.run_id;
  if (response.status==='queued' || response.status==='running') return;
  if (!active.discard) {
    if (response.status==='complete' && response.data?.status==='complete') {
      state.result=response.data;
      state.result_id=response.run_id;
      state.result_revision=response.revision;
    } else state.error=response.error || 'Run did not return a certified result';
  }
  state.busy=false;
  state.active=null;
}
export function failRun(state, error) {
  if (!state.active?.discard) state.error=error;
  state.busy=false;
  state.active=null;
}
export function displayStatus(state) {
  if (state.busy) return 'RUNNING';
  if (state.error) return 'FAULT';
  if (!state.result) return 'READY';
  return state.result_revision===state.input_revision ? 'VERIFIED' : 'STALE';
}

async function request(url, options) {
  const response=await fetch(url, options);
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
export async function loadConfiguration() { return request('/api/config'); }
export async function runScenario(state, render) {
  const payload=beginRun(state);
  if (!payload) return;
  render();
  try {
    let response=await request('/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const runId=response.run_id;
    receiveRun(state,response); render();
    while (state.busy) {
      await new Promise(resolve=>setTimeout(resolve,500));
      response=await request(`/api/runs/${encodeURIComponent(runId)}`);
      receiveRun(state,response); render();
    }
  } catch (error) { failRun(state,error.message); render(); }
}
