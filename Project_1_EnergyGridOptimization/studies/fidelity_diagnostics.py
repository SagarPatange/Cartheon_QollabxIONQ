"""Explain certified baseline awards without modifying their market model."""
import argparse
import csv
import hashlib
import json
import math
import statistics
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from optimizer.energy_auction import PROJECT, load_curves, verify


def diagnose_hour(curves, quantities, fixed_demand_mw, modeled_price, historical_mec):
    if len(curves)!=len(quantities) or not curves or len({c.row_id for c in curves})!=len(curves):
        raise ValueError('Require one award per unique source row')
    if not all(math.isfinite(v) for v in [fixed_demand_mw,modeled_price,historical_mec]) or fixed_demand_mw<0:
        raise ValueError('Require finite prices and nonnegative fixed demand')
    supply=consumption=purchases=0.;marginals=[];endpoints=Counter()
    for c,q in zip(curves,quantities):
        if not math.isfinite(q) or q<c.lower-1e-6 or q>c.upper+1e-6:
            raise ValueError(f'{c.row_id}: invalid award')
        if c.side==1:
            supply+=max(q,0.);consumption-=min(q,0.)
        else:
            purchases+=q
        lower=abs(q-c.lower)<1e-6;upper=abs(q-c.upper)<1e-6
        if lower or upper:
            endpoints['lower' if lower else 'upper']+=1
        values=[p+g*(min(right,max(left,q))-left) for left,right,p,g in c.pieces()
                if left-1e-6<=q<=right+1e-6]
        if not values:
            continue
        lo,hi=min(values),max(values)
        if lo-1e-5<=modeled_price<=hi+1e-5:
            category=('lower_endpoint_tie' if lower else 'upper_endpoint_tie' if upper else
                      'interior_sloped' if c.slope and hi-lo<1e-6 and any(g for _,_,_,g in c.pieces()) else
                      'interior_block_kink' if hi-lo>1e-6 else 'interior_flat_tie')
            marginals.append(dict(row_id=c.row_id,RCode=c.rcode,side=c.side,quantity_mw=q,
                category=category,domain_mw=[c.lower,c.upper],points=[list(p) for p in c.points],
                use_bid_slope=c.slope,marginal_price_interval=[lo,hi],
                classification=dict(physical_type='unknown',baa='unknown',node='unknown')))
    residual=supply-consumption-purchases-fixed_demand_mw
    return dict(rows=len(curves),fixed_demand_mw=fixed_demand_mw,supply_mw=supply,
        signed_consumption_mw=consumption,responsive_purchase_mw=purchases,
        balance_residual_mw=residual,modeled_price_dollars_per_mwh=modeled_price,
        historical_mec_dollars_per_mwh=historical_mec,price_error_dollars_per_mwh=modeled_price-historical_mec,
        marginal_rows=marginals,interior_marginal_count=sum(r['category'].startswith('interior') for r in marginals),
        endpoint_counts=dict(endpoints),repeated_code_extra_rows=len(curves)-len({c.rcode for c in curves}),
        geography='unknown; all source submissions retained, no additional BAA demand pooled',
        interpretation='Marginal submissions and endpoint ties in the current auction, not identified physical generators.')


