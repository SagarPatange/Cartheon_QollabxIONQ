"""Tests for freight_sim/quantum/qaoa.py and comparison.py. Skipped where Qiskit is not installed (the project's own
environment); run them in an environment with Qiskit, such as Qollab's."""

import numpy as np
import pytest

pytest.importorskip("qiskit")

from qiskit.providers.basic_provider import BasicSimulator  # noqa: E402

from freight_sim.quantum.comparison import (  # noqa: E402
    build_joint_circuit,
    one_bit_search_counts,
    run_comparison,
    split_joint_counts,
)
from freight_sim.quantum.qaoa import build_qaoa, score_counts, walsh_terms  # noqa: E402

# A 2-bit table: 00 and 11 infeasible (penalty 10), 01 costs −3 (best), 10 costs −1.
TINY_ORACLE = {
    "n_bits": 2,
    "costs": [10.0, -3.0, -1.0, 10.0],
    "entries": [
        {"feasible": False, "cost": None}, {"feasible": True, "cost": -3.0},
        {"feasible": True, "cost": -1.0}, {"feasible": False, "cost": None},
    ],
    "optimal_indices": [1],
    "best_cost": -3.0,
    "best_value": 3.0,
    "milp_index": 1,
}


def test_the_walsh_terms_rebuild_the_normalized_cost_table():
    terms = walsh_terms(TINY_ORACLE)
    costs = np.asarray(TINY_ORACLE["costs"])
    normalized = (costs - costs.min()) / (costs.max() - costs.min())
    for index in range(4):
        value = 0.0
        for qubits, coefficient in terms.items():
            sign = (-1) ** sum((index >> qubit) & 1 for qubit in qubits)
            value += coefficient * sign
        assert value == pytest.approx(normalized[index])


def test_the_circuit_acts_on_one_qubit_per_pair_and_the_joint_circuit_doubles_it():
    assert build_qaoa(TINY_ORACLE, [0.4, 0.2]).num_qubits == 2
    assert build_joint_circuit(TINY_ORACLE, [0.4, 0.2]).num_qubits == 4


def test_scoring_counts_feasible_and_optimal_samples_and_the_best_one_seen():
    score = score_counts(TINY_ORACLE, {"00": 2, "01": 1, "10": 7}, shots=10)
    assert score["feasible_rate"] == 0.8
    assert score["optimal_hit_rate"] == 0.1
    assert score["best_bitstring"] == "01"
    assert score["gap_to_optimum"] == 0


def test_one_bit_search_spends_exactly_the_shot_budget():
    counts = one_bit_search_counts(TINY_ORACLE, shots=50, seed=3)
    assert sum(counts.values()) == 50


def test_joint_counts_split_into_the_uniform_half_on_the_right_and_qaoa_on_the_left():
    uniform, qaoa = split_joint_counts({"0110": 3, "0111": 1}, width=2, shots=4)
    assert uniform == {"10": 3, "11": 1}
    assert qaoa == {"01": 4}


def test_a_full_comparison_runs_in_one_backend_job_and_scores_all_three_methods():
    result = run_comparison(BasicSimulator(), TINY_ORACLE, shots=200, seed=5, depth=1, restarts=1, maxiter=20)
    assert set(result["methods"]) == {"uniform", "one_bit_search", "qaoa"}
    for method in result["methods"].values():
        assert sum(method["counts"].values()) == 200
    assert result["exact"]["best_value"] == 3.0
