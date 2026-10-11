"""Exact block-offer commitment MILP and conditional continuous pricing."""
import itertools
import math
import time
from dataclasses import dataclass, replace
import numpy as np
from scipy import sparse
from scipy.optimize import Bounds, LinearConstraint, milp, linprog
from optimizer.multihour_dispatch import validate_case, build_dispatch_model, price_components, valid_export_arrays


@dataclass(frozen=True)
class CommitmentUnit:
    unit_id: str
    startup_cost_dollars: float
    no_load_dollars_per_hour: float
    minimum_up_hours: float
    minimum_down_hours: float
    initial_on: bool
    initial_status_hours: float
    minimum_output_mw: tuple
    startup_ramp_mw: float
    shutdown_ramp_mw: float


def validate_commitment(case,specs):
    units=validate_case(case)
    if len(specs)!=len(units) or {s.unit_id for s in specs}!=set(units):
        raise ValueError('Require exactly one commitment specification per declared unit')
    by_id={s.unit_id:s for s in specs}
    ordered=tuple(by_id[u.unit_id] for u in case.units)
    for u,s in zip(case.units,ordered):
        vals=[s.startup_cost_dollars,s.no_load_dollars_per_hour,s.minimum_up_hours,s.minimum_down_hours,
              s.initial_status_hours,s.startup_ramp_mw,s.shutdown_ramp_mw,*s.minimum_output_mw]
        if len(s.minimum_output_mw)!=len(case.curves) or type(s.initial_on) is not bool or not all(math.isfinite(v) and v>=0 for v in vals):
            raise ValueError('Require explicit finite commitment parameters')
        if any(lo<physical_lo or lo>hi for lo,physical_lo,hi in zip(s.minimum_output_mw,u.minimum_mw,u.maximum_mw)):
            raise ValueError('Commitment output bounds outside declared capability')
        if not s.initial_on and abs(u.initial_dispatch_mw)>1e-8:
            raise ValueError('Initially off unit has nonzero initial generation')
        if s.initial_on and u.initial_dispatch_mw<s.minimum_output_mw[0]-1e-8:
            raise ValueError('Initially on unit is below declared initial minimum')
    return ordered


def _duration_indices(case,start,duration):
    elapsed=0.;indices=[]
    for h in range(start,len(case.curves)):
        if elapsed>=duration-1e-9:
            break
        indices.append(h);elapsed+=case.interval_hours[h]
    return indices


