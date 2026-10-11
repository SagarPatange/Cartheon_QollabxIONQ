"""Continuous one-hour auction under ASSUMPTIONS.md A01-A06 and S01-S03.

Local classical baseline. This is not SPP operational market clearing.
"""

import argparse
import bisect
import csv
import hashlib
import json
import math
import platform
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.optimize import linprog

PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_HOUR = '07/01/2026 01:00:00'
ASSUMPTIONS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'S01', 'S02', 'S03']


@dataclass(frozen=True)
class Curve:
    row_id: str
    rcode: str
    side: int  # +1 signed offer, -1 nonnegative purchase bid
    points: tuple
    slope: bool

    def __post_init__(self):
        if self.side not in (-1, 1) or not self.points:
            raise ValueError(f'{self.row_id}: missing points or invalid side')
        if any(not math.isfinite(v) for point in self.points for v in point):
            raise ValueError(f'{self.row_id}: nonfinite MW/price')
        if self.side == -1 and self.points[0][0] < 0:
            raise ValueError(f'{self.row_id}: negative bid quantity needs a new interpretation')
        for a, b in zip(self.points, self.points[1:]):
            if b[0] <= a[0] or self.side * (b[1] - a[1]) < 0:
                raise ValueError(f'{self.row_id}: non-increasing MW or nonconvex prices')

    @property
    def lower(self):
        return min(0., self.points[0][0])

    @property
    def upper(self):
        return max(0., self.points[-1][0])

    def pieces(self):
        """Yield (left MW, right MW, left marginal price, price slope)."""
        cuts = sorted({self.lower, self.upper, 0., *(p[0] for p in self.points)})
        xs = [p[0] for p in self.points]
        for left, right in zip(cuts, cuts[1:]):
            if right <= left:
                continue
            idx = bisect.bisect_right(xs, (left + right) / 2)
            if idx == 0:
                price, gradient = self.points[0][1], 0.
            elif idx == len(xs):
                price, gradient = self.points[-1][1], 0.
            elif self.slope:
                x0, p0 = self.points[idx - 1]
                x1, p1 = self.points[idx]
                gradient = (p1 - p0) / (x1 - x0)
                price = p0 + gradient * (left - x0)
            else:
                price, gradient = self.points[idx][1], 0.
            yield left, right, price, gradient

    def integral(self, quantity):
        """Integral from zero to quantity, in dollars for this one-hour study."""
        total = 0.
        lo, hi = sorted((0., quantity))
        for left, right, price, gradient in self.pieces():
            a, b = max(left, lo), min(right, hi)
            if b > a:
                total += price * (b - a) + .5 * gradient * ((b - left)**2 - (a - left)**2)
        return total if quantity >= 0 else -total

    def lagrangian_minimum(self, clearing_price):
        """Independent per-curve minimum for a dual lower-bound certificate."""
        candidates = [self.lower, self.upper]
        for left, right, price, gradient in self.pieces():
            candidates.extend((left, right))
            if gradient:
                q = left + (clearing_price - price) / gradient
                if left <= q <= right:
                    candidates.append(q)
        return min(self.side * (self.integral(q) - clearing_price * q) for q in candidates)


def curve_from_row(r, row_id):
    """Parse one submission using the same conventions as the CSV loader."""
    prefix = r['RCode'][:2]
    if prefix not in ('0_', '1_') or r['Use_Bid_Slope'] not in ('0', '1'):
        raise ValueError(f'{row_id}: unknown prefix or slope flag')
    points, blank_seen = [], False
    for i in range(1, 11):
        mw, price = r.get(f'MW{i}', ''), r.get(f'Price{i}', '')
        if bool(mw) != bool(price) or (mw and blank_seen):
            raise ValueError(f'{row_id}: incomplete or noncontiguous curve')
        if mw:
            points.append((float(mw), float(price)))
        else:
            blank_seen = True
    return Curve(row_id, r['RCode'], 1 if prefix == '1_' else -1,
                 tuple(points), r['Use_Bid_Slope'] == '1')


