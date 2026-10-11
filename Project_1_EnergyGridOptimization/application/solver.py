"""Execute the existing solvers and save only independently certified results."""
import json
from pathlib import Path
import re
import time

import numpy as np

from optimizer.multihour_dispatch import load_operating_case, valid_export_arrays
from optimizer.reserve_coupling import load_reserve_case
from optimizer.unit_commitment import (load_commitment_specs, solve_commitment,
                             price_fixed_commitment, verify_commitment,
                             verify_fixed_pricing)

PROJECT = Path(__file__).resolve().parents[1]


class SolverError(RuntimeError):
    """A failed solve/export, retaining the original error as its cause."""
    status = 'error'

    def __init__(self, message, *, stage=None):
        super().__init__(message)
        self.stage = stage


class InfeasibleScenario(SolverError):
    """HiGHS explicitly established model infeasibility."""
    status = 'infeasible'


def _json(value):
    return json.dumps(value, indent=2, allow_nan=False) + '\n'


def _validate_export(case, result, *, pricing, reserves_enabled):
    """Check complete finite exports before calling residual-based certificates."""
    if not isinstance(result, dict):
        raise SolverError('Solver export must be an object')
    _json(result)  # Includes metadata and supplied certificates, not just arrays.
    t, nu, nb = len(case.curves), len(case.units), len(case.network.buses)
    shapes = {'flows_mw': (t, len(case.network.branches)),
              'unit_generation_mw': (t, nu), 'on': (t, nu),
              'starts': (t, nu), 'stops': (t, nu),
              'objective_dollars': (), 'elapsed_seconds': ()}
    if pricing:
        shapes.update(mec=(t,), mcc=(t, nb), mlc=(t, nb), nodal_prices=(t, nb),
                      dual_lower_bound_dollars=(), primal_dual_gap_dollars=())
        if 'dual' not in result or 'price_interpretation' not in result:
            raise SolverError('Incomplete conditional pricing exports')
    else:
        shapes.update(objective_bound_dollars=(), mip_gap=(), mip_node_count=())
        if 'status' not in result:
            raise SolverError('Incomplete commitment status')
    if reserves_enabled:
        shapes['reserve_mw'] = (t, nu)
    elif 'reserve_mw' in result:
        raise SolverError('Unexpected reserve awards in energy-only solve')
    if not valid_export_arrays(result, shapes):
        raise SolverError('Incomplete, malformed or nonfinite solver exports')
    if result['elapsed_seconds'] < 0:
        raise SolverError('Invalid solver duration')
    if not pricing:
        if (type(result['status']) is not str
                or result['status'] != 'Optimization terminated successfully. (HiGHS Status 7: Optimal)'):
            raise SolverError('Commitment does not report the accepted HiGHS optimal status')
        if type(result['mip_node_count']) is not int or result['mip_node_count'] < 0:
            raise SolverError('Commitment node count must be a nonnegative integer')
        if type(result['mip_gap']) not in (int, float) or not 0 <= result['mip_gap'] <= 1e-9:
            raise SolverError('Commitment gap exceeds the solver optimality tolerance')
        tolerance = max(.01, 1e-8 * abs(result['objective_dollars']))
        if abs(result['objective_dollars'] - result['objective_bound_dollars']) > tolerance:
            raise SolverError('Commitment objective and MILP bound do not close within dollar tolerance')
    if not isinstance(result.get('solver'), str) or not isinstance(result.get('terminal_policy'), str):
        raise SolverError('Incomplete solver/policy metadata')
    quantities = result.get('quantities')
    if not isinstance(quantities, list) or len(quantities) != t:
        raise SolverError('Incomplete interval quantities')
    for values, curves in zip(quantities, case.curves):
        if not valid_export_arrays({'values': values}, {'values': (len(curves),)}):
            raise SolverError('Malformed or nonfinite submission quantities')
    if not isinstance(result.get('verification'), dict) or result['verification'].get('passed') is not True:
        raise SolverError('Solver reported a failed or missing certificate')