def build_commitment_model(case,specs,*,reserve=None):
    specs=validate_commitment(case,specs)
    relaxed=replace(case,units=tuple(replace(u,minimum_mw=(0.,)*len(case.curves)) for u in case.units))
    base=build_dispatch_model(relaxed)
    if np.any(base['quad']):
        raise ValueError('Linear commitment requires exact block costs; sloped curves need a declared MIQP or approximation')
    ns=len(base['linear']);t=len(case.curves);nu=len(case.units);nt=t*nu;n=ns+3*nt
    on_idx=np.arange(ns,ns+nt).reshape(t,nu)
    start_idx=on_idx+nt;stop_idx=on_idx+2*nt
    cost=np.r_[base['linear'],np.zeros(3*nt)]
    lower=np.zeros(n);upper=np.r_[base['widths'],np.ones(3*nt)]
    eq=[];ineq=[];eq_meta=[];ineq_meta=[]
    def equal(row,rhs,meta):
        eq.append((row,rhs));eq_meta.append(meta)
    def bound(row,rhs,meta):
        ineq.append((row,rhs));ineq_meta.append(meta)
    for k,meta in enumerate(base['meta']):
        if meta[0] not in ('balance','flow_upper','flow_lower','segment_upper','segment_lower'):
            continue
        row=np.r_[base['a'].getrow(k).toarray().ravel(),np.zeros(3*nt)]
        (equal if meta[0]=='balance' else bound)(row,base['b'][k],meta)
    for i,(u,s) in enumerate(zip(case.units,specs)):
        for h in range(t):
            oi,si,di=on_idx[h,i],start_idx[h,i],stop_idx[h,i]
            cost[oi]=s.no_load_dollars_per_hour*case.interval_hours[h];cost[si]=s.startup_cost_dollars
            if not u.available[h]:
                upper[oi]=0.
            transition=np.zeros(n);transition[oi]=1.;transition[si]=-1.;transition[di]=1.
            if h:
                transition[on_idx[h-1,i]]=-1.;rhs=0.
            else:
                rhs=float(s.initial_on)
            equal(transition,rhs,('transition',h,i))
            exclusive=np.zeros(n);exclusive[si]=exclusive[di]=1.
            bound(exclusive,1.,('exclusive_switch',h,i))
            generation=np.r_[base['unit_matrices'][h][i],np.zeros(3*nt)]
            gbase=base['unit_bases'][h][i]
            hi=generation.copy();hi[oi]-=u.maximum_mw[h]
            lo=-generation.copy();lo[oi]+=s.minimum_output_mw[h]
            bound(hi,-gbase,('unit_upper',h,i));bound(lo,gbase,('unit_lower',h,i))
            ramp=generation.copy()
            change=gbase-(base['unit_bases'][h-1][i] if h else u.initial_dispatch_mw)
            if h:
                ramp[:ns]-=base['unit_matrices'][h-1][i]
            up=ramp.copy();up[si]-=s.startup_ramp_mw
            if h:
                up[on_idx[h-1,i]]-=u.ramp_up_mw_per_hour*case.interval_hours[h]
            up_rhs=-change+(u.ramp_up_mw_per_hour*case.interval_hours[h]*s.initial_on if not h else 0.)
            down=-ramp.copy();down[oi]-=u.ramp_down_mw_per_hour*case.interval_hours[h];down[di]-=s.shutdown_ramp_mw
            bound(up,up_rhs,('ramp_up',h,i));bound(down,change,('ramp_down',h,i))
            for k in _duration_indices(case,h,s.minimum_up_hours):
                row=np.zeros(n);row[si]=1.;row[on_idx[k,i]]-=1.
                bound(row,0.,('minimum_up',h,i,k))
            for k in _duration_indices(case,h,s.minimum_down_hours):
                row=np.zeros(n);row[di]=1.;row[on_idx[k,i]]+=1.
                bound(row,1.,('minimum_down',h,i,k))
            remaining=sum(case.interval_hours[h:])
            if remaining<s.minimum_up_hours-1e-9:
                upper[si]=0.
            if remaining<s.minimum_down_hours-1e-9:
                upper[di]=0.
        remaining=max(0.,(s.minimum_up_hours if s.initial_on else s.minimum_down_hours)-s.initial_status_hours)
        for h in _duration_indices(case,0,remaining):
            lower[on_idx[h,i]]=upper[on_idx[h,i]]=float(s.initial_on)
    entries=eq+ineq
    model=dict(base=base,specs=specs,ns=ns,neq=len(eq),a=sparse.csc_matrix(np.asarray([r for r,b in entries])),
        b=np.asarray([b for r,b in entries]),cost=cost,lower=lower,upper=upper,
        integrality=np.r_[np.zeros(ns),np.ones(3*nt)].astype(int),on_idx=on_idx,start_idx=start_idx,stop_idx=stop_idx,
        meta=eq_meta+ineq_meta,terminal_policy='complete_minimum_times_for_in_horizon_switches',
        continuous_indices=np.arange(ns),binary_indices=np.arange(ns,n))
    if reserve is not None:
        from optimizer.reserve_coupling import extend_reserve_model
        model=extend_reserve_model(case,model,reserve)
    return model


def _awards(case,model,x):
    base=model['base'];seg=x[:model['ns']]
    quantities=[(lo+mat@seg).tolist() for lo,mat in zip(base['bases'],base['row_matrices'])]
    gen=[(lo+mat@seg).tolist() for lo,mat in zip(base['unit_bases'],base['unit_matrices'])]
    flows=[]
    for h,(cs,qs) in enumerate(zip(case.curves,quantities)):
        injection=-np.asarray(case.demand[h],dtype=float).copy()
        for c,node,q in zip(cs,case.nodes[h],qs):
            injection[case.network.buses.index(node)]+=c.side*q
        flows.append((base['ptdf']@injection).tolist())
    return quantities,gen,flows


