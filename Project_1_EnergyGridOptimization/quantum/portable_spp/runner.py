"""Portable replay of an already certified SPP-derived finite cost table."""
from collections import Counter
import numpy as np

def run(supplied_backend,shots=256,seed=2026,depth=1,restarts=1,maxiter=40):
    if type(shots) is not int or not 1<=shots<=4096:
        raise ValueError('Require 1-4096 shots')
    with open('data/spp_oracle.json',encoding='utf-8') as handle:
        oracle=json.load(handle)
    tuning=tune_qaoa(oracle,depth=depth,seed=seed,restarts=restarts,maxiter=maxiter)
    circuit=_joint_circuit(oracle,tuning['parameters'])
    started=time.perf_counter()
    joint=_OneJob(supplied_backend).run(circuit,shots=shots).result().get_counts()
    elapsed=time.perf_counter()-started
    uniform,qaoa=_split_counts(joint,width=oracle['n_bits'],shots=shots)
    started=time.perf_counter()
    classical=one_bit_counts(oracle,shots=shots,seed=seed)
    classical_seconds=time.perf_counter()-started
    methods={}
    for name,counts in [('uniform',uniform),('one_bit',classical),('qaoa',qaoa)]:
        score=score_counts(oracle,counts,shots=shots)
        index=score['best_index']
        entry=oracle['entries'][index] if index is not None else None
        methods[name]=dict(counts=counts,score=score,conditional_price=entry['conditional_price'] if entry else None,resource_quantities=entry['resource_quantities'] if entry else None)
    output=dict(scope='actual_spp_frozen_dispatch_replay',source=oracle['source'],resources=oracle['resources'],frozen=oracle['frozen'],shots=shots,seed=seed,methods=methods,exact=dict(objective_dollars=oracle['best_objective_dollars'],unique_candidates=len(oracle['entries'])),tuning=tuning,timing=dict(preparation_seconds=oracle['timing']['preparation_seconds'],tuning_seconds=tuning['tuning_seconds'],joint_backend_seconds=elapsed,classical_search_seconds=classical_seconds),recorded_local=oracle['recorded_local'],joint_counts=joint,disclosure='This run replays a precomputed actual-SPP table; it does not reoptimize raw CSVs. One joint circuit samples QAOA and uniform on disjoint four-qubit blocks. Correlated physical noise is possible. Classical search uses the same candidate budget; tuning/table preparation are extra overhead. One run is not statistical proof, scalable advantage or a full-market QAOA LMP. The displayed full-auction price is the recorded classical reference; live prices are conditional.')
    return json.dumps(output,allow_nan=False)
