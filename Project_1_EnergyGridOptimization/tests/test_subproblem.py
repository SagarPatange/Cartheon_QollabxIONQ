"""Behavioral tests for the bounded exact commitment oracle."""
import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from optimizer.multihour_dispatch import load_operating_case
from optimizer.unit_commitment import load_commitment_specs, solve_commitment
from quantum.subproblem import build_subproblem


PROJECT = Path(__file__).resolve().parents[1]
BENCHMARK = PROJECT / 'data' / 'commitment_benchmark.json'
DECISIONS = [(0, 'cheap'), (0, 'local'), (1, 'cheap'), (1, 'local')]
FIXED = [[0, 1], [0, 1]]


class SubproblemTests(unittest.TestCase):
    def test_all_sixteen_schedules_and_certified_optimum(self):
        for startup, optimum in ((10, 410), (1000, 1000)):
            with self.subTest(startup=startup):
                data = json.loads(BENCHMARK.read_text())
                data['units'][0]['commitment']['startup_cost_dollars'] = startup
                temp_root = PROJECT / 'results' / 'quantum-development' / 'temp'
                temp_root.mkdir(parents=True, exist_ok=True)
                with tempfile.TemporaryDirectory(dir=temp_root) as directory:
                    path = Path(directory) / 'case.json'
                    path.write_text(json.dumps(data))
                    oracle = build_subproblem(path, FIXED, DECISIONS)
                    self.assertEqual(oracle['source_sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
                    case = load_operating_case(path)
                    milp = solve_commitment(case, load_commitment_specs(path, case))
                self.assertEqual(len(oracle['entries']), 16)
                self.assertEqual(oracle['n_bits'], 4)
                self.assertEqual(oracle['scenario']['units'][0]['commitment']['startup_cost_dollars'], startup)
                self.assertEqual(oracle['timing']['pricing_evaluations'], 16)
                self.assertEqual(oracle['bit_order'], 'q0 is the rightmost displayed bit')
                for index, entry in enumerate(oracle['entries']):
                    self.assertEqual(entry['bitstring'], f'{index:04b}')
                    self.assertEqual(entry['on'], [[(index >> 0) & 1, (index >> 1) & 1],
                                                   [(index >> 2) & 1, (index >> 3) & 1]])
                    if entry['feasible']:
                        self.assertTrue(entry['certificate']['passed'])
                        self.assertEqual(entry['pricing_result']['on'], entry['on'])
                self.assertAlmostEqual(oracle['best_objective_dollars'], optimum)
                self.assertAlmostEqual(oracle['best_objective_dollars'], milp['objective_dollars'])
                self.assertGreater(oracle['penalty_dollars'], max(
                    entry['objective_dollars'] for entry in oracle['entries'] if entry['feasible']))

    def test_nonselected_commitments_remain_fixed(self):
        oracle = build_subproblem(BENCHMARK, FIXED, [(0, 'cheap')])
        self.assertEqual([e['on'] for e in oracle['entries']],
                         [[[0, 1], [0, 1]], [[1, 1], [0, 1]]])

    def test_rejects_invalid_decisions_and_shape(self):
        for decisions in ([(0, 'cheap'), (0, 'cheap')], [(2, 'cheap')],
                          [(0, 'unknown')], [(0, 'cheap')] * 9):
            with self.subTest(decisions=decisions), self.assertRaises(ValueError):
                build_subproblem(BENCHMARK, FIXED, decisions)
        with self.assertRaises(ValueError):
            build_subproblem(BENCHMARK, [[0, 1]], [(0, 'cheap')])

    def test_no_feasible_schedule_is_rejected(self):
        data = json.loads(BENCHMARK.read_text())
        for interval in data['intervals']:
            interval['demand_mw'] = [0, 1000]
        temp_root = PROJECT / 'results' / 'quantum-development' / 'temp'
        temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temp_root) as directory:
            path = Path(directory) / 'impossible.json'
            path.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'No feasible'):
                build_subproblem(path, FIXED, [(0, 'cheap')])

    def test_unexpected_solver_error_propagates(self):
        with patch('quantum.subproblem.price_fixed_commitment', side_effect=RuntimeError('solver crashed')):
            with self.assertRaisesRegex(RuntimeError, 'solver crashed'):
                build_subproblem(BENCHMARK, FIXED, [(0, 'cheap')])
        with patch('quantum.subproblem.price_fixed_commitment', side_effect=RuntimeError(
                'Conditional pricing infeasible: Infeasible-looking solver crash')):
            with self.assertRaisesRegex(RuntimeError, 'solver crash'):
                build_subproblem(BENCHMARK, FIXED, [(0, 'cheap')])

    def test_known_fixed_bound_conflict_is_infeasible(self):
        data = json.loads(BENCHMARK.read_text())
        data['units'][0]['available'][0] = False
        temp_root = PROJECT / 'results' / 'quantum-development' / 'temp'
        temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temp_root) as directory:
            path = Path(directory) / 'unavailable.json'
            path.write_text(json.dumps(data))
            oracle = build_subproblem(path, FIXED, [(0, 'cheap')])
        self.assertTrue(oracle['entries'][0]['feasible'])
        self.assertFalse(oracle['entries'][1]['feasible'])
        self.assertIn('Fixed commitment conflicts', oracle['entries'][1]['infeasibility_reason'])


if __name__ == '__main__':
    unittest.main()
