"""24-hour SPP-curve simulation on an explicitly synthetic case9 network.

No recovered physical mapping, no price calibration, no SPP replay claim.
"""
import csv
import hashlib
import json
import math
import statistics
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from importlib.metadata import version
import numpy as np
from optimizer.energy_auction import PROJECT, load_curves, solve, verify
from optimizer.network_dispatch import Branch, Network, solve_network


def mapped_nodes(curves, buses, seed):
    return [buses[int.from_bytes(hashlib.sha256(
             f'network-seed={seed}|{c.rcode[2:]}'.encode()).digest()[:8],'big')%len(buses)]
            for c in curves]


def binding_count(network, flows):
    return int(sum(abs(abs(f)-b.limit_mw)<.001 for f,b in zip(flows,network.branches)))


def study_inputs(config):
    seeds=config['mapping_seeds']
    if not seeds or len(set(seeds))!=len(seeds) or any(type(s) is not int for s in seeds):
        raise ValueError('Require distinct integer mapping seeds')
    return [('unconstrained_control',seeds[0],None,0.)]+[
        ('constrained_lossless',seed,None,0.) for seed in seeds]+[
        ('constrained_linear_losses',seeds[0],config['synthetic_loss_sensitivities'],
         config['synthetic_loss_offset_mw'])]


def derivative_check(utc,node,delta,derivative,price):
    difference=float(abs(derivative-price))
    return dict(utc_hour_end=utc,node=node,delta_mw=delta,finite_difference=float(derivative),
                dual_price=float(price),difference=difference,passed=bool(difference<.05))


