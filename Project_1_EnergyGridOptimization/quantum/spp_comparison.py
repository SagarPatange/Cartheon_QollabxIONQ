"""Descriptive local trials on one shared SPP-derived finite dispatch table."""
import time
from quantum.benchmark import benchmark_oracle

def summarize_method(oracle,runs):
    feasible=[r for r in runs if r['score']['best_index'] is not None]
    best=min(feasible,key=lambda r:r['score']['best_objective_dollars']) if feasible else None
    index=best['score']['best_index'] if best else None
    return dict(runs=runs,optimal_hit_rate=sum(r['score']['optimal_hit_rate'] for r in runs)/len(runs),feasible_rate=sum(r['score']['observed_feasible_rate'] for r in runs)/len(runs),success_trials=sum(r['score']['best_gap_dollars'] is not None and abs(r['score']['best_gap_dollars'])<=1e-7 for r in runs),trials=len(runs),best_index=index,best_objective_dollars=best['score']['best_objective_dollars'] if best else None,best_gap_dollars=best['score']['best_gap_dollars'] if best else None,conditional_price=oracle['entries'][index]['conditional_price'] if best else None,execution_seconds=sum(r['execution_seconds'] for r in runs))

def compare_spp_oracle(oracle,*,shots=256,repeats=5,seed=2026,depth=1,restarts=1,maxiter=40):
    if oracle['status']!='ready':return oracle
    raw=benchmark_oracle(oracle,shots=shots,repeats=repeats,seed=seed,depth=depth,restarts=restarts,maxiter=maxiter)
    start=time.perf_counter();index=min(oracle['optimal_indices']);entry=oracle['entries'][index];exact_time=time.perf_counter()-start
    methods={name:summarize_method(oracle,raw['methods'][name]['runs']) for name in ['uniform','one_bit','qaoa']}
    changes={}
    for name,method in methods.items():
        chosen=method['best_index']
        changes[name]=[] if chosen is None else [dict(row_id=row,baseline_mw=a,selected_mw=b,change_mw=b-a) for row,a,b in zip(oracle['source_rows'],oracle['baseline_quantities'],oracle['entries'][chosen]['quantities']) if abs(b-a)>1e-7]
    return dict(status='complete',settings=dict(shots=shots,repeats=repeats,seed=seed,depth=depth,restarts=restarts,maxiter=maxiter,backend='Qiskit BasicSimulator (local)'),exact=dict(best_index=index,objective_dollars=entry['objective_dollars'],conditional_price=entry['conditional_price'],unique_candidates=len(oracle['entries']),selection_seconds=exact_time),methods=methods,award_changes=changes,tuning=raw['tuning'],preparation=oracle['timing'],decisions=oracle['decisions'],balancing_row_id=oracle['balancing_row_id'],frozen_count=oracle['frozen_count'],disclosure='All methods score the same classically enumerated table. Exact enumeration always identifies its minimum. Five trials are descriptive, not statistical proof. One-bit samples are dependent. Candidate budgets exclude classical oracle preparation and QAOA tuning; no speedup or scalable quantum advantage claim. Prices are conditional on fixed discrete quantities and frozen resources.')
