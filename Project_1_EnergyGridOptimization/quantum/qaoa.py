"""Exact-diagonal QAOA candidate circuits and local statevector tuning."""
import time

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector
from scipy.optimize import minimize


def _costs(oracle):
    n = oracle['n_bits']
    costs = np.asarray(oracle['costs'], dtype=float)
    if type(n) is not int or not 1 <= n <= 8 or costs.shape != (1 << n,) or not np.all(np.isfinite(costs)):
        raise ValueError('Require a finite complete oracle with one to eight bits')
    return costs


def walsh_terms(oracle) -> dict:
    """Return normalized Z-string coefficients keyed by low-bit qubit tuples."""
    costs = _costs(oracle)
    span = float(np.max(costs) - np.min(costs))
    normalized = (costs - np.min(costs)) / span if span else np.zeros_like(costs)
    n = oracle['n_bits']
    terms = {}
    for mask in range(1 << n):
        bits = tuple(bit for bit in range(n) if (mask >> bit) & 1)
        coefficient = sum(float(normalized[index]) * (-1) ** ((index & mask).bit_count())
                          for index in range(1 << n)) / len(costs)
        terms[bits] = coefficient
    return terms


def build_qaoa(oracle, parameters, *, measured=True):
    """Apply exact cost phases followed by RX mixers at every layer."""
    n = oracle['n_bits']
    _costs(oracle)
    angles = np.asarray(parameters, dtype=float)
    if angles.ndim != 1 or len(angles) < 2 or len(angles) % 2 or not np.all(np.isfinite(angles)):
        raise ValueError('QAOA parameters must be finite gamma/beta pairs')
    depth = len(angles) // 2
    circuit = QuantumCircuit(n, n if measured else 0)
    for qubit in range(n):
        circuit.h(qubit)
    terms = walsh_terms(oracle)
    for layer in range(depth):
        gamma, beta = angles[layer], angles[depth + layer]
        for bits, coefficient in terms.items():
            if not bits or abs(coefficient) < 1e-15:
                continue  # identity contributes only a global phase
            for left, right in zip(bits, bits[1:]):
                circuit.cx(left, right)
            circuit.rz(2 * gamma * coefficient, bits[-1])
            for left, right in reversed(list(zip(bits, bits[1:]))):
                circuit.cx(left, right)
        for qubit in range(n):
            circuit.rx(2 * beta, qubit)
    if measured:
        circuit.measure(range(n), range(n))
    return circuit


def tune_qaoa(oracle, *, depth=2, seed=101, restarts=3, maxiter=80) -> dict:
    """Minimize expected penalized cost locally; never submit a backend job."""
    costs = _costs(oracle)
    if any(type(value) is not int or value < 1 for value in (depth, restarts, maxiter)):
        raise ValueError('depth, restarts and maxiter must be positive integers')
    minimum_budget = 2 * depth + 2  # SciPy COBYLA raises smaller MAXFUN to this value.
    if maxiter < minimum_budget:
        raise ValueError(f'maxiter must be at least {minimum_budget} for depth {depth}')
    started = time.perf_counter()
    rng = np.random.default_rng(seed)
    evaluations = 0

    def expected(angles):
        nonlocal evaluations
        evaluations += 1
        amplitudes = Statevector.from_instruction(build_qaoa(oracle, angles, measured=False)).data
        return float(np.dot(np.abs(amplitudes) ** 2, costs))

    attempts = []
    for _ in range(restarts):
        initial = np.r_[rng.uniform(0, 2 * np.pi, depth), rng.uniform(0, np.pi, depth)]
        result = minimize(expected, initial, method='COBYLA', options={'maxiter': maxiter})
        attempts.append(result)
    best = min(attempts, key=lambda result: result.fun)
    return dict(parameters=[float(value) for value in best.x],
                expected_cost_dollars=float(best.fun), evaluations=evaluations,
                tuning_seconds=time.perf_counter() - started,
                depth=depth, seed=seed, restarts=restarts, maxiter=maxiter,
                converged=bool(best.success), status=str(best.message),
                attempts=[dict(expected_cost_dollars=float(result.fun),
                               converged=bool(result.success), status=str(result.message),
                               evaluations=int(result.nfev)) for result in attempts])


def score_counts(oracle, counts, *, shots) -> dict:
    """Validate complete backend counts and select the cheapest observed feasible schedule."""
    _costs(oracle)
    n = oracle['n_bits']
    if type(shots) is not int or shots <= 0 or not isinstance(counts, dict):
        raise ValueError('Require positive integer shots and a counts dictionary')
    if len(oracle['entries']) != 1 << n:
        raise ValueError('Oracle entries must cover every basis state')
    total = 0
    feasible_shots = optimal_shots = 0
    observed = []
    for bits, frequency in counts.items():
        if not isinstance(bits, str) or len(bits) != n or set(bits) - {'0', '1'}:
            raise ValueError('Malformed measured bitstring')
        if type(frequency) is not int or frequency < 0:
            raise ValueError('Counts must be nonnegative integers')
        total += frequency
        index = int(bits, 2)
        entry = oracle['entries'][index]
        if entry['feasible']:
            feasible_shots += frequency
            if index in oracle['optimal_indices']:
                optimal_shots += frequency
            if frequency:
                observed.append((entry['objective_dollars'], bits, index))
    if total != shots:
        raise ValueError('Counts total does not match requested shots')
    best = min(observed) if observed else None
    return dict(shots=shots, feasible_shots=feasible_shots, optimal_shots=optimal_shots,
                observed_feasible_rate=feasible_shots / shots, optimal_hit_rate=optimal_shots / shots,
                best_bitstring=best[1] if best else None,
                best_index=best[2] if best else None,
                best_objective_dollars=best[0] if best else None,
                best_gap_dollars=best[0] - oracle['best_objective_dollars'] if best else None)
