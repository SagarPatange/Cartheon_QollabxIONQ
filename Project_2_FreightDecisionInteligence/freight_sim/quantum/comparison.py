"""QAOA against uniform sampling and one-bit search on one dispatch cost table, with the same budget each.

Following Project 1, the backend gets exactly one job: one joint circuit with uniform sampling (Hadamards) on qubits
0 … n−1 and the tuned QAOA circuit on qubits n … 2n−1, so a single shot samples both. One-bit search runs classically
and evaluates as many candidates as there are shots. Table preparation and QAOA tuning are extra overhead, reported
separately. One run is not statistical proof, and no speedup is claimed.
"""

import time
from collections import Counter

import numpy as np
from qiskit import QuantumCircuit, transpile

from freight_sim.quantum.qaoa import build_qaoa, score_counts, tune_qaoa


class OneJobBackend:
    """Wraps the backend so a second job fails fast (IonQ on Qollab allows one per run)."""

    def __init__(self, backend):
        self.backend = backend
        self.job_count = 0

    def run(self, circuit: QuantumCircuit, *, shots: int):
        self.job_count += 1
        if self.job_count != 1:
            raise RuntimeError("Qollab allows exactly one backend job per run")
        return self.backend.run(transpile(circuit, self.backend), shots=shots)


def build_joint_circuit(oracle: dict, angles) -> QuantumCircuit:
    """Uniform sampling on qubits 0 … n−1, the QAOA circuit on qubits n … 2n−1, all measured."""
    width = oracle["n_bits"]
    circuit = QuantumCircuit(2 * width, 2 * width)
    circuit.h(range(width))
    circuit.compose(build_qaoa(oracle, angles, is_measured=False), qubits=range(width, 2 * width), inplace=True)
    circuit.measure(range(2 * width), range(2 * width))
    return circuit


def split_joint_counts(counts: dict[str, int], *, width: int, shots: int) -> tuple[dict, dict]:
    """(uniform counts, QAOA counts) from the joint counts: the right half of each bitstring is the uniform block."""
    uniform_counts: Counter = Counter()
    qaoa_counts: Counter = Counter()
    total_shots = 0
    for bitstring, frequency in counts.items():
        if len(bitstring) != 2 * width or set(bitstring) - {"0", "1"}:
            raise ValueError(f"malformed joint bitstring {bitstring!r}")
        total_shots += frequency
        uniform_counts[bitstring[width:]] += frequency
        qaoa_counts[bitstring[:width]] += frequency
    if total_shots != shots:
        raise ValueError(f"joint counts add up to {total_shots}, not {shots}")
    return dict(uniform_counts), dict(qaoa_counts)


def one_bit_search_counts(oracle: dict, *, shots: int, seed: int) -> dict[str, int]:
    """Spend exactly `shots` candidate evaluations on seeded one-bit local search, restarting every n + 1 steps."""
    if type(shots) is not int or shots < 1:
        raise ValueError("shots must be a positive whole number")
    rng = np.random.default_rng(seed)
    width = oracle["n_bits"]
    costs = oracle["costs"]
    counts: Counter = Counter()
    current = int(rng.integers(1 << width))
    current_cost = costs[current]
    for step in range(shots):
        if step == 0:
            candidate = current
        elif step % (width + 1) == 0:
            candidate = int(rng.integers(1 << width))
            current = candidate
            current_cost = costs[candidate]
        else:
            candidate = current ^ (1 << ((step - 1) % width))
            if costs[candidate] < current_cost:
                current = candidate
                current_cost = costs[candidate]
        counts[format(candidate, f"0{width}b")] += 1
    return dict(counts)


def run_comparison(backend, oracle: dict, *, shots: int = 1000, seed: int = 2026, depth: int = 2,
                   restarts: int = 3, maxiter: int = 80) -> dict:
    """Tune QAOA locally, sample it and uniform in one backend job, run one-bit search, and score all three."""
    tuning = tune_qaoa(oracle, depth=depth, seed=seed, restarts=restarts, maxiter=maxiter)
    started = time.perf_counter()
    job = OneJobBackend(backend).run(build_joint_circuit(oracle, tuning["angles"]), shots=shots)
    joint_counts = job.result().get_counts()
    backend_seconds = time.perf_counter() - started
    uniform_counts, qaoa_counts = split_joint_counts(joint_counts, width=oracle["n_bits"], shots=shots)
    one_bit_counts = one_bit_search_counts(oracle, shots=shots, seed=seed)
    methods = {}
    for name, counts in (("uniform", uniform_counts), ("one_bit_search", one_bit_counts), ("qaoa", qaoa_counts)):
        methods[name] = {"counts": counts, "score": score_counts(oracle, counts, shots=shots)}
    return {
        "shots": shots,
        "seed": seed,
        "methods": methods,
        "exact": {"best_value": oracle["best_value"], "optimal_indices": oracle["optimal_indices"],
                  "milp_index": oracle["milp_index"], "candidates": len(oracle["entries"])},
        "tuning": tuning,
        "timing": {"tuning_seconds": tuning["tuning_seconds"], "backend_seconds": backend_seconds},
        "disclosure": (
            "QAOA and uniform sampling share one joint circuit on disjoint qubit blocks; one-bit search spends the "
            "same number of candidate evaluations classically. The exact table and QAOA tuning are classical overhead. "
            "One run is not statistical proof and no quantum speedup is claimed."
        ),
    }
