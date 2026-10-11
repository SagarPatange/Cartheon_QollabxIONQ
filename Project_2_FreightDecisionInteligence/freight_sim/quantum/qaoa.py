"""QAOA on an exact cost table: the circuit, local tuning on a statevector, and scoring measured counts.

Ported from Project 1's quantum/qaoa.py (same team, same method) and adapted to the dispatch table built by
assignment_oracle.py. The cost table is turned into an exact diagonal Hamiltonian: its Walsh expansion gives one
Z-string term per subset of qubits, each applied as a CNOT ladder around an RZ. Each QAOA layer is that cost phase
(angle gamma) followed by RX mixers (angle beta), starting from the uniform superposition.

Tuning runs locally on a statevector (no backend job); only the tuned circuit is sampled on the backend.
"""

import time

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector
from scipy.optimize import minimize

MAX_QUBITS = 8
# Walsh terms smaller than this only add a global phase or nothing measurable.
NEGLIGIBLE_TERM = 1e-15


def read_costs(oracle: dict) -> np.ndarray:
    """The table's 2**n costs as an array, after checking the table is complete and finite."""
    bit_count = oracle["n_bits"]
    costs = np.asarray(oracle["costs"], dtype=float)
    is_valid = (
        type(bit_count) is int and 1 <= bit_count <= MAX_QUBITS and costs.shape == (1 << bit_count,)
        and bool(np.all(np.isfinite(costs)))
    )
    if not is_valid:
        raise ValueError(f"the oracle needs a complete, finite cost table for 1 to {MAX_QUBITS} bits")
    return costs


def walsh_terms(oracle: dict) -> dict[tuple[int, ...], float]:
    """The cost table, rescaled to [0, 1], as Z-string coefficients keyed by the qubits each string acts on."""
    costs = read_costs(oracle)
    cost_span = float(np.max(costs) - np.min(costs))
    normalized = (costs - np.min(costs)) / cost_span if cost_span else np.zeros_like(costs)
    bit_count = oracle["n_bits"]
    terms = {}
    for mask in range(1 << bit_count):
        qubits = tuple(bit for bit in range(bit_count) if (mask >> bit) & 1)
        signed_values = []
        for index in range(1 << bit_count):
            sign = (-1) ** (index & mask).bit_count()
            signed_values.append(float(normalized[index]) * sign)
        terms[qubits] = sum(signed_values) / len(costs)
    return terms


def build_qaoa(oracle: dict, angles, *, is_measured: bool = True) -> QuantumCircuit:
    """The QAOA circuit for these angles: [gamma_1 … gamma_p, beta_1 … beta_p]."""
    bit_count = oracle["n_bits"]
    read_costs(oracle)
    angle_values = np.asarray(angles, dtype=float)
    is_valid = (
        angle_values.ndim == 1 and len(angle_values) >= 2 and len(angle_values) % 2 == 0
        and bool(np.all(np.isfinite(angle_values)))
    )
    if not is_valid:
        raise ValueError("QAOA angles must be finite gamma/beta pairs")
    depth = len(angle_values) // 2
    circuit = QuantumCircuit(bit_count, bit_count if is_measured else 0)
    circuit.h(range(bit_count))
    terms = walsh_terms(oracle)
    for layer in range(depth):
        gamma = angle_values[layer]
        beta = angle_values[depth + layer]
        for qubits, coefficient in terms.items():
            if not qubits or abs(coefficient) < NEGLIGIBLE_TERM:
                continue
            ladder = list(zip(qubits, qubits[1:], strict=False))
            for control, target in ladder:
                circuit.cx(control, target)
            circuit.rz(2 * gamma * coefficient, qubits[-1])
            for control, target in reversed(ladder):
                circuit.cx(control, target)
        circuit.rx(2 * beta, range(bit_count))
    if is_measured:
        circuit.measure(range(bit_count), range(bit_count))
    return circuit


def tune_qaoa(oracle: dict, *, depth: int = 2, seed: int = 101, restarts: int = 3, maxiter: int = 80) -> dict:
    """Minimise the expected cost over the angles with COBYLA, locally; never submits a backend job."""
    costs = read_costs(oracle)
    for setting in (depth, restarts, maxiter):
        if type(setting) is not int or setting < 1:
            raise ValueError("depth, restarts and maxiter must be positive integers")
    # COBYLA raises a smaller evaluation budget to this, so a smaller one would silently not be what was asked for.
    smallest_budget = 2 * depth + 2
    if maxiter < smallest_budget:
        raise ValueError(f"maxiter must be at least {smallest_budget} for depth {depth}")
    started = time.perf_counter()
    rng = np.random.default_rng(seed)
    evaluation_count = 0

    def expected_cost(angles) -> float:
        nonlocal evaluation_count
        evaluation_count += 1
        amplitudes = Statevector.from_instruction(build_qaoa(oracle, angles, is_measured=False)).data
        return float(np.dot(np.abs(amplitudes) ** 2, costs))

    attempts = []
    for _ in range(restarts):
        start_angles = np.r_[rng.uniform(0, 2 * np.pi, depth), rng.uniform(0, np.pi, depth)]
        attempts.append(minimize(expected_cost, start_angles, method="COBYLA", options={"maxiter": maxiter}))
    best = min(attempts, key=lambda attempt: attempt.fun)
    return {
        "angles": [float(angle) for angle in best.x],
        "expected_cost": float(best.fun),
        "evaluations": evaluation_count,
        "tuning_seconds": time.perf_counter() - started,
        "depth": depth, "seed": seed, "restarts": restarts, "maxiter": maxiter,
        "converged": bool(best.success),
    }


def score_counts(oracle: dict, counts: dict[str, int], *, shots: int) -> dict:
    """How a sampler did: share of feasible and of optimal samples, and the best assignment it saw."""
    read_costs(oracle)
    bit_count = oracle["n_bits"]
    if type(shots) is not int or shots <= 0 or not isinstance(counts, dict):
        raise ValueError("need a positive whole number of shots and a counts dictionary")
    total_shots = 0
    feasible_shots = 0
    optimal_shots = 0
    observed = []
    for bitstring, frequency in counts.items():
        is_bitstring = isinstance(bitstring, str) and len(bitstring) == bit_count and set(bitstring) <= {"0", "1"}
        if not is_bitstring or type(frequency) is not int or frequency < 0:
            raise ValueError(f"malformed count {bitstring!r}: {frequency!r}")
        total_shots += frequency
        index = int(bitstring, 2)
        entry = oracle["entries"][index]
        if entry["feasible"] and frequency:
            feasible_shots += frequency
            if index in oracle["optimal_indices"]:
                optimal_shots += frequency
            observed.append((entry["cost"], bitstring, index))
    if total_shots != shots:
        raise ValueError(f"counts add up to {total_shots}, not the {shots} shots asked for")
    best = min(observed) if observed else None
    return {
        "shots": shots,
        "feasible_rate": feasible_shots / shots,
        "optimal_hit_rate": optimal_shots / shots,
        "best_bitstring": best[1] if best else None,
        "best_index": best[2] if best else None,
        "best_value": -best[0] if best else None,
        "gap_to_optimum": (best[0] - oracle["best_cost"]) if best else None,
    }
