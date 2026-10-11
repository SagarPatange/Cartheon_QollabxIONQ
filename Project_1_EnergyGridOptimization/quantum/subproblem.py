"""Classically prepare a certified finite commitment cost oracle."""
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np

from optimizer.multihour_dispatch import load_operating_case
from optimizer.reserve_coupling import load_reserve_case
from optimizer.unit_commitment import load_commitment_specs, price_fixed_commitment


def build_subproblem(case_path, fixed_on, decisions, *, reserve_enabled=False) -> dict:
    """Enumerate at most eight selected statuses, with q0 as the low bit.

    Each feasible entry retains the full original-parameter pricing result and
    certificate. Preparation performs 2**n classical LPs, so it is not a
    scalable quantum oracle.
    """
    started = time.perf_counter()
    path = Path(case_path)
    raw = path.read_bytes()
    scenario = json.loads(raw)
    case = load_operating_case(path)
    specs = load_commitment_specs(path, case)
    reserve = load_reserve_case(path, case) if reserve_enabled else None
    horizon, unit_count = len(case.curves), len(case.units)
    unit_index = {unit.unit_id: i for i, unit in enumerate(case.units)}
    fixed = np.asarray(fixed_on)
    if fixed.shape != (horizon, unit_count) or not np.all(np.isin(fixed, [0, 1])):
        raise ValueError('fixed_on must be a complete binary horizon-by-unit matrix')
    if not isinstance(decisions, (tuple, list)) or not 1 <= len(decisions) <= 8:
        raise ValueError('Select between one and eight commitment decisions')
    normalized = []
    for decision in decisions:
        if not isinstance(decision, (tuple, list)) or len(decision) != 2:
            raise ValueError('Each decision must be an (interval_index, unit_id) pair')
        interval, unit_id = decision
        if (type(interval) is not int or not 0 <= interval < horizon
                or type(unit_id) is not str or unit_id not in unit_index):
            raise ValueError(f'Unknown or out-of-range commitment decision: {decision!r}')
        normalized.append((interval, unit_id))
    if len(set(normalized)) != len(normalized):
        raise ValueError('Duplicate commitment decision')

    entries = []
    for index in range(1 << len(normalized)):
        on = fixed.astype(int).copy()
        for bit, (interval, unit_id) in enumerate(normalized):
            on[interval, unit_index[unit_id]] = (index >> bit) & 1
        entry = dict(index=index, bitstring=f'{index:0{len(normalized)}b}',
                     on=on.tolist(), feasible=False, objective_dollars=None,
                     certificate=None, pricing_result=None)
        try:
            pricing = price_fixed_commitment(case, specs, on, reserve=reserve)
        except RuntimeError as exc:
            message = str(exc)
            if ('HiGHS Status 8:' in message and 'Infeasible' in message) or message == (
                    'Fixed commitment conflicts with initial state/availability/terminal policy'):
                entry['infeasibility_reason'] = message
            else:
                raise
        else:
            objective = float(pricing['objective_dollars'])
            certificate = pricing['verification']
            if not math.isfinite(objective) or not certificate['passed']:
                raise RuntimeError('Fixed pricing returned an invalid objective or certificate')
            entry.update(feasible=True, objective_dollars=objective,
                         certificate=certificate, pricing_result=pricing)
        entries.append(entry)

    feasible = [entry['objective_dollars'] for entry in entries if entry['feasible']]
    if not feasible:
        raise ValueError('No feasible schedules in the selected commitment neighborhood')
    lowest, highest = min(feasible), max(feasible)
    penalty = highest + max(1., highest - lowest, abs(highest) * 0.01)
    costs = [entry['objective_dollars'] if entry['feasible'] else penalty for entry in entries]
    best_indices = [entry['index'] for entry in entries
                    if entry['feasible'] and abs(entry['objective_dollars'] - lowest) <= 1e-7]
    elapsed = time.perf_counter() - started
    return dict(scenario=scenario, source_path=str(path), source_sha256=hashlib.sha256(raw).hexdigest(),
                fixed_on=fixed.astype(int).tolist(), reserve_enabled=bool(reserve_enabled),
                n_bits=len(normalized), bit_order='q0 is the rightmost displayed bit',
                decisions=[dict(bit=bit, interval_index=h, unit_id=uid, unit_index=unit_index[uid])
                           for bit, (h, uid) in enumerate(normalized)],
                entries=entries, costs=costs, penalty_dollars=penalty,
                best_objective_dollars=lowest, optimal_indices=best_indices,
                timing=dict(preparation_seconds=elapsed, pricing_evaluations=len(entries)))
