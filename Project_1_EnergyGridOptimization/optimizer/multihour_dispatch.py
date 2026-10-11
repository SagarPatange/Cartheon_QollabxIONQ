"""Continuous multi-interval dispatch on explicitly declared physical units."""
import math
import time
import json
from pathlib import Path
from dataclasses import dataclass, replace
from datetime import datetime
import numpy as np
from scipy import sparse
from scipy.optimize import linprog


def load_operating_case(path):
    from optimizer.energy_auction import Curve
    from optimizer.network_dispatch import Network, Branch
    data=json.loads(Path(path).read_text())
    net=data['network'];intervals=data['intervals']
    network=Network(tuple(net['buses']),tuple(Branch(**b) for b in net['branches']),net['reference'],net['base_mva'])
    units=tuple(Unit(u['unit_id'],u['node'],tuple(u['minimum_mw']),tuple(u['maximum_mw']),tuple(u['available']),
                     u['initial_dispatch_mw'],u['ramp_up_mw_per_hour'],u['ramp_down_mw_per_hour']) for u in data['units'])
    case=DispatchCase(network,tuple(i['end'] for i in intervals),tuple(i['duration_hours'] for i in intervals),
        tuple(tuple(Curve(r['row_id'],r['RCode'],r['side'],tuple(tuple(p) for p in r['points']),r['slope'])
                    for r in i['submissions']) for i in intervals),
        tuple(tuple(r['node'] for r in i['submissions']) for i in intervals),
        tuple(tuple(r['unit_id'] for r in i['submissions']) for i in intervals),
        tuple(tuple(r['type'] for r in i['submissions']) for i in intervals),
        tuple(tuple(i['demand_mw']) for i in intervals),units)
    validate_case(case)
    return case


@dataclass(frozen=True)
class Unit:
    unit_id: str
    node: str
    minimum_mw: tuple
    maximum_mw: tuple
    available: tuple
    initial_dispatch_mw: float
    ramp_up_mw_per_hour: float
    ramp_down_mw_per_hour: float


@dataclass(frozen=True)
class DispatchCase:
    network: object
    interval_end: tuple
    interval_hours: tuple
    curves: tuple
    nodes: tuple
    unit_ids: tuple
    row_types: tuple
    demand: tuple
    units: tuple


def validate_case(case):
    case.network.matrices()
    t=len(case.interval_end)
    if not t or any(len(v)!=t for v in [case.interval_hours,case.curves,case.nodes,case.unit_ids,case.row_types,case.demand]):
        raise ValueError('Require complete interval-aligned data')
    ends=[datetime.fromisoformat(v) for v in case.interval_end]
    if any(v.utcoffset() is None for v in ends) or any(not math.isfinite(d) or d<=0 for d in case.interval_hours):
        raise ValueError('Require timezone-aware intervals and positive durations')
    if any(abs((ends[h]-ends[h-1]).total_seconds()/3600-case.interval_hours[h])>1e-8 for h in range(1,t)):
        raise ValueError('Intervals must be chronological, contiguous and match durations')
    units={u.unit_id:u for u in case.units}
    if len(units)!=len(case.units):
        raise ValueError('Duplicate physical unit ID')
    for u in case.units:
        if u.node not in case.network.buses or any(len(v)!=t for v in [u.minimum_mw,u.maximum_mw,u.available]):
            raise ValueError('Incomplete unit bounds or unknown unit node')
        if any(type(a) is not bool for a in u.available):
            raise ValueError('Availability must be explicit Boolean')
        vals=[*u.minimum_mw,*u.maximum_mw,u.initial_dispatch_mw,u.ramp_up_mw_per_hour,u.ramp_down_mw_per_hour]
        if not all(math.isfinite(v) and v>=0 for v in vals) or any(lo>hi for lo,hi in zip(u.minimum_mw,u.maximum_mw)):
            raise ValueError('Invalid physical limits or ramps')
        if u.initial_dispatch_mw>max(u.maximum_mw):
            raise ValueError('Initial dispatch exceeds declared capability')
    for h,cs in enumerate(case.curves):
        if not cs or any(len(v[h])!=len(cs) for v in [case.nodes,case.unit_ids,case.row_types]):
            raise ValueError('Require explicit node/type/unit mapping for each source row')
        if len({c.row_id for c in cs})!=len(cs):
            raise ValueError('Duplicate source-row ID in an interval')
        demand=np.asarray(case.demand[h],dtype=float)
        if demand.shape!=(len(case.network.buses),) or not np.all(np.isfinite(demand)) or np.any(demand<0):
            raise ValueError('Require complete finite nonnegative nodal demand')
        for c,node,uid,kind in zip(cs,case.nodes[h],case.unit_ids[h],case.row_types[h]):
            if node not in case.network.buses or kind not in ('physical','virtual','bid','interchange'):
                raise ValueError('Invalid node or submission type')
            if kind=='physical':
                if uid not in units or units[uid].node!=node or c.side!=1 or c.lower<0:
                    raise ValueError('Physical generator requires valid unit mapping and nonnegative offer')
            elif uid is not None:
                raise ValueError('Financial/interchange submissions cannot acquire physical unit limits')
        if set(uid for uid in case.unit_ids[h] if uid is not None)!=set(units):
            raise ValueError('Every declared unit requires its explicitly mapped submissions each interval')
    return units