def solve_commitment(case,specs,*,fixed_commitment=None,time_limit=60.,reserve=None):
    started=time.perf_counter();model=build_commitment_model(case,specs,reserve=reserve)
    lower=model['lower'].copy();upper=model['upper'].copy()
    if fixed_commitment is not None:
        on=np.asarray(fixed_commitment)
        if on.shape!=model['on_idx'].shape or not np.all(np.isin(on,[0,1])):
            raise ValueError('Require a complete binary commitment')
        lower[model['on_idx']]=np.maximum(lower[model['on_idx']],on)
        upper[model['on_idx']]=np.minimum(upper[model['on_idx']],on)
    if np.any(lower>upper):
        raise RuntimeError('Commitment conflicts with availability or initial state')
    neq=model['neq'];lb=np.r_[model['b'][:neq],np.full(len(model['b'])-neq,-np.inf)]
    sol=milp(model['cost'],integrality=model['integrality'],bounds=Bounds(lower,upper),
             constraints=LinearConstraint(model['a'],lb,model['b']),
             options={'time_limit':time_limit,'mip_rel_gap':1e-9})
    if not sol.success or sol.x is None:
        raise RuntimeError(f'Commitment MILP did not certify optimality: {sol.message}')
    quantities,gen,flows=_awards(case,model,sol.x)
    constant=model['base']['constant']
    result=dict(solver='HiGHS exact block-offer MILP',status=sol.message,quantities=quantities,
        unit_generation_mw=gen,flows_mw=flows,
        on=np.rint(sol.x[model['on_idx']]).astype(int).tolist(),
        starts=np.rint(sol.x[model['start_idx']]).astype(int).tolist(),
        stops=np.rint(sol.x[model['stop_idx']]).astype(int).tolist(),
        objective_dollars=float(sol.fun+constant),objective_bound_dollars=float(sol.mip_dual_bound+constant),
        mip_gap=float(sol.mip_gap),mip_node_count=int(sol.mip_node_count),
        terminal_policy=model['terminal_policy'],elapsed_seconds=time.perf_counter()-started)
    if reserve is not None:
        result['reserve_mw']=sol.x[model['reserve_idx']].tolist()
    result['verification']=verify_commitment(case,specs,result,reserve=reserve)
    if not result['verification']['passed']:
        raise RuntimeError(f'Commitment certificate failed: {result["verification"]}')
    return result


