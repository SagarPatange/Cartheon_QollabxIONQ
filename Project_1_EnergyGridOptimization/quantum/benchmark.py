"""Reproducible, finite-oracle local comparisons with original-model checks."""
import argparse
import json
import platform
import time
from collections import Counter
from pathlib import Path

import numpy as np
import qiskit
import scipy
from qiskit import QuantumCircuit
from qiskit.providers.basic_provider import BasicSimulator

from optimizer.multihour_dispatch import load_operating_case
from optimizer.unit_commitment import (load_commitment_specs, price_fixed_commitment,
                             solve_commitment, verify_commitment, verify_fixed_pricing)
from quantum.qaoa import build_qaoa, score_counts, tune_qaoa
from quantum.subproblem import build_subproblem


PROJECT = Path(__file__).resolve().parents[1]
TINY = PROJECT / 'data' / 'commitment_benchmark.json'
FULL = PROJECT / 'data' / 'operating_case.json'
TINY_DECISIONS = [(0, 'cheap'), (0, 'local'), (1, 'cheap'), (1, 'local')]
FULL_DECISIONS = [(16, 'test_peak'), (16, 'test_local'),
                  (17, 'test_peak'), (17, 'test_local')]


def one_bit_counts(oracle, *, shots, seed):
    """Spend exactly shots candidate evaluations in seeded one-bit local search."""
    if type(shots) is not int or shots < 1:
        raise ValueError('shots must be a positive integer')
    rng = np.random.default_rng(seed)
    n = oracle['n_bits']
    counts = Counter()
    current = int(rng.integers(1 << n))
    current_cost = oracle['costs'][current]
    for step in range(shots):
        if step == 0:
            candidate = current
        elif step % (n + 1) == 0:
            candidate = int(rng.integers(1 << n))
            current = candidate
            current_cost = oracle['costs'][candidate]
        else:
            candidate = current ^ (1 << ((step - 1) % n))
            candidate_cost = oracle['costs'][candidate]
            if candidate_cost < current_cost:
                current = candidate
                current_cost = candidate_cost
        counts[f'{candidate:0{n}b}'] += 1
    return dict(counts)


def _uniform_circuit(n):
    circuit = QuantumCircuit(n, n)
    circuit.h(range(n))
    circuit.measure(range(n), range(n))
    return circuit


def benchmark_oracle(oracle, *, shots=1024, repeats=5, seed=2026, depth=2,
                     restarts=3, maxiter=80, backend_factory=BasicSimulator,
                     verify_choice=None):
    """Compare four methods on the same table and candidate occurrence budget."""
    if any(type(value) is not int or value < 1 for value in (shots, repeats)):
        raise ValueError('shots and repeats must be positive integers')
    tuned = tune_qaoa(oracle, depth=depth, seed=seed, restarts=restarts, maxiter=maxiter)
    qaoa = build_qaoa(oracle, tuned['parameters'])
    uniform = _uniform_circuit(oracle['n_bits'])
    nstates = 1 << oracle['n_bits']
    rng = np.random.default_rng(seed)
    methods = {name: dict(runs=[], unique_candidates=(min(nstates, shots) if name == 'enumeration' else None))
               for name in ('enumeration', 'one_bit', 'uniform', 'qaoa')}
    for repeat in range(repeats):
        for name in methods:
            started = time.perf_counter()
            if name == 'enumeration':
                counts = dict(Counter(f'{i % nstates:0{oracle["n_bits"]}b}' for i in range(shots)))
            elif name == 'one_bit':
                counts = one_bit_counts(oracle, shots=shots, seed=seed + repeat)
            else:
                circuit = uniform if name == 'uniform' else qaoa
                backend = backend_factory()
                job = backend.run(circuit, shots=shots, seed_simulator=int(rng.integers(2**31)))
                counts = job.result().get_counts()
            execution = time.perf_counter() - started
            selected = time.perf_counter()
            score = score_counts(oracle, counts, shots=shots)
            selection = time.perf_counter() - selected
            verification = None
            verification_seconds = 0.
            if score['best_index'] is not None and verify_choice is not None:
                verify_started = time.perf_counter()
                verification = verify_choice(oracle['entries'][score['best_index']])
                verification_seconds = time.perf_counter() - verify_started
            methods[name]['runs'].append(dict(repeat=repeat, counts=counts, score=score,
                                             execution_seconds=execution,
                                             decode_selection_seconds=selection,
                                             verification_seconds=verification_seconds,
                                             original_certificate=verification))
    return dict(candidate_budget_per_repeat=shots, repeats=repeats, seed=seed,
                oracle_best_objective_dollars=oracle['best_objective_dollars'],
                oracle_preparation=oracle.get('timing'), tuning=tuned, methods=methods,
                budget_note='Each repeat scores exactly shots candidate occurrences; enumeration has 2**n unique entries and cycles after exhausting them. QAOA tuning is additional classical work.')