def build_dispatch_model(case):
    """Original segment costs plus nodal, aggregate-unit and temporal rows."""
    validate_case(case)
    _,_,_,ptdf,_=case.network.matrices()
    t=len(case.curves);m=len(case.network.branches)
    owners=[];linear=[];quad=[];widths=[];bases=[];constant=0.
    for h,cs in enumerate(case.curves):
        bases.append(np.array([c.lower for c in cs]))
        for j,c in enumerate(cs):
            constant+=case.interval_hours[h]*c.side*c.integral(c.lower)
            for left,right,p,g in c.pieces():
                if right>left:
                    owners.append((h,j));widths.append(right-left)
                    linear.append(case.interval_hours[h]*c.side*p)
                    quad.append(case.interval_hours[h]*c.side*g)
    n=len(owners)
    if not n:
        raise ValueError('Require at least one variable segment')
    row_matrices=[];unit_matrices=[];unit_bases=[];node_matrices=[];node_bases=[]
    for h,cs in enumerate(case.curves):
        mat=np.zeros((len(cs),n))
        for k,(owner,j) in enumerate(owners):
            if owner==h:
                mat[j,k]=1.
        row_matrices.append(mat)
        jmat=np.zeros((len(case.network.buses),len(cs)))
        umat=np.zeros((len(case.units),len(cs)))
        for j,c in enumerate(cs):
            jmat[case.network.buses.index(case.nodes[h][j]),j]=c.side
            if case.unit_ids[h][j] is not None:
                idx=next(i for i,u in enumerate(case.units) if u.unit_id==case.unit_ids[h][j])
                umat[idx,j]=1.
        node_matrices.append(jmat@mat);node_bases.append(jmat@bases[h])
        unit_matrices.append(umat@mat);unit_bases.append(umat@bases[h])
    eq=[];ineq=[];eq_meta=[];ineq_meta=[]
    def equal(row,rhs,meta):
        eq.append((row,rhs));eq_meta.append(meta)
    def upper(row,rhs,meta):
        ineq.append((row,rhs));ineq_meta.append(meta)
    for h in range(t):
        injection=node_bases[h]-np.asarray(case.demand[h])
        equal(np.sum(node_matrices[h],axis=0),-sum(injection),('balance',h))
        for k,b in enumerate(case.network.branches):
            row=ptdf[k]@node_matrices[h];base=ptdf[k]@injection
            upper(row,b.limit_mw-base,('flow_upper',h,k))
            upper(-row,b.limit_mw+base,('flow_lower',h,k))
        for i,u in enumerate(case.units):
            lo=u.minimum_mw[h] if u.available[h] else 0.
            hi=u.maximum_mw[h] if u.available[h] else 0.
            row=unit_matrices[h][i];base=unit_bases[h][i]
            upper(row,hi-base,('unit_upper',h,i))
            upper(-row,-lo+base,('unit_lower',h,i))
            ramp=row-(unit_matrices[h-1][i] if h else 0.)
            change=base-(unit_bases[h-1][i] if h else u.initial_dispatch_mw)
            upper(ramp,u.ramp_up_mw_per_hour*case.interval_hours[h]-change,('ramp_up',h,i))
            upper(-ramp,u.ramp_down_mw_per_hour*case.interval_hours[h]+change,('ramp_down',h,i))
    physical_count=len(eq)+len(ineq)
    for k,w in enumerate(widths):
        row=np.zeros(n);row[k]=1.
        upper(row,w,('segment_upper',k));upper(-row,0.,('segment_lower',k))
    entries=eq+ineq
    return dict(a=sparse.csc_matrix(np.asarray([r for r,b in entries])),b=np.asarray([b for r,b in entries]),
        linear=np.asarray(linear),quad=np.asarray(quad),widths=np.asarray(widths),constant=constant,
        owners=owners,bases=bases,row_matrices=row_matrices,unit_matrices=unit_matrices,unit_bases=unit_bases,
        neq=len(eq),physical_count=physical_count,meta=eq_meta+ineq_meta,ptdf=ptdf)


