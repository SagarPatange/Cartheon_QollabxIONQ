"""Full-day, unfitted validation of the strongest currently supported auction.

SPP-only and pooled fixed-demand cases remain scope sensitivities, not region-
identified operational replays. Historical price columns never enter a solve.
"""

import csv
import hashlib
import json
import math
import platform
import statistics
import time
import uuid
from datetime import datetime, timezone
from importlib.metadata import version

from energy_auction import PROJECT, clearing_oracle, load_curves, solve, verify


def main():
    started = time.perf_counter()
    files = {name: PROJECT / 'data' / name for name in [
        'DA-ENERGY-OFFERS-202607010100.csv', 'DA-OR-OFFERS-202607010100.csv',
        'DA-MC-202607010100.csv', 'DA-LMP-SL-202607010100.csv', 'DA-BC-202607010100.csv']}
    tables = {}
    for name, path in files.items():
        with path.open(newline='', encoding='utf-8-sig') as f:
            tables[name] = list(csv.DictReader(f))
    energy = tables['DA-ENERGY-OFFERS-202607010100.csv']
    history = tables['DA-MC-202607010100.csv']
    locations = tables['DA-LMP-SL-202607010100.csv']
    reserves = tables['DA-OR-OFFERS-202607010100.csv']
    constraints = tables['DA-BC-202607010100.csv']
    hour_map = {}
    for r in energy:
        if r['GMTHourEnd'] in hour_map and hour_map[r['GMTHourEnd']] != r['CPTHourEnd']:
            raise ValueError('Ambiguous UTC interval in energy source')
        hour_map[r['GMTHourEnd']] = r['CPTHourEnd']
    hours = sorted(hour_map, key=lambda s: datetime.strptime(s, '%m/%d/%Y %H:%M:%S'))
    if len(hours) != 24:
        raise ValueError('Expected the complete 24-hour operating day')
    output = PROJECT / 'results' / (
        datetime.now(timezone.utc).strftime('fidelity-%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8])
    output.mkdir(parents=True)
    assumptions = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09',
                   'A10', 'A11', 'A12', 'A13', 'A14', 'S01', 'S02', 'S03', 'H01', 'H02']
    manifest = dict(assumptions=assumptions, python=platform.python_version(),
                    versions={p: version(p) for p in ('numpy', 'scipy', 'osqp')},
                    input_sha256={name: hashlib.sha256(path.read_bytes()).hexdigest()
                                  for name, path in files.items()},
                    guide_source='https://spp.org/Documents/75871/SPP%20Markets%20Public%20Data%20Guide%20and%20Samples%20v36%201.zip',
                    guide_sha256=hashlib.sha256((PROJECT/'data/reference/SPP_Public_Data_Guide_v36.zip').read_bytes()).hexdigest(),
                    interpretation='24 independent hourly continuous auctions; no validated BAA/physical mapping, network, commitment, reserve capability, or inter-hour constraints.',
                    price_calibration=False, status='running')
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    results, audits = [], []
    awards_file = output / 'hourly_awards.csv'
    with awards_file.open('w', newline='', encoding='utf-8') as awards_handle:
        awards = csv.writer(awards_handle)
        awards.writerow(['utc_hour_end', 'scenario', 'row_id', 'RCode', 'side',
                         'lower_mw', 'upper_mw', 'cleared_mw', 'integrated_cost_or_value_dollars'])
        for utc in hours:
            hour = hour_map[utc]
            mc = [r for r in history if r['GMTIntervalEnd']==utc]
            by_baa = {r['BAA']: r for r in mc}
            if len(mc)!=2 or set(by_baa)!= {'SPP', 'SWPW'}:
                raise ValueError(f'{utc}: missing or duplicate historical BAA row')
            reference = {}
            for baa in ('SPP', 'SWPW'):
                lp = [r for r in locations if r['GMTIntervalEnd']==utc and r['BAA']==baa]
                if not lp:
                    raise ValueError(f'{utc}: missing {baa} prices')
                mecs = [float(r['MEC']) for r in lp]
                if max(mecs)-min(mecs) > .001:
                    raise ValueError(f'{utc}: MEC is not approximately uniform within {baa}')
                reference[baa] = dict(smp=float(by_baa[baa]['SMP']), mec=statistics.median(mecs),
                                      mec_min=min(mecs), mec_max=max(mecs),
                                      lmp_min=min(float(r['LMP']) for r in lp),
                                      lmp_max=max(float(r['LMP']) for r in lp))
            cs = load_curves(files['DA-ENERGY-OFFERS-202607010100.csv'], hour)
            rc = [r for r in reserves if r['GMTHourEnd']==utc]
            or_codes = {r['RCode'] for r in rc}
            bc = [r for r in constraints if r['GMTIntervalEnd']==utc]
            audit = dict(utc_hour_end=utc, cpt_hour_end=hour, energy_rows=len(cs),
                         exported_bid_capacity_mw=sum(c.upper for c in cs if c.side==-1),
                         submitted_offer_max_mw=sum(c.upper for c in cs if c.side==1),
                         historical_fixed_spp_mw=float(by_baa['SPP']['Cleared Fixed Demand Bid']),
                         historical_fixed_combined_mw=sum(float(r['Cleared Fixed Demand Bid']) for r in mc),
                         or_code_count=len(or_codes),
                         or_matched_offer_rows=sum(c.side==1 and c.rcode[2:] in or_codes for c in cs),
                         or_matched_bid_rows=sum(c.side==-1 and c.rcode[2:] in or_codes for c in cs),
                         published_binding_rows=len(bc),
                         binding_interconnects=sorted({r['Interconnect'] for r in bc}),
                         reference_prices=reference)
            audits.append(audit)
            scenarios = [('spp_fixed_scope_sensitivity', audit['historical_fixed_spp_mw']),
                         ('pooled_fixed_scope_sensitivity', audit['historical_fixed_combined_mw'])]
            for scenario, fixed in scenarios:
                oracle = clearing_oracle(cs, fixed_demand_mw=fixed)
                numerical = solve(cs, fixed_demand_mw=fixed)
                check = verify(cs, numerical)
                independent_check = verify(cs, oracle)
                difference = abs(numerical['objective_dollars']-oracle['objective_dollars'])
                tolerance = max(.1, abs(oracle['objective_dollars'])*1e-8)
                if not check['passed'] or not independent_check['passed'] or difference>tolerance:
                    raise RuntimeError(f'{utc}/{scenario}: optimizer/reference verification failed')
                s = {k: v for k, v in numerical.items() if k!='quantities'}
                s.update(utc_hour_end=utc, cpt_hour_end=hour, scenario=scenario, rows=len(cs),
                         independent_optimizer_comparison=numerical['numerical_optimizer_verified'],
                         verification=check, independent_verification=independent_check,
                         independent_objective_dollars=oracle['objective_dollars'],
                         independent_price_dollars_per_mwh=oracle['clearing_price_dollars_per_mwh'],
                         objective_difference_dollars=difference,
                         price_difference_dollars_per_mwh=abs(numerical['clearing_price_dollars_per_mwh']-
                                                             oracle['clearing_price_dollars_per_mwh']),
                         note='Different valid dual prices may exist at block discontinuities or inactive balance margins.',
                         purchase_bid_mw=sum(q for c,q in zip(cs,numerical['quantities']) if c.side==-1),
                         offer_withdrawal_mw=-sum(min(q,0.) for c,q in zip(cs,numerical['quantities']) if c.side==1),
                         historical_reference=reference)
                results.append(s)
                for c, q in zip(cs, numerical['quantities']):
                    awards.writerow([utc, scenario, c.row_id, c.rcode, c.side,
                                     c.lower, c.upper, q, c.integral(q)])
                with (output/'progress.jsonl').open('a', encoding='utf-8') as f:
                    f.write(json.dumps(s, allow_nan=False)+'\n')
            print(f"{hour}: verified both scopes; prices "
                  f"{results[-2]['clearing_price_dollars_per_mwh']:.4f}, "
                  f"{results[-1]['clearing_price_dollars_per_mwh']:.4f}; "
                  f"SPP MEC {reference['SPP']['mec']:.4f}", flush=True)
    metrics = {}
    for scenario in sorted({r['scenario'] for r in results}):
        group = [r for r in results if r['scenario']==scenario]
        metrics[scenario] = {}
        for baa in ('SPP','SWPW'):
            for kind in ('smp','mec'):
                errors = [r['clearing_price_dollars_per_mwh']-r['historical_reference'][baa][kind] for r in group]
                metrics[scenario][f'{baa}_{kind}'] = dict(hours=len(errors),
                    mean_absolute_error=statistics.mean(abs(e) for e in errors),
                    root_mean_squared_error=math.sqrt(statistics.mean(e*e for e in errors)),
                    mean_signed_error=statistics.mean(errors), maximum_absolute_error=max(abs(e) for e in errors))
    report = dict(manifest=manifest, audits=audits, hourly_results=results, metrics=metrics,
                  all_48_scenarios_verified=len(results)==48,
                  independent_optimizer_comparisons=sum(r['independent_optimizer_comparison'] for r in results),
                  certified_marginal_clearing_fallbacks=sum(not r['independent_optimizer_comparison'] for r in results),
                  maximum_optimizer_reference_objective_difference=max(
                      (r['objective_difference_dollars'] for r in results if r['independent_optimizer_comparison']), default=None),
                  elapsed_seconds=time.perf_counter()-started,
                  interpretation='Error metrics are contextual because geographic mapping is unresolved. This is not an operational SPP replay or an improvement/savings benchmark.')
    report['manifest']['status']='complete'
    (output/'fidelity_report.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
    (output/'manifest.json').write_text(json.dumps(report['manifest'], indent=2)+'\n')
    with (output/'hourly_prices.csv').open('w', newline='', encoding='utf-8') as f:
        w=csv.writer(f)
        w.writerow(['utc_hour_end','cpt_hour_end','scenario','fixed_demand_mw','modeled_price','spp_mec','spp_smp',
                    'swpw_mec','swpw_smp','verified','objective_reference_difference_dollars'])
        for r in results:
            w.writerow([r['utc_hour_end'],r['cpt_hour_end'],r['scenario'],r['fixed_demand_mw'],r['clearing_price_dollars_per_mwh'],
                        r['historical_reference']['SPP']['mec'],r['historical_reference']['SPP']['smp'],
                        r['historical_reference']['SWPW']['mec'],r['historical_reference']['SWPW']['smp'],
                        r['verification']['passed'],r['objective_difference_dollars']])
    print(f'Complete validated day: {output}', flush=True)
    print(json.dumps(metrics, indent=2), flush=True)


if __name__=='__main__':
    main()
