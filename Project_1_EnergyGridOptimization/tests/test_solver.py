"""Real solver integration and the boundary that rejects unverified exports."""
from copy import deepcopy
import importlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from application.scenarios import build_scenario, default_controls
from optimizer.multihour_dispatch import load_operating_case
from optimizer.reserve_coupling import load_reserve_case
from optimizer.unit_commitment import load_commitment_specs, verify_commitment, verify_fixed_pricing

PROJECT = Path(__file__).resolve().parents[1]
LOCAL = PROJECT / 'results/application-solver-tests'


class SolverTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('application.solver'),
                             'Real solver adapter has not been implemented')
        self.api = importlib.import_module('application.solver')
        self.base = json.loads((PROJECT / 'data/operating_case.json').read_text())
        self.controls = default_controls(self.base)
        LOCAL.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=LOCAL)
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)

    def solve(self, name='run'):
        scenario = build_scenario(self.base, self.controls)
        return self.api.solve_scenario(scenario, self.folder / name)

    def reverify(self, folder, report):
        snapshot = folder / 'scenario.json'
        case = load_operating_case(snapshot)
        specs = load_commitment_specs(snapshot, case)
        reserve = load_reserve_case(snapshot, case) if report['reserves_enabled'] else None
        self.assertTrue(verify_commitment(case, specs, report['commitment'], reserve=reserve)['passed'])
        self.assertTrue(verify_fixed_pricing(case, specs, report['conditional_pricing'], reserve=reserve)['passed'])
        self.assertEqual(report['scenario'], json.loads(snapshot.read_text()))
        self.assertEqual(report, json.loads((folder / 'report.json').read_text()))
        return case

    def test_energy_default_reproduces_objective_and_saved_certificates(self):
        report = self.solve()
        self.assertEqual(report['status'], 'complete')
        self.assertFalse(report['reserves_enabled'])
        self.assertAlmostEqual(report['commitment']['objective_dollars'], 82039.2757548886, delta=.01)
        self.assertEqual(report['commitment']['mip_gap'], 0.)
        self.assertAlmostEqual(report['conditional_pricing']['objective_dollars'],
                               report['commitment']['objective_dollars'], delta=.01)
        self.assertTrue(report['certificates']['commitment']['passed'])
        self.assertTrue(report['certificates']['conditional_pricing']['passed'])
        self.assertGreater(report['elapsed_seconds'], 0)
        case = self.reverify(self.folder / 'run', report)
        self.assertEqual(report['mapping']['bus_ids'], list(case.network.buses))
        self.assertEqual(report['mapping']['unit_ids'], [u.unit_id for u in case.units])
        self.assertEqual(report['mapping']['branch_names'], [b.name for b in case.network.branches])
        self.assertEqual(report['mapping']['row_ids'], [[c.row_id for c in cs] for cs in case.curves])
        self.assertEqual(report['mapping']['row_nodes'], [list(v) for v in case.nodes])
        self.assertEqual(report['mapping']['row_unit_ids'], [list(v) for v in case.unit_ids])
        self.assertNotIn('reserve_mw', report['commitment'])
        json.dumps(report, allow_nan=False)

    def test_reserve_default_reproduces_objective_and_actual_headroom(self):
        self.controls['reserves_enabled'] = True
        report = self.solve()
        self.assertTrue(report['reserves_enabled'])
        self.assertAlmostEqual(report['commitment']['objective_dollars'], 84723.66483083188, delta=.01)
        self.assertEqual(report['commitment']['mip_gap'], 0.)
        case = self.reverify(self.folder / 'run', report)
        for result in (report['commitment'], report['conditional_pricing']):
            generation = np.array(result['unit_generation_mw'])
            awards = np.array(result['reserve_mw'])
            cap = np.array([u.maximum_mw for u in case.units]).T
            on = np.array(result['on'])
            self.assertLessEqual(float(np.max(generation + awards - cap * on)), 1e-5)
            self.assertGreater(float(np.sum(awards)), 0)

    def test_changed_load_changes_real_dispatch_and_reverifies_changed_inputs(self):
        original = self.solve('original')
        self.controls['load_percent'] = 110
        changed = self.solve('changed')
        self.assertGreater(changed['commitment']['objective_dollars'], original['commitment']['objective_dollars'])
        self.assertFalse(np.allclose(changed['commitment']['unit_generation_mw'],
                                    original['commitment']['unit_generation_mw']))
        self.reverify(self.folder / 'changed', changed)

    def test_reduced_branch_rating_changes_flow_or_declares_infeasibility(self):
        original = self.solve('original')
        self.controls['line_limits_mw'] = {'4-5': 25.}
        try:
            changed = self.solve('changed')
        except self.api.InfeasibleScenario:
            self.assertFalse((self.folder / 'changed/report.json').exists())
        else:
            case = self.reverify(self.folder / 'changed', changed)
            index = [b.name for b in case.network.branches].index('4-5')
            flows = np.array(changed['commitment']['flows_mw'])[:, index]
            self.assertLessEqual(float(np.max(np.abs(flows))), 25. + 1e-5)
            self.assertFalse(np.allclose(flows, np.array(original['commitment']['flows_mw'])[:, index]))

    def test_disabled_unit_cannot_receive_energy_or_reserve_awards(self):
        # At 90%, hour one needs 137.107 MW but the remaining startup ramps
        # plus the south reserve headroom permit only 45 + 40 + 50 = 135 MW.
        self.controls.update(load_percent=80, reserves_enabled=True)
        self.controls['units']['test_peak']['enabled'] = False
        report = self.solve()
        self.reverify(self.folder / 'run', report)
        index = report['mapping']['unit_ids'].index('test_peak')
        for result in (report['commitment'], report['conditional_pricing']):
            np.testing.assert_allclose(np.array(result['unit_generation_mw'])[:, index], 0., atol=1e-6)
            np.testing.assert_allclose(np.array(result['reserve_mw'])[:, index], 0., atol=1e-6)
            self.assertEqual([row[index] for row in result['on']], [0] * 24)

    def test_high_load_and_disabled_units_raise_typed_infeasible_without_report(self):
        self.controls['load_percent'] = 200
        for uid in ('test_mid', 'test_peak', 'test_local'):
            self.controls['units'][uid]['enabled'] = False
        with self.assertRaises(self.api.InfeasibleScenario) as raised:
            self.solve()
        self.assertEqual(raised.exception.status, 'infeasible')
        self.assertIsInstance(raised.exception.__cause__, RuntimeError)
        self.assertIn('HiGHS Status 8', str(raised.exception))
        self.assertTrue((self.folder / 'run/scenario.json').exists())
        self.assertFalse((self.folder / 'run/report.json').exists())

    def test_unexpected_solver_errors_preserve_cause_and_are_not_infeasible(self):
        for message in ('Conditional pricing infeasible: Time limit reached (HiGHS Status 13)',
                        'Commitment certificate failed: infeasible-looking failure'):
            error = RuntimeError(message)
            with self.subTest(message=message), patch.object(self.api, 'solve_commitment', side_effect=error):
                with self.assertRaises(self.api.SolverError) as raised:
                    self.solve(str(len(list(self.folder.iterdir()))))
                self.assertNotIsInstance(raised.exception, self.api.InfeasibleScenario)
                self.assertEqual(raised.exception.status, 'error')
                self.assertIs(raised.exception.__cause__, error)
                self.assertIn(message, str(raised.exception))
        self.assertFalse(list(self.folder.glob('*/report.json')))

    def test_partial_nonfinite_or_corrupted_exports_never_receive_report(self):
        accepted = self.solve('reference')
        cases = [('commitment', 'objective_bound_dollars', float('nan')),
                 ('commitment', 'mip_gap', float('inf')),
                 ('commitment', 'on', None),
                 ('commitment', 'quantities', []),
                 ('commitment', 'verification', {'passed': False}),
                 ('conditional_pricing', 'nodal_prices', []),
                 ('conditional_pricing', 'dual', [float('nan')]),
                 ('conditional_pricing', 'mcc', None),
                 ('conditional_pricing', 'verification', {'passed': False})]
        for i, (section, key, value) in enumerate(cases):
            result = deepcopy(accepted[section])
            if value is None:
                del result[key]
            else:
                result[key] = value
            entrypoint = 'solve_commitment' if section == 'commitment' else 'price_fixed_commitment'
            with self.subTest(section=section, key=key), patch.object(self.api, entrypoint, return_value=result):
                with self.assertRaises(self.api.SolverError):
                    self.solve(f'rejected-{i}')
                self.assertFalse((self.folder / f'rejected-{i}/report.json').exists())

    def test_rebuilt_certificate_failure_rejects_claimed_passing_verification(self):
        accepted = self.solve('reference')
        for i, section in enumerate(('commitment', 'conditional_pricing')):
            corrupted = deepcopy(accepted[section])
            corrupted['flows_mw'][0][0] += 1.
            self.assertTrue(corrupted['verification']['passed'])
            entrypoint = 'solve_commitment' if section == 'commitment' else 'price_fixed_commitment'
            with self.subTest(section=section), patch.object(self.api, entrypoint, return_value=corrupted):
                with self.assertRaises(self.api.SolverError):
                    self.solve(f'bad-certificate-{i}')
                self.assertFalse((self.folder / f'bad-certificate-{i}/report.json').exists())

    def test_open_milp_gap_rejected_despite_passing_primal_and_pricing(self):
        accepted = self.solve('reference')
        for i, gap in enumerate((.75, 1.1e-9, False)):
            corrupted = deepcopy(accepted['commitment'])
            corrupted['mip_gap'] = gap
            with self.subTest(gap=gap), patch.object(self.api, 'solve_commitment', return_value=corrupted):
                with self.assertRaises(self.api.SolverError):
                    self.solve(f'open-gap-{i}')
                self.assertFalse((self.folder / f'open-gap-{i}/report.json').exists())

    def test_unclosed_milp_bound_rejected_despite_passing_primal_and_pricing(self):
        accepted = self.solve('reference')
        for i, difference in enumerate((-100000., -.02, .02)):
            corrupted = deepcopy(accepted['commitment'])
            corrupted['objective_bound_dollars'] += difference
            with self.subTest(difference=difference), patch.object(self.api, 'solve_commitment', return_value=corrupted):
                with self.assertRaises(self.api.SolverError):
                    self.solve(f'open-bound-{i}')
                self.assertFalse((self.folder / f'open-bound-{i}/report.json').exists())

    def test_invalid_optimal_status_and_node_count_cannot_mark_report_complete(self):
        accepted = self.solve('reference')
        mutations = [('status', None), ('status', 7), ('status', ''),
                     ('status', 'Time limit reached (HiGHS Status 13)'),
                     ('mip_node_count', .5), ('mip_node_count', True),
                     ('mip_node_count', '1'), ('mip_node_count', -1)]
        for i, (key, value) in enumerate(mutations):
            corrupted = deepcopy(accepted['commitment'])
            corrupted[key] = value
            with self.subTest(key=key, value=value), patch.object(self.api, 'solve_commitment', return_value=corrupted):
                with self.assertRaises(self.api.SolverError):
                    self.solve(f'invalid-optimality-{i}')
                self.assertFalse((self.folder / f'invalid-optimality-{i}/report.json').exists())

    def test_objective_disagreement_rejected_even_with_claimed_certificates(self):
        accepted = self.solve('reference')
        corrupted = deepcopy(accepted['conditional_pricing'])
        corrupted['objective_dollars'] += 100.
        with patch.object(self.api, 'price_fixed_commitment', return_value=corrupted), \
                patch.object(self.api, 'verify_fixed_pricing', return_value={'passed': True}):
            with self.assertRaises(self.api.SolverError):
                self.solve('disagreement')
        self.assertFalse((self.folder / 'disagreement/report.json').exists())

    def test_nonfinite_scenario_or_ambiguous_reserve_mode_is_rejected(self):
        for i, mode in enumerate((None, 'false', 1)):
            scenario = build_scenario(self.base, self.controls)
            if mode is None:
                del scenario['application_controls']['reserves_enabled']
            else:
                scenario['application_controls']['reserves_enabled'] = mode
            with self.subTest(mode=mode), self.assertRaises(self.api.SolverError):
                self.api.solve_scenario(scenario, self.folder / f'mode-{i}')
        scenario = build_scenario(self.base, self.controls)
        scenario['intervals'][0]['demand_mw'][0] = float('nan')
        with self.assertRaises(self.api.SolverError):
            self.api.solve_scenario(scenario, self.folder / 'nonfinite')
        self.assertFalse(list(self.folder.glob('*/report.json')))

    def test_artifact_scope_and_reuse_cannot_overwrite_prior_results(self):
        scenario = build_scenario(self.base, self.controls)
        for target in (PROJECT / 'results', PROJECT / 'results/nonapplication', PROJECT.parent / 'escaped'):
            with self.subTest(target=target), self.assertRaises(self.api.SolverError):
                self.api.solve_scenario(scenario, target)
        accepted = self.solve()
        before = (self.folder / 'run/report.json').read_bytes()
        with self.assertRaises(self.api.SolverError):
            self.api.solve_scenario(scenario, self.folder / 'run')
        self.assertEqual((self.folder / 'run/report.json').read_bytes(), before)
        self.assertEqual(json.loads(before), accepted)


if __name__ == '__main__':
    unittest.main()