def price_components(case,model,dual):
    t=len(case.curves);m=len(case.network.branches)
    mec=np.zeros(t);yu=np.zeros((t,m));yl=np.zeros((t,m))
    for z,meta in zip(dual,model['meta']):
        if meta[0]=='balance':
            mec[meta[1]]=-z/case.interval_hours[meta[1]]
        elif meta[0] in ('flow_upper','flow_lower'):
            (yu if meta[0]=='flow_upper' else yl)[meta[1],meta[2]]=z/case.interval_hours[meta[1]]
    mcc=-(yu-yl)@model['ptdf']
    return mec,mcc,mec[:,None]+mcc


def solve_multihour(case):
    started=time.perf_counter();model=build_dispatch_model(case)
    a,b=model['a'],model['b'];neq=model['neq'];c,p=model['linear'],model['quad']
    if not np.any(p):
        sol=linprog(c,A_eq=a[:neq],b_eq=b[:neq],A_ub=a[neq:],b_ub=b[neq:],
                    bounds=[(None,None)]*len(c),method='highs')
        if not sol.success:
            raise RuntimeError(f'Multi-hour LP failed: {sol.message}')
        x=sol.x;dual=np.r_[-sol.eqlin.marginals,-sol.ineqlin.marginals]
        solver='HiGHS multi-hour LP';status=sol.message
    else:
        import clarabel
        settings=clarabel.DefaultSettings();settings.verbose=False;settings.max_iter=200
        settings.tol_gap_abs=1e-10;settings.tol_gap_rel=1e-10;settings.tol_feas=1e-10;settings.time_limit=60.
        sol=clarabel.DefaultSolver(sparse.diags(p,format='csc'),c,a,b,
             [clarabel.ZeroConeT(neq),clarabel.NonnegativeConeT(len(b)-neq)],settings).solve()
        if str(sol.status)!='Solved':
            raise RuntimeError(f'Multi-hour QP failed: {sol.status}')
        x=np.asarray(sol.x);dual=np.asarray(sol.z);solver='Clarabel multi-hour QP';status=str(sol.status)
    quantities=[(base+mat@x).tolist() for base,mat in zip(model['bases'],model['row_matrices'])]
    mec,mcc,prices=price_components(case,model,dual)
    flows=[];generation=[]
    for h,cs in enumerate(case.curves):
        inj=np.zeros(len(case.network.buses))
        for c,node,q in zip(cs,case.nodes[h],quantities[h]):
            inj[case.network.buses.index(node)]+=c.side*q
        flows.append((model['ptdf']@(inj-np.asarray(case.demand[h]))).tolist())
        generation.append((model['unit_bases'][h]+model['unit_matrices'][h]@x).tolist())
    result=dict(solver=solver,status=status,quantities=quantities,segment_quantities=x.tolist(),dual=dual.tolist(),
        unit_generation_mw=generation,flows_mw=flows,mec=mec.tolist(),mcc=mcc.tolist(),
        mlc=np.zeros_like(prices).tolist(),nodal_prices=prices.tolist(),
        objective_dollars=sum(dt*sum(c.side*c.integral(q) for c,q in zip(cs,qs))
            for dt,cs,qs in zip(case.interval_hours,case.curves,quantities)),elapsed_seconds=time.perf_counter()-started)
    result['verification']=verify_multihour(case,result)
    if not result['verification']['passed']:
        raise RuntimeError(f'Multi-hour certificate failed: {result["verification"]}')
    return result


