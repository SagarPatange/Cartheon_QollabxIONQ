"""Independent phase, statevector and count checks for QAOA."""
import cmath
import math
import unittest

from qiskit.quantum_info import Statevector
from qiskit.providers.basic_provider import BasicSimulator
from quantum.qaoa import build_qaoa, score_counts, tune_qaoa, walsh_terms


def synthetic_oracle():
    costs = [2., 5., 11., 4.]
    return dict(n_bits=2, costs=costs, penalty_dollars=12.,
                best_objective_dollars=2., optimal_indices=[0],
                entries=[dict(bitstring=f'{i:02b}', feasible=i != 2,
                              objective_dollars=(None if i == 2 else cost))
                         for i, cost in enumerate(costs)])


class QaoaTests(unittest.TestCase):
    def test_walsh_terms_reconstruct_each_normalized_cost(self):
        oracle = synthetic_oracle()
        terms = walsh_terms(oracle)
        self.assertAlmostEqual(terms[()], 3.5 / 9)
        self.assertAlmostEqual(terms[(0,)], 1 / 9)
        self.assertAlmostEqual(terms[(1,)], -2 / 9)
        self.assertAlmostEqual(terms[(0, 1)], -2.5 / 9)
        for index, cost in enumerate((2., 5., 11., 4.)):
            reconstructed = sum(coefficient * (-1) ** sum((index >> bit) & 1 for bit in bits)
                                for bits, coefficient in terms.items())
            self.assertAlmostEqual(reconstructed, (cost - 2) / 9)

    def test_every_basis_phase_has_only_a_removed_global_phase(self):
        gamma = .7
        circuit = build_qaoa(synthetic_oracle(), [gamma, 0.], measured=False)
        self.assertEqual(set(circuit.count_ops()) - {'h', 'rx', 'rz', 'cx'}, set())
        amplitudes = Statevector.from_instruction(circuit).data
        base = amplitudes[0]
        for index, cost in enumerate((2., 5., 11., 4.)):
            expected = cmath.exp(-1j * gamma * (cost - 2) / 9)
            self.assertAlmostEqual(abs(amplitudes[index]), .5, places=9)
            self.assertAlmostEqual(abs(amplitudes[index] / base - expected), 0., places=9)

    def test_counts_decode_validate_and_handle_no_feasible_sample(self):
        oracle = synthetic_oracle()
        result = score_counts(oracle, {'00': 2, '01': 3, '10': 4, '11': 1}, shots=10)
        self.assertEqual(result['best_bitstring'], '00')
        self.assertEqual(result['best_objective_dollars'], 2.)
        self.assertEqual(result['feasible_shots'], 6)
        self.assertEqual(result['optimal_shots'], 2)
        self.assertAlmostEqual(result['observed_feasible_rate'], .6)
        self.assertAlmostEqual(result['optimal_hit_rate'], .2)
        self.assertEqual(result['best_gap_dollars'], 0.)
        empty = score_counts(oracle, {'10': 4}, shots=4)
        self.assertIsNone(empty['best_bitstring'])
        self.assertIsNone(empty['best_gap_dollars'])
        for bad, shots in (({'0': 1}, 1), ({'0x1': 1}, 1), ({'00': -1}, 1),
                           ({'00': 1.5}, 1), ({'00': 0}, 0), ({'00': 1}, 2)):
            with self.subTest(bad=bad, shots=shots), self.assertRaises(ValueError):
                score_counts(oracle, bad, shots=shots)

    def test_tuning_is_seeded_and_returns_accounted_local_evaluations(self):
        oracle = synthetic_oracle()
        one = tune_qaoa(oracle, depth=1, seed=7, restarts=2, maxiter=4)
        two = tune_qaoa(oracle, depth=1, seed=7, restarts=2, maxiter=4)
        self.assertEqual(one['parameters'], two['parameters'])
        self.assertEqual(len(one['parameters']), 2)
        self.assertGreater(one['evaluations'], 0)
        self.assertTrue(math.isfinite(one['expected_cost_dollars']))
        self.assertGreaterEqual(one['tuning_seconds'], 0.)

    def test_tuning_rejects_budget_below_cobyla_minimum_and_respects_boundary(self):
        oracle = synthetic_oracle()
        for budget in (1, 5):
            with self.subTest(budget=budget), self.assertRaisesRegex(ValueError, 'at least 6'):
                tune_qaoa(oracle, depth=2, restarts=1, maxiter=budget)
        result = tune_qaoa(oracle, depth=2, restarts=1, maxiter=6)
        self.assertLessEqual(result['evaluations'], 6)
        self.assertLessEqual(result['attempts'][0]['evaluations'], 6)

    def test_measured_circuit_scores_real_simulator_counts(self):
        oracle = synthetic_oracle()
        circuit = build_qaoa(oracle, [.7, .4])
        self.assertEqual(set(circuit.count_ops()) - {'h', 'rx', 'rz', 'cx', 'measure'}, set())
        counts = BasicSimulator().run(circuit, shots=64, seed_simulator=11).result().get_counts()
        score = score_counts(oracle, counts, shots=64)
        self.assertEqual(score['shots'], 64)
        self.assertGreaterEqual(score['feasible_shots'], 0)


if __name__ == '__main__':
    unittest.main()