def verify_commitment(case,specs,result,*,reserve=None):
    specs=validate_commitment(case,specs);t=len(case.curves);nu=len(case.units)
    if not valid_export_arrays(result,{'flows_mw':(t,len(case.network.branches)),
            'unit_generation_mw':(t,nu),'objective_dollars':()}):
        return dict(passed=False,error='Invalid numerical exports')
    on=np.asarray(result['on']);starts=np.asarray(result['starts']);stops=np.asarray(result['stops'])
    if any(v.shape!=(t,nu) or not np.all(np.isin(v,[0,1])) for v in [on,starts,stops]):
        return dict(passed=False,error='Invalid binary decisions')
    if result.get('terminal_policy')!='complete_minimum_times_for_in_horizon_switches':
        return dict(passed=False,error='Undeclared terminal policy')
    quantities=result['quantities']
    if len(quantities)!=t or any(len(q)!=len(cs) for q,cs in zip(quantities,case.curves)):
        return dict(passed=False,error='Incomplete quantities')
    incidence,bf,bbus,ptdf,keep=case.network.matrices()
    balance=network_error=bound_error=ramp_error=state_error=export_error=0.;objective=0.
    prevgen=np.array([u.initial_dispatch_mw for u in case.units]);prevon=np.array([s.initial_on for s in specs],dtype=int)
    durations=np.array([s.initial_status_hours for s in specs]);switched=np.zeros(nu,dtype=bool)
    for h,(cs,qs) in enumerate(zip(case.curves,quantities)):
        inj=-np.asarray(case.demand[h],dtype=float).copy();gen=np.zeros(nu)
        for c,node,uid,q in zip(cs,case.nodes[h],case.unit_ids[h],qs):
            if not math.isfinite(q):
                return dict(passed=False,error='Nonfinite award')
            bound_error=max(bound_error,c.lower-q,q-c.upper)
            inj[case.network.buses.index(node)]+=c.side*q
            if uid is not None:
                gen[next(i for i,u in enumerate(case.units) if u.unit_id==uid)]+=q
            objective+=case.interval_hours[h]*c.side*c.integral(q)
        balance=max(balance,abs(sum(inj)))
        angles=np.zeros(len(case.network.buses))
        if keep:
            angles[keep]=np.linalg.solve(bbus[np.ix_(keep,keep)],inj[keep])
        flows=ptdf@inj;limits=np.array([b.limit_mw for b in case.network.branches])
        network_error=max(network_error,float(np.max(abs(flows)-limits,initial=0.)),
            float(np.max(abs(bf@angles-flows),initial=0.)),float(np.max(abs(incidence.T@flows-inj),initial=0.)))
        export_error=max(export_error,float(np.max(abs(flows-np.asarray(result['flows_mw'][h])),initial=0.)),
            float(np.max(abs(gen-np.asarray(result['unit_generation_mw'][h])),initial=0.)))
        for i,(u,s) in enumerate(zip(case.units,specs)):
            start=max(on[h,i]-prevon[i],0);stop=max(prevon[i]-on[h,i],0)
            state_error=max(state_error,abs(start-starts[h,i]),abs(stop-stops[h,i]),on[h,i] if not u.available[h] else 0.)
            bound_error=max(bound_error,s.minimum_output_mw[h]*on[h,i]-gen[i],gen[i]-u.maximum_mw[h]*on[h,i])
            ramp_error=max(ramp_error,gen[i]-prevgen[i]-u.ramp_up_mw_per_hour*case.interval_hours[h]*prevon[i]-s.startup_ramp_mw*start,
                prevgen[i]-gen[i]-u.ramp_down_mw_per_hour*case.interval_hours[h]*on[h,i]-s.shutdown_ramp_mw*stop)
            if on[h,i]!=prevon[i]:
                required=s.minimum_up_hours if prevon[i] else s.minimum_down_hours
                state_error=max(state_error,required-durations[i]);durations[i]=0.;switched[i]=True
            durations[i]+=case.interval_hours[h]
            objective+=s.startup_cost_dollars*start+s.no_load_dollars_per_hour*case.interval_hours[h]*on[h,i]
        prevgen=gen;prevon=on[h]
    for i,s in enumerate(specs):
        if switched[i]:
            state_error=max(state_error,(s.minimum_up_hours if prevon[i] else s.minimum_down_hours)-durations[i])
    reserve_error=0.
    if reserve is not None:
        from optimizer.reserve_coupling import verify_reserve
        reserve_check=verify_reserve(case,reserve,result)
        reserve_error=reserve_check['reserve_error_mw'];objective+=reserve_check['reserve_cost_dollars']
    errors=dict(balance_error_mw=float(balance),network_error_mw=float(network_error),bound_error_mw=float(bound_error),
        ramp_error_mw=float(ramp_error),state_error=float(state_error),export_error_mw=float(export_error),
        objective_error_dollars=abs(objective-result['objective_dollars']),reserve_error_mw=reserve_error)
    tolerance=max(.01,abs(objective)*1e-8)
    passed=all(math.isfinite(v) for v in errors.values()) and all(errors[k]<=1e-5 for k in errors if k!='objective_error_dollars')
    passed=passed and errors['objective_error_dollars']<=tolerance
    return dict(passed=bool(passed),**errors,dollar_tolerance=tolerance)


