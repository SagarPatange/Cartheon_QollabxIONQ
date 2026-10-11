"""Rebuild network certificates from exported awards, without rerunning a solver."""
import argparse
import csv
import hashlib
import itertools
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
import numpy as np
from optimizer.energy_auction import PROJECT, load_curves
from optimizer.network_dispatch import Branch, Network, verify_network
from studies.network_simulation import mapped_nodes, binding_count, study_inputs


def audit(folder):
    folder=Path(folder).resolve()
    if not folder.is_relative_to(PROJECT):
        raise ValueError('Artifacts must remain inside the project')
    report=json.loads((folder/'network_report.json').read_text())
    manifest=report['manifest']
    assert manifest==json.loads((folder/'manifest.json').read_text())
    assert manifest['status']=='complete' and manifest['price_calibration'] is False
    legacy_sources={'energy_auction.py','network_dispatch.py','network_simulation.py'}
    for name,digest in manifest['sha256'].items():
        current=PROJECT/name
        if name in legacy_sources:
            current=PROJECT/'results/cleanup-development/baseline-source-snapshot'/name
        assert current.is_file() and hashlib.sha256(current.read_bytes()).hexdigest()==digest, name
    config=json.loads((PROJECT/'data/network_case9.json').read_text())
    assert config==manifest['configuration']
    nets={k:Network(tuple(v['buses']),tuple(Branch(**b) for b in v['branches']),v['reference'],v['base_mva'])
          for k,v in manifest['networks'].items()}
    with (PROJECT/'data/DA-MC-202607010100.csv').open(newline='') as f:
        historical={r['GMTIntervalEnd']:r for r in csv.DictReader(f) if r['BAA']=='SPP'}
    mecs=defaultdict(list)
    with (PROJECT/'data/DA-LMP-SL-202607010100.csv').open(newline='') as f:
        for r in csv.DictReader(f):
            if r['BAA']=='SPP':
                mecs[r['GMTIntervalEnd']].append(float(r['MEC']))
    shares=np.asarray(config['base_fixed_demand_mw'],dtype=float)
    shares/=sum(shares)
    scale=max(float(r['Cleared Fixed Demand Bid']) for r in historical.values())/sum(config['base_fixed_demand_mw'])
    assert scale==manifest['scale']
    np.testing.assert_allclose(shares,manifest['load_shares'],atol=0,rtol=0)
    for label,net in nets.items():
        multiplier=config['unconstrained_rating_multiplier' if label=='unconstrained_control' else 'constrained_rating_multiplier']
        assert net.base_mva==config['base_mva']*scale
        assert net.buses==tuple(config['buses']) and net.reference==config['reference']
        assert net.branches==tuple(Branch(b['name'],b['from_bus'],b['to_bus'],b['reactance_pu'],b['limit_mw']*scale*multiplier)
                                   for b in config['branches'])
    hours={h['utc_hour_end']:h for h in report['hours']}
    assert len(hours)==len(report['hours'])==len(historical)==24
    study_config={(scenario,seed):(loss or [0.]*len(config['buses']),offset)
                  for scenario,seed,loss,offset in study_inputs(config)}
    assert all({(s['scenario'],s['seed']) for s in h['studies'].values()}==set(study_config)
               for h in hours.values())
    expected={(utc,s['scenario'],str(s['seed'])) for utc,h in hours.items() for s in h['studies'].values()}
    flows=defaultdict(dict)
    flow_rows=0
    with (folder/'prices_and_flows.csv').open(newline='') as f:
        for r in csv.DictReader(f):
            key=(r['utc_hour_end'],r['scenario'],r['seed'])
            name=(r['kind'],r['id'])
            assert name not in flows[key]
            flows[key][name]=r
            flow_rows+=1
    assert set(flows)==expected
    seen=set();certificates=[];award_rows=0;cached_hour=None;curves=None
    with (folder/'awards.csv').open(newline='') as f:
        groups=itertools.groupby(csv.DictReader(f),lambda r:(r['utc_hour_end'],r['scenario'],r['seed']))
        for key,group in groups:
            assert key in expected and key not in seen
            seen.add(key);utc,scenario,seed_text=key;seed=int(seed_text);h=hours[utc]
            s=h['studies'][f'{scenario}_seed{seed}']
            loss,offset=study_config[scenario,seed]
            assert s['loss_sensitivity']==loss and s['loss_offset_mw']==offset
            if cached_hour!=utc:
                curves=load_curves(PROJECT/'data/DA-ENERGY-OFFERS-202607010100.csv',h['cpt_hour_end'])
                cached_hour=utc
            assert h['fixed_demand_mw']==float(historical[utc]['Cleared Fixed Demand Bid'])
            assert h['historical_spp_mec']==statistics.median(mecs[utc])
            assert h['historical_spp_smp']==float(historical[utc]['SMP'])
            net=nets['unconstrained_control' if scenario=='unconstrained_control' else 'constrained']
            nodes=mapped_nodes(curves,net.buses,seed)
            rows={}
            for r in group:
                assert r['row_id'] not in rows
                rows[r['row_id']]=r;award_rows+=1
            assert set(rows)=={c.row_id for c in curves}
            quantities=[]
            for c,node in zip(curves,nodes):
                r=rows[c.row_id];q=float(r['cleared_mw'])
                assert r['RCode']==c.rcode and r['node']==node and int(r['side'])==c.side
                assert abs(c.integral(q)-float(r['integrated_cost_or_value_dollars']))<=1e-8
                quantities.append(q)
            np.testing.assert_allclose(s['demand_mw'],h['fixed_demand_mw']*shares,atol=0,rtol=0)
            result=dict(s,quantities=quantities)
            cert=verify_network(curves,nodes,net,s['demand_mw'],result,
                                loss_sensitivity=s['loss_sensitivity'],loss_offset_mw=s['loss_offset_mw'])
            assert cert['passed'],(key,cert)
            assert cert==s['verification'], 'Certificate must rebuild identically from exported awards'
            injection=np.zeros(len(net.buses))
            for c,node,q in zip(curves,nodes,quantities):
                injection[net.buses.index(node)]+=c.side*q
            injection-=s['demand_mw']
            np.testing.assert_allclose(injection,s['net_injection_mw'],atol=1e-8,rtol=0)
            assert abs(cert['losses_mw']-s['losses_mw'])<1e-8
            assert s['binding_branch_count']==binding_count(net,s['flows_mw'])
            assert abs(s['load_weighted_nodal_price']-shares@np.asarray(s['nodal_prices']))<1e-10
            table=flows[key]
            assert set(table)=={('node',b) for b in net.buses}|{('branch',b.name) for b in net.branches}
            for i,b in enumerate(net.buses):
                r=table['node',b]
                for field,value in [('value',s['nodal_prices'][i]),('mec',s['mec']),('mcc',s['mcc'][i]),('mlc',s['mlc'][i])]:
                    assert float(r[field])==value
            for b,value in zip(net.branches,s['flows_mw']):
                r=table['branch',b.name]
                assert float(r['value'])==value and float(r['limit_mw'])==b.limit_mw
            if scenario=='unconstrained_control':
                baseline=h['baseline']
                assert abs(s['objective_dollars']-baseline['objective_dollars'])<=max(.1,abs(baseline['objective_dollars'])*1e-8)
                assert max(abs(p-baseline['clearing_price_dollars_per_mwh']) for p in s['nodal_prices'])<=.001
            certificates.append(cert)
    assert seen==expected and len(seen)==report['network_studies_verified']
    for scenario,metrics in report['metrics'].items():
        for target in ['historical_spp_mec','historical_spp_smp']:
            for field in ['mec','load_weighted_nodal_price']:
                errors=[h['studies'][scenario][field]-h[target] for h in hours.values()]
                actual=dict(mean_absolute_error=statistics.mean(abs(e) for e in errors),
                            root_mean_squared_error=math.sqrt(statistics.mean(e*e for e in errors)),
                            mean_signed_error=statistics.mean(errors))
                assert actual==metrics[field+'_vs_'+target]
    assert len(report['finite_difference_checks'])==8
    assert all(c['passed'] and abs(c['finite_difference']-c['dual_price'])==c['difference'] and c['difference']<.05
               for c in report['finite_difference_checks'])
    summary=dict(passed=True,hours_verified=len(hours),network_studies_verified=len(seen),
                 award_rows=award_rows,price_flow_rows=flow_rows,
                 finite_difference_checks=len(report['finite_difference_checks']),
                 maximum_residuals={k:max(c[k] for c in certificates) for k in
                    ['balance_error_mw','bound_error_mw','flow_limit_error_mw','kirchhoff_error_mw',
                     'price_decomposition_error','primal_dual_gap_dollars']})
    (folder/'artifact_audit.json').write_text(json.dumps(summary,indent=2)+'\n')
    return summary


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('folder')
    print(json.dumps(audit(parser.parse_args().folder),indent=2))
