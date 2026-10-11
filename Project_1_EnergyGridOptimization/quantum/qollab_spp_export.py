"""Package the certified actual-SPP table and visual Qollab replay."""
import inspect
import json
from pathlib import Path
import shutil
import zipfile
from application.market_data import DatasetStore
from optimizer.energy_auction import PROJECT
from quantum.benchmark import one_bit_counts
from quantum.qollab_export import ENTRY

def export_spp_package(output_dir=None,report_path=None):
    folder=Path(output_dir or PROJECT/'results/quantum-export/spp-upload').resolve()
    if not folder.is_relative_to(PROJECT.resolve()):raise ValueError('Package must stay inside project')
    report_path=Path(report_path or PROJECT/'results/spp-qaoa-development/spp-trial.json').resolve()
    if not report_path.is_relative_to(PROJECT.resolve()):raise ValueError('Report must stay inside project')
    report=json.loads(report_path.read_text(encoding='utf-8'))
    if report.get('kind')!='comparison' or report['status']!='complete':raise ValueError('Require completed SPP comparison report')
    artifacts=(PROJECT/'results/market-runs'/report['run_id']).resolve()
    if not artifacts.is_relative_to((PROJECT/'results/market-runs').resolve()):raise ValueError('Invalid run path')
    oracle=json.loads((artifacts/'oracle.json').read_text(encoding='utf-8'))
    provenance=json.loads((artifacts/'provenance.json').read_text(encoding='utf-8'))
    store=DatasetStore()
    if store.describe(store.default_id)['sha256']!=provenance['dataset']['sha256']:
        raise ValueError('Current default SPP sources do not match this report')
    curves=store.curves(store.default_id,report['hour_index'])
    if [c.row_id for c in curves]!=oracle['source_rows']:raise ValueError('Oracle source rows do not match')
    if report['result']['exact']['objective_dollars']!=oracle['best_objective_dollars']:raise ValueError('Result and oracle optima differ')
    row_index={c.row_id:i for i,c in enumerate(curves)}
    if oracle['n_bits']!=4:raise ValueError('This joint replay requires four decisions')
    decisions={d['row_id']:d for d in oracle['decisions']}
    ids=[d['row_id'] for d in oracle['decisions']]+[oracle['balancing_row_id']]
    selected=set(ids)
    resources=[]
    for row_id in ids:
        i=row_index[row_id];c=curves[i]
        resource=dict(row_id=row_id,rcode=c.rcode,side=c.side,baseline_mw=oracle['baseline_quantities'][i],balancer=row_id==oracle['balancing_row_id'])
        if row_id in decisions:resource['levels_mw']=decisions[row_id]['levels_mw']
        resources.append(resource)
    frozen_net=[c.side*q for c,q in zip(curves,oracle['baseline_quantities']) if c.row_id not in selected]
    reduced={k:oracle[k] for k in ['n_bits','costs','optimal_indices','best_objective_dollars','penalty_dollars','timing']}
    reduced['entries']=[dict(index=e['index'],bitstring=e['bitstring'],feasible=e['feasible'],objective_dollars=e['objective_dollars'],conditional_price=e['conditional_price'],verification=e['verification'],resource_quantities={row:e['quantities'][row_index[row]] for row in ids}) for e in oracle['entries']]
    hour=provenance['dataset']['hours'][report['hour_index']]
    reduced['source']=dict(operating_day=provenance['dataset']['operating_day'],utc_end=report['utc_end'],cpt_end=hour['cpt_end'],fixed_demand_mw=hour['fixed_demand_mw'],full_auction_price=report['result']['full_auction_reference']['model_price_dollars_per_mwh'],full_auction_cost=report['result']['full_auction_reference']['objective_dollars'],sha256=provenance['dataset']['sha256'],encoding='spp-dispatch-v2',selection_rule=oracle['selection_rule'])
    reduced['resources']=resources
    reduced['frozen']=dict(count=oracle['frozen_count'],supply_mw=sum(max(n,0) for n in frozen_net),withdrawal_mw=-sum(min(n,0) for n in frozen_net))
    methods=report['result']['methods'];settings=report['result']['settings']
    reduced['recorded_local']=dict(repeats=settings['repeats'],shots=settings['shots'],**{name:methods[name]['optimal_hit_rate'] for name in ['qaoa','one_bit','uniform']})
    (folder/'data').mkdir(parents=True,exist_ok=True);(folder/'portable').mkdir(exist_ok=True);(folder/'quantum').mkdir(exist_ok=True)
    (folder/'data/spp_oracle.json').write_text(json.dumps(reduced,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    templates=PROJECT/'quantum/portable_spp'
    for name in ['index.html','main.js','main.css','view.js']:shutil.copyfile(templates/name,folder/name)
    runner=ENTRY.split('def main(')[0]+templates.joinpath('runner.py').read_text(encoding='utf-8-sig')+'\n'+inspect.getsource(one_bit_counts)
    (folder/'portable/runner.py').write_text(runner,encoding='utf-8')
    (folder/'portable/__init__.py').write_text('"""Actual-SPP table replay."""\n',encoding='utf-8')
    shutil.copyfile(PROJECT/'quantum/qaoa.py',folder/'quantum/qaoa.py')
    (folder/'quantum/__init__.py').write_text('"""Portable QAOA engine."""\n',encoding='utf-8')
    (folder/'main.py').write_text('from portable.runner import run\n\ndef main(shots: int = 256, seed: int = 2026, depth: int = 1, restarts: int = 1, maxiter: int = 40):\n    output = run(backend, shots, seed, depth, restarts, maxiter)\n    print(output)\n    return output\n',encoding='utf-8')
    (folder/'requirements.txt').write_text('qiskit>=2.5.2,<3.0.0\nnumpy\nscipy\n',encoding='utf-8')
    shutil.copyfile(PROJECT.parent/'LICENSE',folder/'LICENSE')
    (folder/'README.md').write_text('''# SPP dispatch and QAOA: portable visual replay

> Your write-up answers: what is it, why it matters, how the quantum part works, how to run it

## What is it?
A runnable visual replay of an actual-SPP bounded dispatch experiment for July 1, 2026, hour ending 01:00 CPT. Four actual submissions have binary quantity choices, one real submission balances them, and 5,043 other awards are frozen. It carries 16 precomputed candidate costs and conditional prices, not raw SPP CSVs or the full auction solver.

## Why it matters
Day-ahead markets need cost-effective dispatch while meeting demand. We explore whether QAOA puts more samples on useful dispatch choices than classical random sampling and one-bit search. The recorded local five-trial case had QAOA53.047%, one-bit19.922%, random5.625% optimal hits; all found the optimum in5/5 trials. A new Qollab run may differ. This is descriptive evidence, not speedup, SPP savings or general advantage.

## How the quantum part works
Original-curve candidate costs define the diagonal cost operator. SciPy tunes QAOA locally using Qiskit statevectors. One eight-qubit circuit places uniform sampling on four low qubits and QAOA on four high qubits; one backend job returns joint counts. We split the marginals and score both alongside a classical one-bit search at the same candidate budget. The table was already enumerated classically, and tuning is extra overhead. Physical noise may correlate the two blocks.

## How to run it
Upload qollab-upload.zip using Files > Browse, Unpack, then Keep and add. At the project root confirm index.html, main.js, main.css, view.js, main.py, requirements.txt, data/, portable/ and quantum/. Files must not be inside a wrapping folder. These root HTML/JS files select Qollab's visual mode. Press the platform Run button and choose the free local BasicSimulator. No hardware or API key is required. Default run:256 shots, seed2026, depth1, one restart, maxiter40. It makes exactly one backend job. A Python-only fallback is available by removing index.html/main.js from the project root; main.py prints JSON.

## Use and interpret the interface
The large full-auction price is the recorded classical single-node reference (~10.64 $/MWh), not a fresh raw-data solve or nodal SPP LMP. Three cards show the current run's optimal-hit fractions, feasible samples, best net cost/gap and conditional price. Click a resource in the schematic for baseline/current-QAOA quantities and study levels. The graph is the bounded neighborhood, with frozen supply/withdrawals listed separately; it is not physical transmission geography. No feasible QAOA sample is labeled and uses the baseline graph only as context.

Recorded local five-trial results are separately labeled, never substituted for live results. Optimal-hit frequency differs from the chance that a run finds at least one optimum. Net cost subtracts purchase-bid value and can be negative. Conditional prices are precomputed classical prices for fixed dispatch choices, not QAOA duals or full-market prices. Exact enumeration always finds this small table's minimum. Read timing and limitations below the cards.

The full native application supports matching DA Energy Offers/DA Market Clearing CSV uploads and Run Hour/Run Day. That workflow is local and not included in this replay. Source/instructions: https://github.com/SagarPatange/Cartheon_QollabxIONQ/tree/energy-grid-plan/Project_1_EnergyGridOptimization

## Video and credits
Demo video: [ADD PUBLIC 2-3 MINUTE VIDEO LINK; NO SIGN-IN]
Project code is MIT. Original SPP datasets are publicly accessible from SPP.org, retain their own rights, are not relicensed under MIT and are not included. This package contains computed experiment outputs and source hashes. Development used AI assistance via OpenAI Codex; dependencies include Qiskit, NumPy and SciPy. It builds on the linked project's classical energy-market work. Identify pre-existing work and hackathon contributions accurately on the project page.

This effort is supported by Qollab and IonQ.

For an existing Qollab project, uploading may skip README import; paste this write-up into the project page manually. Uploading files does not publish or submit the project. The visual bridge still needs one owner-run verification in Qollab; local execution is verified separately.
''',encoding='utf-8')
    names=['index.html','main.js','main.css','view.js','main.py','requirements.txt','LICENSE','README.md','data/spp_oracle.json','portable/runner.py','portable/__init__.py','quantum/qaoa.py','quantum/__init__.py']
    archive=folder.parent/'qollab-upload.zip'
    if archive.exists():
        with zipfile.ZipFile(archive) as old:
            if 'data/oracle_low.json' in old.namelist():shutil.copyfile(archive,folder.parent/'legacy-synthetic-upload.zip')
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in names:
            if (folder/name).stat().st_size>2_000_000:raise ValueError('File exceeds Qollab upload limit')
            z.write(folder/name,name)
    return dict(directory=str(folder),archive=str(archive),files=names)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',help='Completed actual-SPP comparison report.json under results/market-runs')
    parser.add_argument('--output-dir',help='Project-local package folder')
    args=parser.parse_args()
    print(json.dumps(export_spp_package(args.output_dir,args.report),indent=2))