def price_fixed_commitment(case,specs,on,*,reserve=None):
    started=time.perf_counter();model=build_commitment_model(case,specs,reserve=reserve);on=np.asarray(on)
    if on.shape!=model['on_idx'].shape or not np.all(np.isin(on,[0,1])):
        raise ValueError('Require complete binary decisions for repricing')
    initial=np.array([s.initial_on for s in model['specs']],dtype=int)
    changes=on-np.vstack([initial,on[:-1]])
    starts=np.maximum(changes,0);stops=np.maximum(-changes,0)
    fixed=np.r_[on.ravel(),starts.ravel(),stops.ravel()]
    bi=model['binary_indices'];ci=model['continuous_indices']
    if np.any(fixed<model['lower'][bi]) or np.any(fixed>model['upper'][bi]):
        raise RuntimeError('Fixed commitment conflicts with initial state/availability/terminal policy')
    rhs=model['b']-model['a'][:,bi]@fixed
    a=model['a'][:,ci];neq=model['neq'];c=model['cost'][ci]
    sol=linprog(c,A_eq=a[:neq],b_eq=rhs[:neq],A_ub=a[neq:],b_ub=rhs[neq:],
                bounds=list(zip(model['lower'][ci],model['upper'][ci])),method='highs')
    if not sol.success:
        raise RuntimeError(f'Conditional pricing infeasible: {sol.message}')
    x=np.zeros(len(model['cost']));x[ci]=sol.x;x[bi]=fixed
    quantities,gen,flows=_awards(case,model,x)
    dual=np.r_[-sol.eqlin.marginals,-sol.ineqlin.marginals]
    pricing_model=dict(meta=model['meta'],ptdf=model['base']['ptdf'])
    mec,mcc,prices=price_components(case,pricing_model,dual)
    constant=model['base']['constant']+model['cost'][bi]@fixed
    objective=float(sol.fun+constant)
    lagrangian=c+a.T@dual
    minimum=np.where(lagrangian<0,model['upper'][ci],model['lower'][ci])
    bound=float(constant-rhs@dual+lagrangian@minimum)
    result=dict(solver='HiGHS fixed-commitment pricing LP',quantities=quantities,unit_generation_mw=gen,flows_mw=flows,
        on=on.astype(int).tolist(),starts=starts.astype(int).tolist(),stops=stops.astype(int).tolist(),
        objective_dollars=objective,dual_lower_bound_dollars=bound,primal_dual_gap_dollars=objective-bound,
        mec=mec.tolist(),mcc=mcc.tolist(),mlc=np.zeros_like(prices).tolist(),nodal_prices=prices.tolist(),
        dual=dual.tolist(),terminal_policy=model['terminal_policy'],elapsed_seconds=time.perf_counter()-started,
        price_interpretation='Continuous marginal price conditional on fixed model commitment; not SPP pricing SCED or uplift.')
    if reserve is not None:
        result['reserve_mw']=x[model['reserve_idx']].tolist()
    cert=verify_fixed_pricing(case,specs,result,reserve=reserve)
    result['verification']=cert
    if not cert['passed']:
        raise RuntimeError(f'Conditional pricing certificate failed: {cert}')
    return result


def verify_fixed_pricing(case,specs,result,*,reserve=None):
    t=len(case.curves);n=len(case.network.buses)
    if not valid_export_arrays(result,{'mec':(t,),'mcc':(t,n),'mlc':(t,n),
            'nodal_prices':(t,n),'dual_lower_bound_dollars':(),'primal_dual_gap_dollars':()}):
        return dict(passed=False,error='Invalid pricing exports')
    cert=verify_commitment(case,specs,result,reserve=reserve)
    if not cert['passed']:
        return cert
    model=build_commitment_model(case,specs,reserve=reserve);neq=model['neq'];bi=model['binary_indices'];ci=model['continuous_indices']
    fixed=np.r_[np.asarray(result['on']).ravel(),np.asarray(result['starts']).ravel(),np.asarray(result['stops']).ravel()]
    dual=np.asarray(result['dual'])
    if dual.shape!=model['b'].shape or not np.all(np.isfinite(dual)):
        return dict(passed=False,error='Invalid pricing duals')
    rhs=model['b']-model['a'][:,bi]@fixed;a=model['a'][:,ci];c=model['cost'][ci]
    constant=model['base']['constant']+model['cost'][bi]@fixed
    lagrangian=c+a.T@dual;minimum=np.where(lagrangian<0,model['upper'][ci],model['lower'][ci])
    bound=float(constant-rhs@dual+lagrangian@minimum)
    mec,mcc,prices=price_components(case,dict(meta=model['meta'],ptdf=model['base']['ptdf']),dual)
    price_error=max(float(np.max(abs(mec-np.asarray(result['mec'])),initial=0.)),
        float(np.max(abs(mcc-np.asarray(result['mcc'])),initial=0.)),
        float(np.max(abs(prices-np.asarray(result['nodal_prices'])),initial=0.)),
        float(np.max(abs(np.asarray(result['mlc'])),initial=0.)))
    gap=result['objective_dollars']-bound
    reported_error=max(abs(bound-result['dual_lower_bound_dollars']),abs(gap-result['primal_dual_gap_dollars']))
    negative=float(max(-np.min(dual[neq:],initial=0.),0.))
    cert.update(dual_lower_bound_dollars=bound,primal_dual_gap_dollars=gap,
        price_decomposition_error=price_error,reported_certificate_error_dollars=reported_error,negative_dual_error=negative)
    cert['passed']=cert['passed'] and all(math.isfinite(v) for v in [bound,gap,price_error,reported_error,negative])
    cert['passed']=cert['passed'] and abs(gap)<=cert['dollar_tolerance'] and reported_error<=cert['dollar_tolerance']
    cert['passed']=bool(cert['passed'] and price_error<=1e-7 and negative<=1e-7)
    return cert


