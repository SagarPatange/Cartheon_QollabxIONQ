"""Behavioral controls tests: catch incorrect edits and permissive requests."""
import copy
import importlib
import json
import math
from pathlib import Path
import tempfile
import unittest

from optimizer.multihour_dispatch import load_operating_case
from optimizer.reserve_coupling import load_reserve_case
from optimizer.unit_commitment import load_commitment_specs

PROJECT = Path(__file__).resolve().parents[1]


class ScenarioTests(unittest.TestCase):
    def setUp(self):
        # Explicit RED assertion gives a useful feature-missing failure.
        self.assertIsNotNone(importlib.util.find_spec('application.scenarios'),
                             'Scenario adapter has not been implemented')
        self.api = importlib.import_module('application.scenarios')
        self.base = json.loads((PROJECT / 'data/operating_case.json').read_text())
        self.controls = self.api.default_controls(self.base)

    def build(self):
        return self.api.build_scenario(self.base, self.controls)

    def test_defaults_preserve_all_mathematical_inputs(self):
        result = self.build()
        metadata = result.pop('application_controls')
        self.assertEqual(result, self.base)
        self.assertFalse(metadata['reserves_enabled'])
        self.assertEqual(metadata, self.controls)
        self.assertEqual(set(metadata['units']),
                         {'test_base', 'test_mid', 'test_peak', 'test_local'})
        self.assertEqual(metadata['line_limits_mw'], {})

    def test_load_scales_every_nodal_demand_only(self):
        self.controls['load_percent'] = 125
        result = self.build()
        for before, after in zip(self.base['intervals'], result['intervals']):
            self.assertEqual(after['demand_mw'], [v * 1.25 for v in before['demand_mw']])
            self.assertEqual(after['submissions'], before['submissions'])
        self.assertEqual(result['units'], self.base['units'])

    def test_offer_changes_only_selected_unit_prices(self):
        self.controls['units']['test_mid']['offer_percent'] = 150
        expected = copy.deepcopy(self.base)
        expected['units'][1]['block_price'] = 37.5
        for interval in expected['intervals']:
            interval['submissions'][1]['points'] = [[80.0, 37.5]]
        result = self.build()
        result.pop('application_controls')
        self.assertEqual(result, expected)

    def test_ramp_changes_both_normal_rates_only(self):
        self.controls['units']['test_mid']['ramp_percent'] = 50
        expected = copy.deepcopy(self.base)
        expected['units'][1]['ramp_up_mw_per_hour'] = 10.0
        expected['units'][1]['ramp_down_mw_per_hour'] = 10.0
        result = self.build()
        result.pop('application_controls')
        self.assertEqual(result, expected)

    def test_startup_and_idle_change_named_costs_only(self):
        self.controls['units']['test_mid'].update(startup_dollars=123, no_load_dollars_per_hour=7)
        expected = copy.deepcopy(self.base)
        expected['units'][1]['commitment'].update(startup_cost_dollars=123, no_load_dollars_per_hour=7)
        result = self.build()
        result.pop('application_controls')
        self.assertEqual(result, expected)

    def test_disable_changes_all_selected_intervals_only(self):
        self.controls['units']['test_mid']['enabled'] = False
        expected = copy.deepcopy(self.base)
        expected['units'][1]['available'] = [False] * 24
        result = self.build()
        result.pop('application_controls')
        self.assertEqual(result, expected)

    def test_enable_preserves_declared_unavailable_interval(self):
        self.base['units'][1]['available'][3] = False
        result = self.build()
        self.assertFalse(result['units'][1]['available'][3])
        self.assertTrue(result['units'][1]['available'][4])

    def test_capacity_scales_maxima_and_all_matching_curve_endpoints(self):
        for interval in self.base['intervals']:
            interval['submissions'][2]['points'] = [[30.0, 35.0], [60.0, 45.0]]
        self.controls['units']['test_peak']['capacity_percent'] = 50
        result = self.build()
        self.assertEqual(result['units'][2]['maximum_mw'], [30.0] * 24)
        self.assertEqual(result['units'][2]['commitment'], self.base['units'][2]['commitment'])
        self.assertEqual(result['units'][2]['reserve'], self.base['units'][2]['reserve'])
        for interval in result['intervals']:
            self.assertEqual(interval['submissions'][2]['points'], [[15.0, 35.0], [30.0, 45.0]])

    def test_capacity_below_commitment_minimum_rejected(self):
        self.controls['units']['test_base']['capacity_percent'] = 20
        with self.assertRaises(ValueError):
            self.build()

    def test_capacity_below_physical_minimum_rejected(self):
        self.base['units'][2]['minimum_mw'] = [35.0] * 24
        self.base['units'][2]['commitment']['minimum_output_mw'] = [35.0] * 24
        self.controls['units']['test_peak']['capacity_percent'] = 50
        with self.assertRaises(ValueError):
            self.build()

    def test_capacity_below_initial_dispatch_rejected(self):
        self.base['units'][2]['initial_dispatch_mw'] = 40.0
        self.base['units'][2]['commitment']['initial_on'] = True
        self.controls['units']['test_peak']['capacity_percent'] = 50
        with self.assertRaises(ValueError):
            self.build()

    def test_capacity_below_reserve_eligibility_rejected_in_both_modes(self):
        self.controls['units']['test_peak']['capacity_percent'] = 25
        for mode in (False, True):
            self.controls['reserves_enabled'] = mode
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                self.build()

    def test_line_override_wins_over_global_multiplier(self):
        self.controls.update(line_percent=50, line_limits_mw={'4-5': 75.0})
        limits = {b['name']: b['limit_mw'] for b in self.build()['network']['branches']}
        self.assertEqual(limits['4-5'], 75.0)
        self.assertEqual(limits['1-4'], 125.0)
        self.assertEqual(limits['5-6'], 75.0)

    def test_reserve_requirements_scale_without_rewriting_eligibility_or_prices(self):
        self.controls.update(reserves_enabled=True, reserve_percent=150)
        result = self.build()
        self.assertEqual(result['reserve_requirements_mw']['north'], [7.5] * 24)
        self.assertEqual(result['reserve_requirements_mw']['south'], [15.0] * 24)
        self.assertEqual(result['units'], self.base['units'])
        self.assertTrue(result['application_controls']['reserves_enabled'])

    def test_invalid_unknown_or_missing_keys_rejected(self):
        original = copy.deepcopy(self.controls)
        cases = []
        for key in original:
            request = copy.deepcopy(original)
            del request[key]
            cases.append(request)
        request = copy.deepcopy(original)
        request['hour'] = 0
        cases.append(request)
        request = copy.deepcopy(original)
        request['units']['unknown'] = request['units'].pop('test_base')
        cases.append(request)
        request = copy.deepcopy(original)
        del request['units']['test_base']
        cases.append(request)
        request = copy.deepcopy(original)
        request['line_limits_mw']['unknown'] = 50
        cases.append(request)
        for key in original['units']['test_base']:
            request = copy.deepcopy(original)
            del request['units']['test_base'][key]
            cases.append(request)
        request = copy.deepcopy(original)
        request['units']['test_base']['invented'] = 0
        cases.append(request)
        for request in cases:
            self.controls = request
            with self.subTest(request=request), self.assertRaises(ValueError):
                self.build()

    def test_numeric_controls_reject_strings_booleans_nonfinite_and_out_of_range(self):
        fields = [('load_percent', 0, 200), ('line_percent', 1, 200),
                  ('reserve_percent', 0, 200)]
        unit_fields = [('capacity_percent', 0, 200), ('ramp_percent', 0, 200),
                       ('offer_percent', 0, 200), ('startup_dollars', 0, 10000),
                       ('no_load_dollars_per_hour', 0, 1000)]
        for unit_scope, entries in ((False, fields), (True, unit_fields)):
            for field, low, high in entries:
                for value in (True, False, '100', None, math.nan, math.inf, -math.inf, low - .01, high + .01):
                    self.controls = self.api.default_controls(self.base)
                    target = self.controls['units']['test_peak'] if unit_scope else self.controls
                    target[field] = value
                    with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                        self.build()
        for value in (True, '50', None, math.nan, math.inf, .99, 1000.01):
            self.controls = self.api.default_controls(self.base)
            self.controls['line_limits_mw'] = {'4-5': value}
            with self.subTest(line=value), self.assertRaises(ValueError):
                self.build()

    def test_boolean_controls_require_actual_booleans(self):
        for value in (0, 1, 'false', None):
            for scope in ('global', 'unit'):
                self.controls = self.api.default_controls(self.base)
                if scope == 'global':
                    self.controls['reserves_enabled'] = value
                else:
                    self.controls['units']['test_base']['enabled'] = value
                with self.subTest(scope=scope, value=value), self.assertRaises(ValueError):
                    self.build()

    def test_malformed_nested_objects_rejected(self):
        for key in ('units', 'line_limits_mw'):
            for value in (None, [], 'bad'):
                self.controls = self.api.default_controls(self.base)
                self.controls[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    self.build()
        self.controls = self.api.default_controls(self.base)
        self.controls['units']['test_base'] = None
        with self.assertRaises(ValueError):
            self.build()
        for request in (None, [], 'bad'):
            with self.subTest(request=request), self.assertRaises(ValueError):
                self.api.build_scenario(self.base, request)

    def test_domain_endpoints_are_accepted_when_physically_consistent(self):
        for field, endpoints in [('load_percent', (0, 200)), ('line_percent', (1, 200)),
                                 ('reserve_percent', (0, 200))]:
            for endpoint in endpoints:
                self.controls = self.api.default_controls(self.base)
                self.controls[field] = endpoint
                self.build()
        for field, endpoints in [('capacity_percent', (0, 200)), ('ramp_percent', (0, 200)),
                                 ('offer_percent', (0, 200)), ('startup_dollars', (0, 10000)),
                                 ('no_load_dollars_per_hour', (0, 1000))]:
            self.base['units'][2]['reserve']['eligible_mw'] = [0.0] * 24
            for endpoint in endpoints:
                self.controls = self.api.default_controls(self.base)
                self.controls['units']['test_peak'][field] = endpoint
                self.build()
        for endpoint in (1, 1000):
            self.controls = self.api.default_controls(self.base)
            self.controls['line_limits_mw']['4-5'] = endpoint
            self.build()

    def test_base_controls_and_returned_metadata_do_not_alias(self):
        before = copy.deepcopy(self.base)
        self.controls['load_percent'] = 125
        controls_before = copy.deepcopy(self.controls)
        result = self.build()
        self.assertEqual(self.base, before)
        self.assertEqual(self.controls, controls_before)
        result['application_controls']['units']['test_base']['enabled'] = False
        result['units'][0]['maximum_mw'][0] = 1
        self.assertEqual(self.base, before)
        self.assertEqual(self.controls, controls_before)

    def test_configuration_has_independent_case_domains_and_complete_schematic(self):
        config = self.api.configuration(self.base)
        self.assertEqual(config['base_case'], self.base)
        self.assertEqual(config['default_controls'], self.controls)
        self.assertEqual(config['domains']['load_percent'], {'min': 0, 'max': 200})
        self.assertEqual(config['domains']['line_limits_mw'], {'min': 1, 'max': 1000})
        coordinates = config['display']['bus_coordinates']
        self.assertEqual(set(coordinates), set(self.base['network']['buses']))
        self.assertEqual(len({(v['x'], v['y']) for v in coordinates.values()}), 9)
        width, height = config['display']['width'], config['display']['height']
        self.assertTrue(all(0 <= v['x'] <= width and 0 <= v['y'] <= height for v in coordinates.values()))
        self.assertFalse(config['display']['geographic'])
        config['base_case']['units'][0]['node'] = '9'
        self.assertEqual(self.base['units'][0]['node'], '1')

    def test_output_reloads_as_complete_dispatch_commitment_and_reserve_inputs(self):
        self.controls.update(load_percent=125, reserve_percent=150, reserves_enabled=True)
        self.controls['units']['test_mid']['offer_percent'] = 150
        result = self.build()
        local = PROJECT / 'results/application-development'
        local.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=local) as directory:
            snapshot = Path(directory) / 'scenario.json'
            snapshot.write_text(json.dumps(result, allow_nan=False))
            case = load_operating_case(snapshot)
            specs = load_commitment_specs(snapshot, case)
            reserve = load_reserve_case(snapshot, case)
        self.assertEqual(case.curves[0][1].points, ((80.0, 37.5),))
        self.assertEqual(specs[1].startup_cost_dollars, 300)
        self.assertEqual(reserve.requirements_mw['north'], (7.5,) * 24)


if __name__ == '__main__':
    unittest.main()