def load_curves(path, hour):
    curves = []
    with Path(path).open(newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        required = {'CPTHourEnd', 'GMTHourEnd', 'RCode', 'Use_Bid_Slope'} | {
            field for i in range(1, 11) for field in (f'MW{i}', f'Price{i}')}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Missing required energy-offer columns')
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError('Duplicate CSV column names')
        for row_number, r in enumerate(reader, 1):
            if None in r or any(value is None for value in r.values()):
                raise ValueError(f'data-row-{row_number}: malformed CSV field count')
            if r['CPTHourEnd'] != hour:
                continue
            row_id = f'{Path(path).name}:data-row-{row_number}'
            curves.append(curve_from_row(r, row_id))
    if not curves:
        raise ValueError(f'No curves for hour {hour!r}')
    return curves


def _solve_numerical(curves, *, fixed_demand_mw=0.):
    """Solve a separable convex auction through bounded incremental segments.

    Monotonic marginal objectives fill cheaper segments first without binary
    sequencing. Equal-price ties may allocate segments differently, but produce
    identical row quantities and integrated cost. Verification checks this.
    """
    start = time.perf_counter()
    if not math.isfinite(fixed_demand_mw) or fixed_demand_mw < 0:
        raise ValueError('Fixed demand must be finite and nonnegative')
    if not curves:
        raise ValueError('At least one curve is required')
    max_balance = sum(c.upper if c.side == 1 else -c.lower for c in curves)
    if fixed_demand_mw > max_balance:
        raise ValueError(f'Fixed demand {fixed_demand_mw} MW exceeds available net supply {max_balance} MW')
    linear, quadratic, widths, balance, owners = [], [], [], [], []
    constant = sum(c.side * c.integral(c.lower) for c in curves)
    rhs = fixed_demand_mw - sum(c.side * c.lower for c in curves)
    for i, c in enumerate(curves):
        for left, right, price, gradient in c.pieces():
            linear.append(c.side * price)
            quadratic.append(c.side * gradient)
            widths.append(right - left)
            balance.append(c.side)
            owners.append(i)
    linear, quadratic, widths, balance = map(np.asarray, (linear, quadratic, widths, balance))
    n = len(widths)
    if not n:
        x, price, status, solver, iterations = np.zeros(0), 0., 'trivial', 'none', 0
    elif not np.any(quadratic):
        result = linprog(linear, A_eq=sparse.csr_matrix(balance.reshape(1, -1)),
                         b_eq=[rhs], bounds=list(zip(np.zeros(n), widths)), method='highs')
        if not result.success:
            raise RuntimeError(f'HiGHS failed: {result.message}')
        x, price = result.x, float(result.eqlin.marginals[0])
        status, solver, iterations = result.message, 'HiGHS (SciPy linprog)', result.nit
    else:
        import osqp
        # Unit conversion only: z=x/100 MW; objective divided by 100*1000.
        mw_scale, price_scale = 100., 1000.
        a = sparse.vstack([sparse.csc_matrix(balance.reshape(1, -1)), sparse.eye(n)], format='csc')
        qp = osqp.OSQP()
        qp.setup(P=sparse.diags(quadratic * mw_scale / price_scale, format='csc'),
                 q=linear / price_scale, A=a,
                 l=np.r_[rhs / mw_scale, np.zeros(n)],
                 u=np.r_[rhs / mw_scale, widths / mw_scale],
                 eps_abs=1e-10, eps_rel=1e-10, max_iter=200000,
                 adaptive_rho_interval=1000,
                 polishing=True, verbose=False, time_limit=60.)
        result = qp.solve(raise_error=False)
        if result.info.status != 'solved':
            raise RuntimeError(f'OSQP did not certify solved: {result.info.status}')
        x, price = result.x * mw_scale, -float(result.y[0]) * price_scale
        status, solver, iterations = result.info.status, 'OSQP', result.info.iter
    quantities = np.array([c.lower for c in curves], dtype=float)
    np.add.at(quantities, np.asarray(owners, dtype=int), x)
    segment_objective = constant + float(linear @ x + .5 * quadratic @ (x*x))
    return dict(solver=solver, status=status, iterations=int(iterations),
                elapsed_seconds=time.perf_counter() - start, segments=n,
                quantities=quantities.tolist(), clearing_price_dollars_per_mwh=price,
                fixed_demand_mw=float(fixed_demand_mw),
                objective_dollars=segment_objective)


def solve(curves, *, fixed_demand_mw=0.):
    """Accept only certified awards; use exact marginal clearing if QP fails.

    Both methods solve the same submitted-curve model. Preserve rejected solver
    diagnostics, never clip infeasible awards or claim fallback is an independent
    optimizer comparison.
    """
    started = time.perf_counter()
    diagnostic = None
    try:
        result = _solve_numerical(curves, fixed_demand_mw=fixed_demand_mw)
        check = verify(curves, result)
        if check['passed']:
            result['numerical_optimizer_verified'] = True
            return result
        diagnostic = {k: v for k, v in result.items() if k != 'quantities'}
        diagnostic['verification'] = check
    except RuntimeError as error:
        diagnostic = {'error': str(error)}
    result = clearing_oracle(curves, fixed_demand_mw=fixed_demand_mw)
    result['numerical_optimizer_verified'] = False
    result['rejected_numerical_attempt'] = diagnostic
    result['elapsed_seconds'] = time.perf_counter()-started
    return result


def clearing_oracle(curves, *, fixed_demand_mw=0.):
    """Independent scalar-price clearing for this separable convex model.

    Evaluate each curve's analytical marginal response, search the monotone
    net-supply response, and allocate flat-price ties to meet fixed demand.
    No optimization matrices, price calibration, or curve linearization.
    Different valid dual prices can support the same optimal awards.
    """
    started = time.perf_counter()
    if not curves or not math.isfinite(fixed_demand_mw) or fixed_demand_mw < 0:
        raise ValueError('Require curves and finite nonnegative fixed demand')
    max_supply = sum(c.upper if c.side == 1 else -c.lower for c in curves)
    if fixed_demand_mw > max_supply:
        raise ValueError('Fixed demand exceeds available net supply')
    pieces = [list(c.pieces()) for c in curves]
    prices = [p for c in curves for _, p in c.points]
    low, high = min(prices)-1., max(prices)+1.
    price_tolerance, balance_tolerance = 1e-10, 1e-8
    for iteration in range(1, 121):
        price = (low+high)/2
        intervals, net_low, net_high = [], 0., 0.
        for c, segments in zip(curves, pieces):
            qlow = qhigh = c.lower
            for left, right, marginal, gradient in segments:
                width = right-left
                linear = c.side*(marginal-price)
                curvature = c.side*gradient
                if curvature:
                    increment = max(0., min(width, -linear/curvature))
                    qlow += increment
                    qhigh += increment
                elif linear < -price_tolerance:
                    qlow += width
                    qhigh += width
                elif abs(linear) <= price_tolerance:
                    qhigh += width
            intervals.append((qlow, qhigh))
            net_low += qlow if c.side == 1 else -qhigh
            net_high += qhigh if c.side == 1 else -qlow
        if net_low-balance_tolerance <= fixed_demand_mw <= net_high+balance_tolerance:
            quantities = [a if c.side == 1 else b for c, (a, b) in zip(curves, intervals)]
            remaining = fixed_demand_mw-net_low
            for i, (c, (a, b)) in enumerate(zip(curves, intervals)):
                amount = min(max(remaining, 0.), b-a)
                quantities[i] += c.side*amount
                remaining -= amount
            result = dict(solver='Independent marginal-response clearing', status='solved',
                          quantities=quantities, fixed_demand_mw=float(fixed_demand_mw),
                          clearing_price_dollars_per_mwh=price,
                          objective_dollars=sum(c.side*c.integral(q) for c, q in zip(curves, quantities)),
                          iterations=iteration, segments=sum(map(len, pieces)),
                          elapsed_seconds=time.perf_counter()-started)
            check = verify(curves, result)
            if not check['passed']:
                raise RuntimeError(f'Independent clearing failed verification: {check}')
            return result
        if net_high < fixed_demand_mw:
            low = price
        else:
            high = price
    raise RuntimeError('Independent clearing did not converge; no result accepted')


def verify(curves, result):
    """Reevaluate original curves and a dual bound, independently of the QP matrix."""
    quantities = result['quantities']
    if len(quantities) != len(curves) or not all(math.isfinite(q) for q in quantities):
        return {'passed': False, 'error': 'missing/nonfinite awards'}
    fixed = result.get('fixed_demand_mw', 0.)
    if not math.isfinite(fixed) or fixed < 0:
        return {'passed': False, 'error': 'invalid fixed demand'}
    imbalance = abs(sum(c.side * q for c, q in zip(curves, quantities)) - fixed)
    bounds = max(max(c.lower-q, q-c.upper, 0.) for c, q in zip(curves, quantities))
    objective = sum(c.side * c.integral(q) for c, q in zip(curves, quantities))
    integral_error = abs(objective - result['objective_dollars'])
    price = result['clearing_price_dollars_per_mwh']
    dual_bound = sum(c.lagrangian_minimum(price) for c in curves) + price * fixed
    gap = objective - dual_bound
    dollar_tolerance = max(.05, abs(objective) * 1e-8)
    return dict(passed=bool(imbalance <= 1e-5 and bounds <= 1e-6
                           and integral_error <= dollar_tolerance
                           and -dollar_tolerance <= gap <= dollar_tolerance),
                balance_error_mw=imbalance, bound_error_mw=bounds,
                original_curve_objective_dollars=objective,
                segment_vs_integral_error_dollars=integral_error,
                dual_lower_bound_dollars=dual_bound, primal_dual_gap_dollars=gap,
                tolerances=dict(balance_mw=1e-5, bounds_mw=1e-6, dollars=dollar_tolerance))


def run(hour=DEFAULT_HOUR, *, source=None, output_root=None, fixed_demand_mw=0., full_hour_only=False):
    started = time.perf_counter()
    source = Path(source) if source else PROJECT / 'data' / 'DA-ENERGY-OFFERS-202607010100.csv'
    output_root = Path(output_root) if output_root else PROJECT / 'results'
    if not output_root.resolve().is_relative_to(PROJECT):
        raise ValueError('Results must remain inside this project folder')
    curves = load_curves(source, hour)
    studies = []
    selections = [('full_hour', curves)] if full_hour_only else [
        ('block_only_subset', [c for c in curves if not c.slope]), ('full_hour', curves)]
    for label, selected in selections:
        if not selected:
            raise ValueError(f'{label}: no submissions; choose an hour with block curves')
        result = solve(selected, fixed_demand_mw=fixed_demand_mw)
        check = verify(selected, result)
        if not check['passed']:
            raise RuntimeError(f'{label}: independent verification failed: {check}')
        result['verification'] = check
        result['rows'] = len(selected)
        result['offer_rows'] = sum(c.side == 1 for c in selected)
        result['bid_rows'] = sum(c.side == -1 for c in selected)
        result['slope_rows'] = sum(c.slope for c in selected)
        result['gross_positive_offer_mw'] = sum(max(q, 0.) for c, q in zip(selected, result['quantities']) if c.side == 1)
        result['offer_withdrawal_mw'] = -sum(min(q, 0.) for c, q in zip(selected, result['quantities']) if c.side == 1)
        result['purchase_bid_mw'] = sum(q for c, q in zip(selected, result['quantities']) if c.side == -1)
        result['integrated_offer_cost_dollars'] = sum(c.integral(q) for c, q in zip(selected, result['quantities']) if c.side == 1)
        result['integrated_purchase_bid_value_dollars'] = sum(c.integral(q) for c, q in zip(selected, result['quantities']) if c.side == -1)
        studies.append((label, selected, result))
        print(f"{label}: {result['rows']} rows, {result['solver']}, "
              f"objective ${result['objective_dollars']:,.6f}, verified={check['passed']}", flush=True)
    output_root.mkdir(parents=True, exist_ok=True)
    run_name = datetime.now(timezone.utc).strftime('run-%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
    output = output_root / run_name
    reports = {}
    # Publish a complete, unique run directory only after all selected studies pass.
    # A solver or write failure cannot replace any earlier report or award file.
    with tempfile.TemporaryDirectory(prefix='.pending-', dir=output_root) as staging:
        stage = Path(staging)
        for label, selected, result in studies:
            awards_name = f'{label}_awards.csv'
            with (stage / awards_name).open('w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['row_id', 'RCode', 'side', 'use_bid_slope', 'lower_mw', 'upper_mw',
                                 'cleared_mw', 'integrated_cost_or_value_dollars'])
                for c, q in zip(selected, result.pop('quantities')):
                    writer.writerow([c.row_id, c.rcode, 'offer' if c.side == 1 else 'bid',
                                     int(c.slope), c.lower, c.upper, q, c.integral(q)])
            result['awards_file'] = awards_name
            reports[label] = result
        report = dict(hour_ending_cpt=hour, duration_hours=1,
                  interpretation='Simplified offer-bounded single-node auction; not SPP operational clearing or historical LMPs.',
                  objective='Minimize integrated offer cost minus integrated purchase-bid value; not production cost alone.',
                  assumptions=ASSUMPTIONS + (['A07', 'A09'] if fixed_demand_mw else []),
                  fixed_demand_mw=float(fixed_demand_mw), source_file=source.name,
                  source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                  versions={p: version(p) for p in ('numpy', 'scipy', 'osqp')},
                  python=platform.python_version(), studies=reports,
                  output_directory=str(output.resolve()),
                  end_to_end_seconds=time.perf_counter() - started)
        (stage / 'first_hour_report.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        stage.rename(output)
    print(f'Results: {output}', flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hour', default=DEFAULT_HOUR, help='Exact CPTHourEnd string in the CSV')
    parser.add_argument('--fixed-demand-mw', type=float, default=0.,
                        help='Additional mandatory demand; assume no overlap with exported bids (A07)')
    parser.add_argument('--full-hour-only', action='store_true',
                        help='Use all submissions; omit the block-only subset study')
    args = parser.parse_args()
    run(args.hour, fixed_demand_mw=args.fixed_demand_mw, full_hour_only=args.full_hour_only)