def main():
    started=time.perf_counter()
    source=PROJECT/'data/DA-ENERGY-OFFERS-202607010100.csv'
    config_path=PROJECT/'data/network_case9.json'
    config=json.loads(config_path.read_text())
    with (PROJECT/'data/DA-MC-202607010100.csv').open(newline='') as f:
        clearing=[r for r in csv.DictReader(f) if r['BAA']=='SPP']
    with (PROJECT/'data/DA-LMP-SL-202607010100.csv').open(newline='') as f:
        lmp=list(csv.DictReader(f))
    clearing.sort(key=lambda r:datetime.strptime(r['GMTIntervalEnd'],'%m/%d/%Y %H:%M:%S'))
    if len(clearing)!=24 or len({r['GMTIntervalEnd'] for r in clearing})!=24:
        raise ValueError('Expected all 24 SPP operating-day hours')
    base_demand=np.asarray(config['base_fixed_demand_mw'])
    shares=base_demand/sum(base_demand)
    scale=max(float(r['Cleared Fixed Demand Bid']) for r in clearing)/sum(base_demand)
    output=PROJECT/'results'/('network-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-')+uuid.uuid4().hex[:8])
    output.mkdir(parents=True)
    networks={}
    for label,multiplier in [('unconstrained_control',config['unconstrained_rating_multiplier']),
                             ('constrained',config['constrained_rating_multiplier'])]:
        branches=tuple(Branch(b['name'],b['from_bus'],b['to_bus'],b['reactance_pu'],
                             b['limit_mw']*scale*multiplier) for b in config['branches'])
        networks[label]=Network(tuple(config['buses']),branches,config['reference'],config['base_mva']*scale)
    manifest=dict(status='running',assumptions=['A01','A02','A03','A04','A05','A07','A09','H01','H02']+config['assumptions'],
        model='Synthetic continuous DC dispatch with optional supplied affine loss sensitivities; not operational SPP reconstruction.',
        scale=scale,load_shares=shares.tolist(),configuration=config,
        networks={k:asdict(v) for k,v in networks.items()},
        versions={p:version(p) for p in ['numpy','scipy','osqp','clarabel']},
        sha256={str(p.relative_to(PROJECT)):hashlib.sha256(p.read_bytes()).hexdigest()
                for p in [source,config_path,PROJECT/'data/DA-MC-202607010100.csv',
                          PROJECT/'data/DA-LMP-SL-202607010100.csv',
                          PROJECT/'optimizer/network_dispatch.py',PROJECT/'studies/network_simulation.py',PROJECT/'optimizer/energy_auction.py']},
        price_calibration=False)
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    hours=[];sensitivity=[]
    try:
        with (output/'awards.csv').open('w',newline='') as af,(output/'prices_and_flows.csv').open('w',newline='') as pf:
            awards=csv.writer(af);prices=csv.writer(pf)
            awards.writerow(['utc_hour_end','scenario','seed','row_id','RCode','node','side','cleared_mw','integrated_cost_or_value_dollars'])
            prices.writerow(['utc_hour_end','scenario','seed','kind','id','value','mec','mcc','mlc','limit_mw'])
            for index,mc in enumerate(clearing):
                hour,utc=mc['Interval'],mc['GMTIntervalEnd']
                cs=load_curves(source,hour)
                fixed=float(mc['Cleared Fixed Demand Bid']);demand=fixed*shares
                baseline=solve(cs,fixed_demand_mw=fixed)
                baseline_check=verify(cs,baseline)
                if not baseline_check['passed']:
                    raise RuntimeError('Original baseline failed certification')
                reference_mec=statistics.median(float(r['MEC']) for r in lmp if r['GMTIntervalEnd']==utc and r['BAA']=='SPP')
                item=dict(cpt_hour_end=hour,utc_hour_end=utc,fixed_demand_mw=fixed,rows=len(cs),
                    historical_spp_mec=reference_mec,historical_spp_smp=float(mc['SMP']),
                    baseline={k:v for k,v in baseline.items() if k!='quantities'},baseline_verification=baseline_check,studies={})
                for scenario,seed,loss,offset in study_inputs(config):
                    net=networks['unconstrained_control' if scenario=='unconstrained_control' else 'constrained']
                    nodes=mapped_nodes(cs,net.buses,seed)
                    result=solve_network(cs,nodes,net,demand,loss_sensitivity=loss,loss_offset_mw=offset)
                    if scenario=='unconstrained_control':
                        if abs(result['objective_dollars']-baseline['objective_dollars'])>max(.1,abs(baseline['objective_dollars'])*1e-8):
                            raise RuntimeError('Unconstrained network objective disagrees with original baseline')
                        if max(abs(p-baseline['clearing_price_dollars_per_mwh']) for p in result['nodal_prices'])>.001:
                            raise RuntimeError('Unconstrained nodal prices disagree with original baseline')
                    record={k:v for k,v in result.items() if k!='quantities'}
                    record.update(seed=seed,scenario=scenario,demand_mw=demand.tolist(),
                        loss_sensitivity=loss or [0.]*len(net.buses),loss_offset_mw=offset,
                        load_weighted_nodal_price=float(shares@np.asarray(result['nodal_prices'])),
                        binding_branch_count=binding_count(net,result['flows_mw']),
                        control_objective_difference=abs(result['objective_dollars']-baseline['objective_dollars']) if scenario=='unconstrained_control' else None)
                    item['studies'][f'{scenario}_seed{seed}']=record
                    for c,node,q in zip(cs,nodes,result['quantities']):
                        awards.writerow([utc,scenario,seed,c.row_id,c.rcode,node,c.side,q,c.integral(q)])
                    for i,bus in enumerate(net.buses):
                        prices.writerow([utc,scenario,seed,'node',bus,result['nodal_prices'][i],result['mec'],result['mcc'][i],result['mlc'][i],''])
                    for b,f in zip(net.branches,result['flows_mw']):
                        prices.writerow([utc,scenario,seed,'branch',b.name,f,'','','',b.limit_mw])
                    # Validate nodal prices against independent objective perturbations
                    # at the first hour and the hour with maximum fixed demand.
                    if scenario=='constrained_linear_losses' and (index==0 or fixed==max(float(r['Cleared Fixed Demand Bid']) for r in clearing)):
                        for node in ['1','5','7','9']:
                            i=net.buses.index(node);delta=.1
                            perturb=np.zeros(len(net.buses));perturb[i]=delta
                            plus=solve_network(cs,nodes,net,demand+perturb,loss_sensitivity=loss,loss_offset_mw=offset)
                            if demand[i]>=delta:
                                minus=solve_network(cs,nodes,net,demand-perturb,loss_sensitivity=loss,loss_offset_mw=offset)
                                derivative=(plus['objective_dollars']-minus['objective_dollars'])/(2*delta)
                            else:
                                derivative=(plus['objective_dollars']-result['objective_dollars'])/delta
                            check=derivative_check(utc,node,delta,derivative,result['nodal_prices'][i])
                            if not check['passed']:
                                raise RuntimeError(f'Nodal derivative check failed: {check}')
                            sensitivity.append(check)
                hours.append(item)
                with (output/'progress.jsonl').open('a') as f:
                    f.write(json.dumps(item,allow_nan=False)+'\n')
                prices_now=[(name,round(study['mec'],4),round(study['load_weighted_nodal_price'],4),study['binding_branch_count'])
                            for name,study in item['studies'].items() if not name.startswith('unconstrained')]
                print(f'{hour}: baseline {baseline["clearing_price_dollars_per_mwh"]:.4f}; (case,MEC,weighted nodal,bindings) {prices_now}',flush=True)
        metrics={}
        for scenario in hours[0]['studies']:
            metrics[scenario]={}
            for target in ['historical_spp_mec','historical_spp_smp']:
                for field in ['mec','load_weighted_nodal_price']:
                    errors=[h['studies'][scenario][field]-h[target] for h in hours]
                    metrics[scenario][field+'_vs_'+target]=dict(mean_absolute_error=statistics.mean(abs(e) for e in errors),
                        root_mean_squared_error=math.sqrt(statistics.mean(e*e for e in errors)),mean_signed_error=statistics.mean(errors))
        manifest['status']='complete'
        report=dict(manifest=manifest,hours=hours,metrics=metrics,finite_difference_checks=sensitivity,
            hours_verified=len(hours),network_studies_verified=sum(len(h['studies']) for h in hours),
            elapsed_seconds=time.perf_counter()-started,
            interpretation='Network and loss assumptions are synthetic; no scenario chosen by historical price fit. No actual SPP dispatch, physical cost savings, quantum speedup or nodal accuracy established.')
        (output/'network_report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
        (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print('Completed network simulation:',output,flush=True)
        print(json.dumps(metrics,indent=2),flush=True)
    except Exception as error:
        manifest.update(status='failed',error=str(error),completed_hours=len(hours))
        (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        raise


if __name__=='__main__':
    main()