def valid_export_arrays(result, shapes):
    """Reject missing, malformed or nonfinite exports before residual reductions."""
    try:
        return all(np.asarray(result[key],dtype=float).shape==shape and
                   np.all(np.isfinite(np.asarray(result[key],dtype=float)))
                   for key,shape in shapes.items())
    except (KeyError,TypeError,ValueError):
        return False


def verify_multihour(case,result):
    model=build_dispatch_model(case);incidence,bf,bbus,ptdf,keep=case.network.matrices()
    t=len(case.curves);n=len(case.network.buses)
    shapes={'flows_mw':(t,len(case.network.branches)), 'unit_generation_mw':(t,len(case.units)),
            'segment_quantities':model['linear'].shape,'dual':model['b'].shape,
            'mec':(t,), 'mcc':(t,n),'mlc':(t,n),'nodal_prices':(t,n),'objective_dollars':()}
    if not valid_export_arrays(result,shapes):
        return dict(passed=False,error='Invalid numerical exports')
    quantities=result['quantities'];dual=np.asarray(result['dual']);x=np.asarray(result['segment_quantities'])
    if len(quantities)!=len(case.curves) or any(len(q)!=len(cs) for q,cs in zip(quantities,case.curves)):
        return dict(passed=False,error='Incomplete awards')
    if dual.shape!=model['b'].shape or x.shape!=model['linear'].shape or not np.all(np.isfinite(dual)):
        return dict(passed=False,error='Invalid dual/segment certificate')
    balance=network_error=unit_error=ramp_error=submission_error=export_error=0.;objective=0.
    previous=np.array([u.initial_dispatch_mw for u in case.units]);gens=[]
    for h,(cs,qs) in enumerate(zip(case.curves,quantities)):
        inj=-np.asarray(case.demand[h],dtype=float).copy();gen=np.zeros(len(case.units))
        for c,node,uid,q in zip(cs,case.nodes[h],case.unit_ids[h],qs):
            if not math.isfinite(q):
                return dict(passed=False,error='Nonfinite award')
            inj[case.network.buses.index(node)]+=c.side*q
            if uid is not None:
                gen[next(i for i,u in enumerate(case.units) if u.unit_id==uid)]+=q
            submission_error=max(submission_error,c.lower-q,q-c.upper)
            objective+=case.interval_hours[h]*c.side*c.integral(q)
        balance=max(balance,abs(sum(inj)))
        angles=np.zeros(len(case.network.buses))
        if keep:
            angles[keep]=np.linalg.solve(bbus[np.ix_(keep,keep)],inj[keep])
        flow=ptdf@inj;limits=np.array([b.limit_mw for b in case.network.branches])
        network_error=max(network_error,float(np.max(abs(flow)-limits,initial=0.)),
            float(np.max(abs(bf@angles-flow),initial=0.)),float(np.max(abs(incidence.T@flow-inj),initial=0.)))
        export_error=max(export_error,float(np.max(abs(flow-np.asarray(result['flows_mw'][h])),initial=0.)),
            float(np.max(abs(gen-np.asarray(result['unit_generation_mw'][h])),initial=0.)),
            float(np.max(abs(np.asarray(qs)-(model['bases'][h]+model['row_matrices'][h]@x)),initial=0.)))
        for i,u in enumerate(case.units):
            lo=u.minimum_mw[h] if u.available[h] else 0.;hi=u.maximum_mw[h] if u.available[h] else 0.
            unit_error=max(unit_error,lo-gen[i],gen[i]-hi)
            ramp_error=max(ramp_error,gen[i]-previous[i]-u.ramp_up_mw_per_hour*case.interval_hours[h],
                previous[i]-gen[i]-u.ramp_down_mw_per_hour*case.interval_hours[h])
        previous=gen;gens.append(gen.tolist())
    physical=model['physical_count'];grad=model['linear']+model['a'][:physical].T@dual[:physical]
    w=model['widths'];p=model['quad'];minimizers=np.where(grad<0,w,0.)
    curved=p>0;minimizers[curved]=np.clip(-grad[curved]/p[curved],0.,w[curved])
    dual_bound=model['constant']-model['b'][:physical]@dual[:physical]+sum(.5*p*minimizers**2+grad*minimizers)
    mec,mcc,prices=price_components(case,model,dual)
    price_error=max(float(np.max(abs(prices-np.asarray(result['nodal_prices'])),initial=0.)),
        float(np.max(abs(mec-np.asarray(result['mec'])),initial=0.)),
        float(np.max(abs(mcc-np.asarray(result['mcc'])),initial=0.)),
        float(np.max(abs(np.asarray(result['mlc'])),initial=0.)))
    errors=dict(balance_error_mw=float(balance),network_error_mw=float(network_error),unit_bound_error_mw=float(unit_error),
        ramp_error_mw=float(ramp_error),submission_bound_error_mw=float(submission_error),export_error_mw=float(export_error),
        price_decomposition_error=price_error,objective_error_dollars=abs(objective-result['objective_dollars']),
        negative_dual_error=float(max(-np.min(dual[model['neq']:],initial=0.),0.)),
        dual_lower_bound_dollars=float(dual_bound),primal_dual_gap_dollars=float(objective-dual_bound))
    tolerance=max(.01,abs(objective)*1e-8)
    passed=all(math.isfinite(v) for v in errors.values()) and all(errors[k]<=1e-5 for k in
        ['balance_error_mw','network_error_mw','unit_bound_error_mw','ramp_error_mw','submission_bound_error_mw','export_error_mw'])
    passed=passed and price_error<=1e-7 and errors['negative_dual_error']<=1e-7
    passed=passed and errors['objective_error_dollars']<=tolerance and abs(errors['primal_dual_gap_dollars'])<=tolerance
    return dict(passed=bool(passed),**errors,dollar_tolerance=tolerance)


