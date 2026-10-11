"""Strict scenario controls for the declared case; see APP01-APP03 assumptions."""
from copy import deepcopy
import json
import math
from pathlib import Path
import tempfile

from optimizer.multihour_dispatch import load_operating_case
from optimizer.reserve_coupling import load_reserve_case
from optimizer.unit_commitment import load_commitment_specs

PROJECT = Path(__file__).resolve().parents[1]
UNIT_IDS = frozenset(('test_base', 'test_mid', 'test_peak', 'test_local'))
GLOBAL_DOMAINS = {
    'load_percent': {'min': 0, 'max': 200},
    'line_percent': {'min': 1, 'max': 200},
    'reserve_percent': {'min': 0, 'max': 200},
}
UNIT_DOMAINS = {
    'capacity_percent': {'min': 0, 'max': 200},
    'ramp_percent': {'min': 0, 'max': 200},
    'offer_percent': {'min': 0, 'max': 200},
    'startup_dollars': {'min': 0, 'max': 10000},
    'no_load_dollars_per_hour': {'min': 0, 'max': 1000},
}
LINE_DOMAIN = {'min': 1, 'max': 1000}
BUS_COORDINATES = {
    '1': {'x': 80, 'y': 300}, '2': {'x': 640, 'y': 30},
    '3': {'x': 820, 'y': 480}, '4': {'x': 260, 'y': 300},
    '5': {'x': 360, 'y': 480}, '6': {'x': 640, 'y': 480},
    '7': {'x': 760, 'y': 300}, '8': {'x': 640, 'y': 120},
    '9': {'x': 360, 'y': 120},
}


def _keys(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValueError(f'{label}: require exactly the declared fields/IDs')


def _number(value, domain, label):
    # Check bounds before isfinite so enormous JSON integers cannot overflow.
    if (type(value) not in (int, float)
            or not domain['min'] <= value <= domain['max']
            or not math.isfinite(value)):
        raise ValueError(f'{label}: require finite number in [{domain["min"]}, {domain["max"]}]')


def _boolean(value, label):
    if type(value) is not bool:
        raise ValueError(f'{label}: require Boolean')


def default_controls(base: dict) -> dict:
    """Return explicit original-case controls, with no selected-line overrides."""
    by_id = {unit['unit_id']: unit for unit in base['units']}
    _keys(by_id, UNIT_IDS, 'Base units')
    return {
        'load_percent': 100, 'line_percent': 100, 'reserve_percent': 100,
        'reserves_enabled': False, 'line_limits_mw': {},
        'units': {
            uid: {
                'enabled': any(unit['available']),
                'capacity_percent': 100, 'ramp_percent': 100, 'offer_percent': 100,
                'startup_dollars': unit['commitment']['startup_cost_dollars'],
                'no_load_dollars_per_hour': unit['commitment']['no_load_dollars_per_hour'],
            } for uid, unit in by_id.items()
        },
    }


def _validate_controls(base, controls):
    _keys(controls, {*GLOBAL_DOMAINS, 'reserves_enabled', 'units', 'line_limits_mw'}, 'Controls')
    for field, domain in GLOBAL_DOMAINS.items():
        _number(controls[field], domain, field)
    _boolean(controls['reserves_enabled'], 'reserves_enabled')
    _keys(controls['units'], UNIT_IDS, 'Units')
    for uid, values in controls['units'].items():
        _keys(values, {*UNIT_DOMAINS, 'enabled'}, uid)
        _boolean(values['enabled'], f'{uid}.enabled')
        for field, domain in UNIT_DOMAINS.items():
            _number(values[field], domain, f'{uid}.{field}')
    overrides = controls['line_limits_mw']
    branch_names = {branch['name'] for branch in base['network']['branches']}
    if not isinstance(overrides, dict) or not set(overrides) <= branch_names:
        raise ValueError('line_limits_mw: require a dictionary of existing branch names')
    for name, value in overrides.items():
        _number(value, LINE_DOMAIN, f'line_limits_mw.{name}')


def _validate_snapshot(scenario):
    """Use the real path-based loaders, retaining all temporary files locally."""
    directory = PROJECT / 'results/application-scenario-validation'
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=directory) as temporary:
        snapshot = Path(temporary) / 'operating_case.json'
        snapshot.write_text(json.dumps(scenario, allow_nan=False), encoding='utf-8')
        case = load_operating_case(snapshot)
        load_commitment_specs(snapshot, case)
        # Check declared eligibility even when the actual solve is energy-only.
        load_reserve_case(snapshot, case)


def build_scenario(base: dict, controls: dict) -> dict:
    """Copy, explicitly transform and validate solver inputs; never repair feasibility."""
    _validate_controls(base, controls)
    scenario = deepcopy(base)
    by_id = {unit['unit_id']: unit for unit in scenario['units']}
    _keys(by_id, UNIT_IDS, 'Base units')
    for branch in scenario['network']['branches']:
        branch['limit_mw'] = controls['line_limits_mw'].get(
            branch['name'], branch['limit_mw'] * (controls['line_percent'] / 100))
    for uid, unit in by_id.items():
        edit = controls['units'][uid]
        factor = edit['capacity_percent'] / 100
        unit['maximum_mw'] = [value * factor for value in unit['maximum_mw']]
        # The first edited interval must still accommodate the explicit initial output.
        if unit['initial_dispatch_mw'] > unit['maximum_mw'][0]:
            raise ValueError(f'{uid}: capacity below original initial dispatch')
        unit['available'] = [available and edit['enabled'] for available in unit['available']]
        for field in ('ramp_up_mw_per_hour', 'ramp_down_mw_per_hour'):
            unit[field] *= edit['ramp_percent'] / 100
        if 'block_price' in unit:
            unit['block_price'] *= edit['offer_percent'] / 100
        unit['commitment']['startup_cost_dollars'] = edit['startup_dollars']
        unit['commitment']['no_load_dollars_per_hour'] = edit['no_load_dollars_per_hour']
    for interval in scenario['intervals']:
        interval['demand_mw'] = [value * (controls['load_percent'] / 100) for value in interval['demand_mw']]
        for row in interval['submissions']:
            uid = row['unit_id']
            if uid in controls['units']:
                edit = controls['units'][uid]
                row['points'] = [[mw * (edit['capacity_percent'] / 100),
                                  price * (edit['offer_percent'] / 100)] for mw, price in row['points']]
    scenario['reserve_requirements_mw'] = {
        zone: [value * (controls['reserve_percent'] / 100) for value in values]
        for zone, values in scenario['reserve_requirements_mw'].items()
    }
    scenario['application_controls'] = deepcopy(controls)
    _validate_snapshot(scenario)
    return scenario


def configuration(base: dict) -> dict:
    """Return UI configuration with documented non-geographic case9 coordinates."""
    if set(base['network']['buses']) != set(BUS_COORDINATES):
        raise ValueError('Display coordinates require the declared nine-bus test system')
    return {
        'base_case': deepcopy(base),
        'default_controls': default_controls(base),
        'domains': deepcopy({**GLOBAL_DOMAINS, 'units': UNIT_DOMAINS,
                             'line_limits_mw': LINE_DOMAIN}),
        'display': {
            'width': 1000, 'height': 600, 'geographic': False,
            'bus_coordinates': deepcopy(BUS_COORDINATES),
            'assumption_ids': ['APP01', 'APP02', 'APP03'],
        },
    }
