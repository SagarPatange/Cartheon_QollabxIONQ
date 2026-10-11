"""Behavioral checks for equal-budget finite-oracle comparisons."""
import unittest

from quantum.benchmark import benchmark_oracle, one_bit_counts


def oracle():
    values = [2., 5., None, 4.]
    return dict(n_bits=2, costs=[2., 5., 12., 4.], optimal_indices=[0],
                best_objective_dollars=2., entries=[
                    dict(index=i, bitstring=f'{i:02b}', feasible=value is not None,
                         objective_dollars=value) for i, value in enumerate(values)])


class BenchmarkTests(unittest.TestCase):
    def test_one_bit_search_spends_exact_budget_and_uses_actual_objectives(self):
        counts = one_bit_counts(oracle(), shots=7, seed=9)
        self.assertEqual(sum(counts.values()), 7)
        self.assertTrue(set(counts) <= {'00', '01', '10', '11'})
        self.assertEqual(counts, one_bit_counts(oracle(), shots=7, seed=9))

    def test_enumeration_reports_only_candidates_reached_by_budget(self):
        result = benchmark_oracle(oracle(), shots=2, repeats=1, seed=7,
                                  depth=1, restarts=1, maxiter=6)
        self.assertEqual(result['methods']['enumeration']['unique_candidates'], 2)
        self.assertEqual(sum(result['methods']['enumeration']['runs'][0]['counts'].values()), 2)

    def test_equal_candidate_occurrence_budget_and_explicit_no_feasible_result(self):
        result = benchmark_oracle(oracle(), shots=4, repeats=2, seed=7,
                                  depth=1, restarts=1, maxiter=6)
        self.assertEqual(result['candidate_budget_per_repeat'], 4)
        for method in result['methods'].values():
            self.assertEqual(len(method['runs']), 2)
            for run in method['runs']:
                self.assertEqual(sum(run['counts'].values()), 4)
                self.assertEqual(run['score']['shots'], 4)
        self.assertEqual(result['methods']['enumeration']['unique_candidates'], 4)
        self.assertEqual(result['methods']['enumeration']['runs'][0]['score']['best_objective_dollars'], 2.)
        self.assertEqual(result['oracle_best_objective_dollars'], 2.)

    def test_validation_rejects_malformed_measured_counts(self):
        class BadBackend:
            def run(self, circuits, shots, **kwargs):
                class Job:
                    def result(self):
                        class Result:
                            def get_counts(self, circuit=None):
                                return {'0': shots}
                        return Result()
                return Job()
        with self.assertRaisesRegex(ValueError, 'Malformed measured bitstring'):
            benchmark_oracle(oracle(), shots=4, repeats=1, seed=7,
                             depth=1, restarts=1, maxiter=6,
                             backend_factory=BadBackend)

    def test_no_feasible_measured_sample_is_reported_without_repair(self):
        class InfeasibleOnlyBackend:
            def run(self, circuits, shots, **kwargs):
                class Job:
                    def result(self):
                        class Result:
                            def get_counts(self):
                                return {'10': shots}
                        return Result()
                return Job()
        result = benchmark_oracle(oracle(), shots=4, repeats=1, seed=7,
                                  depth=1, restarts=1, maxiter=6,
                                  backend_factory=InfeasibleOnlyBackend)
        for name in ('uniform', 'qaoa'):
            score = result['methods'][name]['runs'][0]['score']
            self.assertEqual(score['feasible_shots'], 0)
            self.assertIsNone(score['best_objective_dollars'])
            self.assertIsNone(score['best_gap_dollars'])


if __name__ == '__main__':
    unittest.main()