def compare_temporal(case):
    linked=solve_multihour(case)
    units=tuple(replace(u,ramp_up_mw_per_hour=max(u.maximum_mw)/min(case.interval_hours),
                         ramp_down_mw_per_hour=max(u.maximum_mw)/min(case.interval_hours)) for u in case.units)
    unlinked=solve_multihour(replace(case,units=units))
    difference=linked['objective_dollars']-unlinked['objective_dollars']
    if difference < -max(.01,abs(linked['objective_dollars'])*1e-8):
        raise RuntimeError('Adding ramp constraints improved a minimization objective unexpectedly')
    return dict(linked=linked,unlinked_control=unlinked,ramp_cost_difference_dollars=difference,
                control_ramps={u.unit_id:u.ramp_up_mw_per_hour for u in units})


if __name__=='__main__':
    import argparse
    import hashlib
    import uuid
    from datetime import timezone
    from optimizer.energy_auction import PROJECT
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',default=str(PROJECT/'data/operating_case.json'))
    args=parser.parse_args();path=Path(args.case).resolve()
    if not path.is_relative_to(PROJECT):
        raise ValueError('Operating data must remain inside the project')
    case=load_operating_case(path);comparison=compare_temporal(case)
    output=PROJECT/'results'/('temporal-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-')+uuid.uuid4().hex[:8])
    output.mkdir(parents=True)
    snapshot=json.loads(path.read_text())
    report=dict(status='complete',case=snapshot,intervals=len(case.curves),units=len(case.units),
        source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        implementation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),**comparison)
    (output/'temporal_report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    (output/'operating_case.json').write_text(json.dumps(snapshot,indent=2)+'\n')
    print('Completed temporal study:',output)
    print(json.dumps({k:v for k,v in report.items() if k in ('intervals','units','ramp_cost_difference_dollars')},indent=2))
    print('Linked objective:',comparison['linked']['objective_dollars'])
    print('Unlinked control objective:',comparison['unlinked_control']['objective_dollars'])
