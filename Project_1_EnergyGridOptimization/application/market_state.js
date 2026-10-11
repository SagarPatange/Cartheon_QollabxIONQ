export function activateDataset(state,dataset) {
  state.dataset=dataset;
  state.hourIndex=0;
  state.results=new Map();
  state.comparisons=new Map();
  state.hour=null;
  state.selected=null;
  state.page=0;
}
export function acceptRun(state,run) {
  if(run.kind==='comparison'||run.dataset_id!==state.dataset.dataset_id)return false;
  const indices=new Set(state.dataset.hours.map(h=>h.index));
  for(const hour of run.hours)if(indices.has(hour.index))state.results.set(hour.index,{...hour,baseline_run_id:run.run_id});
  return true;
}
export async function readCsvFile(file) {
  try {return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());}
  catch {throw new Error('CSV files must use valid UTF-8 encoding.');}
}

export function acceptComparison(state,record) {
  if(record.dataset_id!==state.dataset.dataset_id||record.baseline_run_id!==state.results.get(record.hour_index)?.baseline_run_id)return false;
  state.comparisons.set(record.hour_index,record);
  return true;
}