def _verify_original(case_path, entry):
    case = load_operating_case(case_path)
    specs = load_commitment_specs(case_path, case)
    priced = price_fixed_commitment(case, specs, entry['on'])
    fresh = verify_fixed_pricing(case, specs, priced)
    if not fresh['passed'] or abs(priced['objective_dollars'] - entry['objective_dollars']) > .01:
        raise RuntimeError('Fresh original-model pricing certificate disagrees with oracle')
    return dict(objective_dollars=priced['objective_dollars'], certificate=fresh)


def run_benchmark(*, shots=1024, repeats=5, seed=2026,
                  output_dir=None, depth=2, restarts=3, maxiter=80):
    """Run the two synthetic tiny costs and declared certified 24-hour neighborhood."""
    output = Path(output_dir or PROJECT / 'results' / 'quantum-benchmark')
    output.mkdir(parents=True, exist_ok=True)
    raw = json.loads(TINY.read_text())
    cases = {}
    for startup in (10, 1000):
        scenario = json.loads(json.dumps(raw))
        scenario['units'][0]['commitment']['startup_cost_dollars'] = startup
        path = output / f'tiny_startup_{startup}.json'
        path.write_text(json.dumps(scenario, indent=2) + '\n')
        oracle = build_subproblem(path, [[0, 1], [0, 1]], TINY_DECISIONS)
        cases[f'tiny_startup_{startup}'] = dict(oracle=oracle,
            comparison=benchmark_oracle(oracle, shots=shots, repeats=repeats,
                seed=seed, depth=depth, restarts=restarts, maxiter=maxiter,
                verify_choice=lambda entry, path=path: _verify_original(path, entry)))
    full_started = time.perf_counter()
    case = load_operating_case(FULL)
    specs = load_commitment_specs(FULL, case)
    incumbent = solve_commitment(case, specs)
    incumbent_check = verify_commitment(case, specs, incumbent)
    if not incumbent_check['passed'] or incumbent['mip_gap'] > 1e-8:
        raise RuntimeError('24-hour incumbent is not certified optimal')
    incumbent_seconds = time.perf_counter() - full_started
    oracle = build_subproblem(FULL, incumbent['on'], FULL_DECISIONS)
    cases['full_day_neighborhood'] = dict(incumbent=incumbent,
        incumbent_certificate=incumbent_check, incumbent_seconds=incumbent_seconds,
        selection=dict(unit_ids=['test_peak', 'test_local'], interval_indices=[16, 17],
                       demand_mw=[200., 199.46649403773563]), oracle=oracle,
        comparison=benchmark_oracle(oracle, shots=shots, repeats=repeats,
            seed=seed, depth=depth, restarts=restarts, maxiter=maxiter,
            verify_choice=lambda entry: _verify_original(FULL, entry)))
    report = dict(scope='local_basic_simulator_synthetic_commitment',
                  environment=dict(python=platform.python_version(), qiskit=qiskit.__version__,
                                   numpy=np.__version__, scipy=scipy.__version__),
                  settings=dict(shots=shots, repeats=repeats, seed=seed, depth=depth,
                                restarts=restarts, maxiter=maxiter), cases=cases)
    path = output / 'benchmark.json'
    path.write_text(json.dumps(report, indent=2, allow_nan=False, default=lambda value: value.item() if isinstance(value, np.generic) else value) + '\n')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shots', type=int, default=1024)
    parser.add_argument('--repeats', type=int, default=5)
    parser.add_argument('--seed', type=int, default=2026)
    parser.add_argument('--output-dir')
    args = parser.parse_args()
    print(run_benchmark(shots=args.shots, repeats=args.repeats,
                        seed=args.seed, output_dir=args.output_dir))


if __name__ == '__main__':
    main()
