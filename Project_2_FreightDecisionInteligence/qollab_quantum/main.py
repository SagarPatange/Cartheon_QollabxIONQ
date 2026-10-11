"""Qollab entry point: QAOA against uniform sampling and one-bit search on a real dispatch decision.

The table in data/freight_oracle.json is a contested piece of one decision epoch of the truckload dispatch simulator:
a few loads competing for the same trucks, every possible assignment priced exactly (built locally with
tools/build_quantum_oracle.py). QAOA is tuned locally, then sampled together with uniform sampling in ONE backend job
(a joint circuit on disjoint qubit blocks); one-bit search spends the same budget classically.

Qollab supplies the `backend` global (the simulator picked in Select QPU) and calls main() with the Run settings.
"""

import json

from freight_sim.quantum.comparison import run_comparison


def main(shots: int = 1000, seed: int = 2026, depth: int = 1, restarts: int = 2, maxiter: int = 40):
    with open("data/freight_oracle.json", encoding="utf-8") as oracle_file:
        oracle = json.load(oracle_file)
    result = run_comparison(
        backend, oracle, shots=shots, seed=seed, depth=depth, restarts=restarts, maxiter=maxiter,  # noqa: F821
    )
    print_summary(oracle, result)
    print(json.dumps({key: value for key, value in result.items() if key != "methods"}, indent=1))


def print_summary(oracle: dict, result: dict) -> None:
    """The cluster, then one line per method: how often it sampled a valid and an optimal assignment."""
    source = oracle["source"]
    print(f"Week of {source['week_start']}, decision at minute {source['epoch_minute']}: "
          f"{source['open_loads']} open loads, {source['free_trucks']} free trucks.")
    print(f"Contested cluster ({oracle['objective']} objective): {oracle['n_bits']} load–truck pairs, "
          f"{len(oracle['entries'])} possible assignments.")
    for bit, pair in enumerate(oracle["pairs"]):
        print(f"  qubit {bit}: {pair['load_id']} ← {pair['truck_id']} in {pair['truck_city']} "
              f"({pair['empty_miles']:,.0f} empty mi, score {pair['score']:,.0f})")
    print(f"Exact best value: {oracle['best_value']:,.2f} (the MILP agrees).")
    print(f"{'method':16}{'valid':>8}{'optimal':>9}{'best found':>14}")
    for name, method in result["methods"].items():
        score = method["score"]
        best_text = "none" if score["best_value"] is None else f"{score['best_value']:,.2f}"
        print(f"{name:16}{score['feasible_rate']:>8.1%}{score['optimal_hit_rate']:>9.1%}{best_text:>14}")