def run_diagnostics(folder):
    folder=Path(folder).resolve()
    if not folder.is_relative_to(PROJECT):
        raise ValueError('Input/result artifacts must remain inside the project')
    report=json.loads((folder/'fidelity_report.json').read_text())
    if report['manifest']['status']!='complete':
        raise ValueError('Require a completed fidelity study')
    for name,digest in report['manifest']['input_sha256'].items():
        if hashlib.sha256((PROJECT/'data'/name).read_bytes()).hexdigest()!=digest:
            raise ValueError(f'Changed source: {name}')
    selected=[r for r in report['hourly_results'] if r['scenario']=='spp_fixed_scope_sensitivity']
    if len(selected)!=24 or len({r['utc_hour_end'] for r in selected})!=24:
        raise ValueError('Require 24 distinct SPP-fixed hours')
    awards=defaultdict(dict)
    with (folder/'hourly_awards.csv').open(newline='') as f:
        for a in csv.DictReader(f):
            if a['scenario']!='spp_fixed_scope_sensitivity':
                continue
            group=awards[a['utc_hour_end']]
            if a['row_id'] in group:
                raise ValueError('Duplicate award row')
            group[a['row_id']]=a
    with (PROJECT/'data/DA-MC-202607010100.csv').open(newline='') as f:
        historical={r['GMTIntervalEnd']:r for r in csv.DictReader(f) if r['BAA']=='SPP'}
    mecs=defaultdict(list)
    with (PROJECT/'data/DA-LMP-SL-202607010100.csv').open(newline='') as f:
        for r in csv.DictReader(f):
            if r['BAA']=='SPP':
                mecs[r['GMTIntervalEnd']].append(float(r['MEC']))
    if set(awards)!= {r['utc_hour_end'] for r in selected}:
        raise ValueError('Unexpected award hours')
    hours=[]
    for r in selected:
        utc=r['utc_hour_end'];cs=load_curves(PROJECT/'data/DA-ENERGY-OFFERS-202607010100.csv',r['cpt_hour_end'])
        rows=awards[utc]
        if set(rows)!={c.row_id for c in cs}:
            raise ValueError('Missing/extra source award')
        quantities=[]
        for c in cs:
            a=rows[c.row_id];q=float(a['cleared_mw'])
            if a['RCode']!=c.rcode or int(a['side'])!=c.side or abs(c.integral(q)-float(a['integrated_cost_or_value_dollars']))>1e-7:
                raise ValueError('Award/source identity or cost mismatch')
            quantities.append(q)
        cert=verify(cs,dict(r,quantities=quantities))
        fixed=float(historical[utc]['Cleared Fixed Demand Bid']);mec=statistics.median(mecs[utc])
        if not cert['passed'] or fixed!=r['fixed_demand_mw'] or mec!=r['historical_reference']['SPP']['mec']:
            raise ValueError('Baseline certificate or historical reference mismatch')
        d=diagnose_hour(cs,quantities,fixed,r['clearing_price_dollars_per_mwh'],mec)
        d.update(utc_hour_end=utc,cpt_hour_end=r['cpt_hour_end'],verification=cert,
                 historical_smp_dollars_per_mwh=float(historical[utc]['SMP']))
        if abs(d['balance_residual_mw'])>1e-5:
            raise ValueError('Diagnostic balance failed')
        hours.append(d)
        print(f'{r["cpt_hour_end"]}: error {d["price_error_dollars_per_mwh"]:.4f}; marginal submissions {len(d["marginal_rows"])}',flush=True)
    errors=[h['price_error_dollars_per_mwh'] for h in hours]
    mae=statistics.mean(abs(e) for e in errors)
    if abs(mae-report['metrics']['spp_fixed_scope_sensitivity']['SPP_mec']['mean_absolute_error'])>1e-10:
        raise ValueError('Historical metric reproduction failed')
    output=PROJECT/'results'/('diagnostics-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-')+uuid.uuid4().hex[:8])
    output.mkdir(parents=True)
    ranked=sorted(hours,key=lambda h:abs(h['price_error_dollars_per_mwh']),reverse=True)
    result=dict(status='complete',source_folder=str(folder.relative_to(PROJECT)),hours=hours,
        ranked_hours=[h['utc_hour_end'] for h in ranked],mean_absolute_mec_error=mae,
        maximum_balance_error_mw=max(abs(h['balance_residual_mw']) for h in hours),
        awards_verified=sum(h['rows'] for h in hours),source_sha256=report['manifest']['input_sha256'],
        implementation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        assumptions=['A01','A02','A05','A07','A09','A11','A14','H01','P01'],
        conclusion='Numerical balance/cost checks pass. Marginal rows remain unclassified. These diagnostics do not identify a unique cause of the historical price gap or calibrate missing constraints.')
    (output/'diagnostic_report.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    fields=['utc_hour_end','cpt_hour_end','fixed_demand_mw','supply_mw','signed_consumption_mw','responsive_purchase_mw',
            'balance_residual_mw','modeled_price_dollars_per_mwh','historical_mec_dollars_per_mwh',
            'historical_smp_dollars_per_mwh','price_error_dollars_per_mwh','interior_marginal_count','repeated_code_extra_rows']
    with (output/'ranked_hours.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');writer.writeheader();writer.writerows(ranked)
    print('Completed diagnostics:',output,flush=True)
    return result,output


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder')
    run_diagnostics(parser.parse_args().folder)