def solve_scenario(scenario: dict, output_dir: Path) -> dict:
    """Load an exact snapshot, solve, reverify and atomically save report.json.

    output_dir must be new or empty under results/application-*. A failure may
    leave its exact scenario.json for inspection but never a completed report.
    """
    started = time.perf_counter()
    stage = 'snapshot'
    try:
        output_dir = Path(output_dir).resolve()
        results = (PROJECT / 'results').resolve()
        if not output_dir.is_relative_to(results):
            raise SolverError('Run artifacts must remain under project results/application-*')
        relative = output_dir.relative_to(results)
        if not relative.parts or not relative.parts[0].startswith('application-'):
            raise SolverError('Run artifacts require a results/application-* folder')
        if output_dir.exists() and (not output_dir.is_dir() or any(output_dir.iterdir())):
            raise SolverError('Run directory must be new or empty; prior artifacts cannot be overwritten')
        # Copy through strict JSON so caller edits cannot affect a running snapshot.
        scenario_text = _json(scenario)
        snapshot = json.loads(scenario_text)
        reserves_enabled = snapshot['application_controls']['reserves_enabled']
        if type(reserves_enabled) is not bool:
            raise SolverError('Scenario requires an explicit Boolean reserves_enabled')
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / 'scenario.json'
        path.write_text(scenario_text, encoding='utf-8')
        case = load_operating_case(path)
        specs = load_commitment_specs(path, case)
        declared_reserve = load_reserve_case(path, case)
        reserve = declared_reserve if reserves_enabled else None

        stage = 'commitment'
        commitment = solve_commitment(case, specs, reserve=reserve)
        _validate_export(case, commitment, pricing=False, reserves_enabled=reserves_enabled)
        commitment_certificate = verify_commitment(case, specs, commitment, reserve=reserve)
        if commitment_certificate.get('passed') is not True:
            raise SolverError(f'Commitment certificate failed: {commitment_certificate}')

        stage = 'conditional_pricing'
        pricing = price_fixed_commitment(case, specs, commitment['on'], reserve=reserve)
        _validate_export(case, pricing, pricing=True, reserves_enabled=reserves_enabled)
        for field in ('on', 'starts', 'stops'):
            if not np.array_equal(pricing[field], commitment[field]):
                raise SolverError(f'Conditional pricing changed fixed commitment {field}')
        pricing_certificate = verify_fixed_pricing(case, specs, pricing, reserve=reserve)
        if pricing_certificate.get('passed') is not True:
            raise SolverError(f'Conditional pricing certificate failed: {pricing_certificate}')
        tolerance = max(.01, 1e-8 * abs(commitment['objective_dollars']))
        objective_difference = abs(pricing['objective_dollars'] - commitment['objective_dollars'])
        if objective_difference > tolerance:
            raise SolverError('Fixed-commitment redispatch disagrees with MILP objective')
        stage = 'report'
        report = {
            'status': 'complete', 'scenario': snapshot,
            'commitment': commitment, 'conditional_pricing': pricing,
            'certificates': {
                'commitment': commitment_certificate,
                'conditional_pricing': pricing_certificate,
                'objective_difference_dollars': objective_difference,
                'objective_tolerance_dollars': tolerance,
            },
            'elapsed_seconds': time.perf_counter() - started,
            'reserves_enabled': reserves_enabled,
            'mapping': {
                'bus_ids': list(case.network.buses),
                'branch_names': [b.name for b in case.network.branches],
                'unit_ids': [u.unit_id for u in case.units],
                'interval_end': list(case.interval_end),
                'interval_hours': list(case.interval_hours),
                'row_ids': [[c.row_id for c in cs] for cs in case.curves],
                'row_nodes': [list(v) for v in case.nodes],
                'row_unit_ids': [list(v) for v in case.unit_ids],
                'row_types': [list(v) for v in case.row_types],
            },
        }
        report_text = _json(report)
        temporary = output_dir / 'report.json.tmp'
        temporary.write_text(report_text, encoding='utf-8')
        temporary.replace(output_dir / 'report.json')
        return report
    except SolverError as error:
        if error.stage is None:
            error.stage = stage
        raise
    except Exception as error:
        # The core uses RuntimeError for every HiGHS failure. Only the explicit
        # optimizer status is evidence of infeasibility; message prefixes alone
        # (including "Conditional pricing infeasible") are not sufficient.
        is_infeasible = (stage in ('commitment', 'conditional_pricing')
                         and isinstance(error, RuntimeError)
                         and re.search(r'\(HiGHS Status 8: model_status is Infeasible(?:;|\))', str(error)))
        error_type = InfeasibleScenario if is_infeasible else SolverError
        raise error_type(f'{stage}: {error}', stage=stage) from error