def enumerate_commitments(case,specs,*,max_bits=16):
    bits=len(case.curves)*len(case.units)
    if bits>max_bits:
        raise ValueError('Enumeration is limited to an explicitly small benchmark')
    costs=[];best=None;best_on=None
    for candidate in itertools.product((0,1),repeat=bits):
        on=np.asarray(candidate).reshape(len(case.curves),len(case.units))
        try:
            result=price_fixed_commitment(case,specs,on)
        except RuntimeError:
            costs.append(None);continue
        costs.append(result['objective_dollars'])
        if best is None or result['objective_dollars']<best:
            best=result['objective_dollars'];best_on=on.tolist()
    if best is None:
        raise RuntimeError('No feasible enumerated commitment')
    return dict(candidates=2**bits,feasible_candidates=sum(c is not None for c in costs),costs=costs,
                best_objective_dollars=best,best_on=best_on)


def load_commitment_specs(path,case):
    import json
    from pathlib import Path
    units=json.loads(Path(path).read_text())['units']
    try:
        specs=tuple(CommitmentUnit(unit_id=u['unit_id'],**dict(u['commitment'],
            minimum_output_mw=tuple(u['commitment']['minimum_output_mw']))) for u in units)
    except (KeyError,TypeError) as error:
        raise ValueError('Every physical unit requires explicit complete commitment parameters') from error
    return validate_commitment(case,specs)


if __name__=='__main__':
    import argparse,hashlib,json,uuid
    from datetime import datetime,timezone
    from pathlib import Path
    from optimizer.energy_auction import PROJECT
    from optimizer.multihour_dispatch import load_operating_case
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',default=str(PROJECT/'data/operating_case.json'))
    parser.add_argument('--reserves',action='store_true',help='Use explicitly declared test reserve capabilities and zonal requirements')
    args=parser.parse_args();path=Path(args.case).resolve()
    if not path.is_relative_to(PROJECT):
        raise ValueError('Operating inputs must remain inside the project')
    case=load_operating_case(path);specs=load_commitment_specs(path,case)
    reserve=None
    if args.reserves:
        from optimizer.reserve_coupling import load_reserve_case
        reserve=load_reserve_case(path,case)
    energy_only=solve_commitment(case,specs) if reserve is not None else None
    result=solve_commitment(case,specs,reserve=reserve);pricing=price_fixed_commitment(case,specs,result['on'],reserve=reserve)
    if abs(pricing['objective_dollars']-result['objective_dollars'])>max(.01,abs(result['objective_dollars'])*1e-8):
        raise RuntimeError('Fixed-commitment redispatch disagrees with MILP objective')
    output=PROJECT/'results'/('commitment-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-')+uuid.uuid4().hex[:8])
    output.mkdir(parents=True);snapshot=json.loads(path.read_text())
    report=dict(status='complete',case=snapshot,intervals=len(case.curves),units=len(case.units),reserves_enabled=args.reserves,
        source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        implementation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),commitment=result,conditional_pricing=pricing)
    if energy_only is not None:
        report.update(energy_only=energy_only,reserve_cost_difference_dollars=result['objective_dollars']-energy_only['objective_dollars'])
        if report['reserve_cost_difference_dollars']<-.01:
            raise RuntimeError('Reserve requirements reduced the equal-input cost unexpectedly')
    (output/'commitment_report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    (output/'operating_case.json').write_text(json.dumps(snapshot,indent=2)+'\n')
    print('Completed commitment study:',output)
    print('Objective / bound / gap:',result['objective_dollars'],result['objective_bound_dollars'],result['mip_gap'])
    print('Startups:',sum(sum(row) for row in result['starts']))
