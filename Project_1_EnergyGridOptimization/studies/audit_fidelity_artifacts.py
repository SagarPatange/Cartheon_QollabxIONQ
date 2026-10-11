"""Rebuild certificates and metrics from published full-day awards and inputs."""
import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from optimizer.energy_auction import PROJECT, load_curves, verify


def audit(folder):
    folder = Path(folder).resolve()
    if not folder.is_relative_to(PROJECT):
        raise ValueError('Audit artifacts must remain inside this project')
    report = json.loads((folder/'fidelity_report.json').read_text())
    assert report['manifest']['status'] == 'complete'
    for name, expected in report['manifest']['input_sha256'].items():
        assert hashlib.sha256((PROJECT/'data'/name).read_bytes()).hexdigest() == expected
    groups = defaultdict(dict)
    count = 0
    with (folder/'hourly_awards.csv').open(newline='') as f:
        for row in csv.DictReader(f):
            key = (row['utc_hour_end'], row['scenario'])
            assert row['row_id'] not in groups[key], 'Duplicate source award'
            groups[key][row['row_id']] = row
            count += 1
    results = report['hourly_results']
    with (PROJECT/'data/DA-MC-202607010100.csv').open(newline='') as f:
        historical = {(r['GMTIntervalEnd'], r['BAA']): r for r in csv.DictReader(f)}
    location_mecs = defaultdict(list)
    with (PROJECT/'data/DA-LMP-SL-202607010100.csv').open(newline='') as f:
        for r in csv.DictReader(f):
            location_mecs[(r['GMTIntervalEnd'], r['BAA'])].append(float(r['MEC']))
    keys = {(r['utc_hour_end'], r['scenario']) for r in results}
    assert len(results) == len(keys) == len(groups) == 48
    assert len({r['utc_hour_end'] for r in results}) == 24
    scenarios = {'spp_fixed_scope_sensitivity', 'pooled_fixed_scope_sensitivity'}
    assert {r['scenario'] for r in results} == scenarios
    audits = {r['utc_hour_end']: r for r in report['audits']}
    certificates = []
    for r in results:
        cs = load_curves(PROJECT/'data/DA-ENERGY-OFFERS-202607010100.csv', r['cpt_hour_end'])
        rows = groups[(r['utc_hour_end'], r['scenario'])]
        assert set(rows) == {c.row_id for c in cs}
        utc = r['utc_hour_end']
        expected_demand = float(historical[(utc, 'SPP')]['Cleared Fixed Demand Bid'])
        if not r['scenario'].startswith('spp_'):
            expected_demand += float(historical[(utc, 'SWPW')]['Cleared Fixed Demand Bid'])
        assert r['fixed_demand_mw'] == expected_demand
        for baa in ('SPP', 'SWPW'):
            assert r['historical_reference'][baa]['smp'] == float(historical[(utc, baa)]['SMP'])
            assert r['historical_reference'][baa]['mec'] == statistics.median(location_mecs[(utc, baa)])
        quantities = []
        for c in cs:
            a = rows[c.row_id]
            assert a['RCode'] == c.rcode and int(a['side']) == c.side
            assert float(a['lower_mw']) == c.lower and float(a['upper_mw']) == c.upper
            q = float(a['cleared_mw'])
            assert math.isfinite(q)
            assert abs(float(a['integrated_cost_or_value_dollars'])-c.integral(q)) < 1e-7
            quantities.append(q)
        check = verify(cs, dict(r, quantities=quantities))
        assert check['passed'], check
        assert r['rows'] == len(cs)
        assert r['independent_optimizer_comparison'] == r['numerical_optimizer_verified']
        if not r['numerical_optimizer_verified']:
            assert r['rejected_numerical_attempt']
        certificates.append(check)
    expected_count = sum(a['energy_rows'] for a in report['audits'])*2
    assert count == expected_count == 252786
    for scenario, references in report['metrics'].items():
        selected = [r for r in results if r['scenario'] == scenario]
        for reference, metric in references.items():
            baa, kind = reference.split('_')
            errors = [r['clearing_price_dollars_per_mwh']-r['historical_reference'][baa][kind]
                      for r in selected]
            expected = dict(hours=len(errors), mean_absolute_error=statistics.mean(abs(e) for e in errors),
                root_mean_squared_error=math.sqrt(statistics.mean(e*e for e in errors)),
                mean_signed_error=statistics.mean(errors), maximum_absolute_error=max(abs(e) for e in errors))
            assert expected == metric
    comparisons = sum(r['independent_optimizer_comparison'] for r in results)
    assert report['independent_optimizer_comparisons'] == comparisons
    assert report['certified_marginal_clearing_fallbacks'] == 48-comparisons
    result = dict(passed=True, scenarios=48, hours=24, awards=count,
        source_hashes_verified=True, metrics_recomputed=True,
        certificates_rebuilt_from_awards=True,
        independent_optimizer_comparisons=comparisons, certified_fallbacks=48-comparisons,
        maximum_balance_error_mw=max(c['balance_error_mw'] for c in certificates),
        maximum_bound_error_mw=max(c['bound_error_mw'] for c in certificates),
        maximum_absolute_dual_gap_dollars=max(abs(c['primal_dual_gap_dollars']) for c in certificates),
        artifact_sha256={name:hashlib.sha256((folder/name).read_bytes()).hexdigest()
                         for name in ['fidelity_report.json','hourly_awards.csv','hourly_prices.csv']},
        implementation_sha256={name:hashlib.sha256((PROJECT/name).read_bytes()).hexdigest()
                         for name in ['optimizer/energy_auction.py','studies/fidelity_validation.py','studies/audit_fidelity_artifacts.py']})
    (folder/'artifact_audit.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', help='Completed fidelity result folder inside the project')
    audit(parser.parse_args().folder)
