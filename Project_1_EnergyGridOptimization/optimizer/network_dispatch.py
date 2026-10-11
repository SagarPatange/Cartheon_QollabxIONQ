"""Continuous DC nodal dispatch; explicit network/mapping inputs, N01-N05.

No inferred SPP topology, unit identities, reserve capability or commitment.
Optional affine loss sensitivities define an explicit approximation, not AC OPF.
"""
import math
import time
from dataclasses import dataclass
import numpy as np
from scipy import sparse
from scipy.optimize import linprog


@dataclass(frozen=True)
class Branch:
    name: str
    from_bus: str
    to_bus: str
    reactance_pu: float
    limit_mw: float


@dataclass(frozen=True)
class Network:
    buses: tuple
    branches: tuple
    reference: str
    base_mva: float

    def matrices(self):
        if not self.buses or len(set(self.buses)) != len(self.buses) or self.reference not in self.buses:
            raise ValueError('Require unique buses and a valid reference bus')
        if not math.isfinite(self.base_mva) or self.base_mva <= 0:
            raise ValueError('Require positive finite baseMVA')
        if len({b.name for b in self.branches}) != len(self.branches):
            raise ValueError('Duplicate branch identifier')
        incidence = np.zeros((len(self.branches), len(self.buses)))
        susceptance = []
        for k, b in enumerate(self.branches):
            if b.from_bus not in self.buses or b.to_bus not in self.buses or b.from_bus == b.to_bus:
                raise ValueError('Invalid branch endpoints')
            if not math.isfinite(b.reactance_pu) or b.reactance_pu <= 0:
                raise ValueError('Require positive branch reactance')
            if not math.isfinite(b.limit_mw) or b.limit_mw < 0:
                raise ValueError('Require finite nonnegative MW rating')
            incidence[k,self.buses.index(b.from_bus)] = 1.
            incidence[k,self.buses.index(b.to_bus)] = -1.
            susceptance.append(self.base_mva/b.reactance_pu)
        bf = np.asarray(susceptance)[:,None]*incidence
        bbus = incidence.T @ bf
        keep = [i for i,b in enumerate(self.buses) if b != self.reference]
        reduced = bbus[np.ix_(keep,keep)]
        if np.linalg.matrix_rank(reduced) != len(keep):
            raise ValueError('Network is disconnected; separate island balances are required')
        ptdf = np.zeros_like(incidence)
        if keep:
            ptdf[:,keep] = np.linalg.solve(reduced,bf[:,keep].T).T
        return incidence, bf, bbus, ptdf, keep


def _inputs(curves, nodes, network, demand, loss_sensitivity, loss_offset_mw, dispatch_bounds):
    network.matrices()
    if not curves or len(curves) != len(nodes) or any(n not in network.buses for n in nodes):
        raise ValueError('Every submission requires an explicit valid node')
    if len({c.row_id for c in curves}) != len(curves):
        raise ValueError('Duplicate source-row identifiers')
    demand = np.asarray(demand,dtype=float)
    loss = np.zeros(len(network.buses)) if loss_sensitivity is None else np.asarray(loss_sensitivity,dtype=float)
    if demand.shape != (len(network.buses),) or not np.all(np.isfinite(demand)) or np.any(demand < 0):
        raise ValueError('Require finite nonnegative nodal demand')
    if loss.shape != demand.shape or not np.all(np.isfinite(loss)) or np.any(1-loss <= 0):
        raise ValueError('Invalid loss sensitivities')
    if abs(loss[network.buses.index(network.reference)]) > 1e-12:
        raise ValueError('Reference-bus loss sensitivity must be zero')
    if not math.isfinite(loss_offset_mw):
        raise ValueError('Nonfinite loss offset')
    bounds = dispatch_bounds or {}
    if set(bounds)-{c.row_id for c in curves}:
        raise ValueError('Operating bounds contain an unknown submission')
    domains = []
    for c in curves:
        lo,hi = bounds.get(c.row_id,(c.lower,c.upper))
        if not all(math.isfinite(q) for q in (lo,hi)) or lo>hi or lo<c.lower or hi>c.upper:
            raise ValueError(f'{c.row_id}: operating bounds outside submitted study domain')
        domains.append((lo,hi))
    return demand,loss,domains


def _curve_minimum(c, lo, hi, price):
    candidates = [lo,hi]
    for left,right,p,g in c.pieces():
        candidates.extend((max(lo,min(hi,left)),max(lo,min(hi,right))))
        if g:
            q=left+(price-p)/g
            if max(left,lo)<=q<=min(right,hi):
                candidates.append(q)
    return min(c.side*(c.integral(q)-price*q) for q in candidates)


def solve_network(curves, nodes, network, demand, *, loss_sensitivity=None,
                  loss_offset_mw=0., dispatch_bounds=None):
    started = time.perf_counter()
    demand,loss,domains = _inputs(curves,nodes,network,demand,loss_sensitivity,loss_offset_mw,dispatch_bounds)
    _,_,_,ptdf,_ = network.matrices()
    beta = 1-loss
    node_ids = np.asarray([network.buses.index(n) for n in nodes])
    sides = np.asarray([c.side for c in curves])
    lower = np.asarray([lo for lo,hi in domains])
    base = np.bincount(node_ids,weights=sides*lower,minlength=len(network.buses))
    linear,quad,widths,owners = [],[],[],[]
    for i,(c,(lo,hi)) in enumerate(zip(curves,domains)):
        for left,right,p,g in c.pieces():
            a,b=max(left,lo),min(right,hi)
            if b>a:
                linear.append(c.side*(p+g*(a-left)))
                quad.append(c.side*g)
                widths.append(b-a)
                owners.append(i)
    linear,quad,widths = map(np.asarray,(linear,quad,widths))
    owners=np.asarray(owners,dtype=int)
    n,m=len(widths),len(network.branches)
    limits=np.asarray([b.limit_mw for b in network.branches])
    mw_scale,price_scale=100.,1000.
    if n:
        segnodes=node_ids[owners]; segsides=sides[owners]
        balance=sparse.csc_matrix((beta[segnodes]*segsides).reshape(1,-1))
        flow=sparse.csc_matrix(ptdf[:,segnodes]*segsides)
        rhs=np.r_[(beta@(demand-base)+loss_offset_mw)/mw_scale,
                  (limits+ptdf@(demand-base))/mw_scale,
                  (limits-ptdf@(demand-base))/mw_scale,
                  widths/mw_scale,np.zeros(n)]
        a=sparse.vstack([balance,flow,-flow,sparse.eye(n),-sparse.eye(n)],format='csc')
        if not np.any(quad):
            sol=linprog(linear/price_scale,A_eq=a[:1],b_eq=rhs[:1],
                        A_ub=a[1:],b_ub=rhs[1:],bounds=[(None,None)]*n,method='highs')
            if not sol.success:
                raise RuntimeError(f'Network LP failed: {sol.message}')
            x=sol.x*mw_scale
            dual=np.r_[-sol.eqlin.marginals,-sol.ineqlin.marginals]*price_scale
            solver,status,iterations='HiGHS network LP',sol.message,sol.nit
        else:
            import clarabel
            settings=clarabel.DefaultSettings()
            settings.verbose=False
            settings.max_iter=200
            settings.time_limit=60.
            settings.tol_gap_abs=1e-11
            settings.tol_gap_rel=1e-11
            settings.tol_feas=1e-11
            model=clarabel.DefaultSolver(sparse.diags(quad*mw_scale/price_scale,format='csc'),
                    linear/price_scale,a,rhs,[clarabel.ZeroConeT(1),
                    clarabel.NonnegativeConeT(len(rhs)-1)],settings)
            sol=model.solve()
            if str(sol.status) != 'Solved':
                raise RuntimeError(f'Constrained network QP did not solve: {sol.status}')
            x=np.asarray(sol.x)*mw_scale;dual=np.asarray(sol.z)*price_scale
            solver,status,iterations='Clarabel network QP',str(sol.status),sol.iterations
        quantities=lower.copy()
        np.add.at(quantities,owners,x)
    else:
        quantities=lower;dual=np.zeros(1+2*m);solver,status,iterations='Fixed domains','trivial',0
    mec=-float(dual[0])
    upper_dual=dual[1:1+m];lower_dual=dual[1+m:1+2*m]
    mcc=-ptdf.T@(upper_dual-lower_dual)
    mlc=-mec*loss
    prices=mec+mcc+mlc
    injection=np.bincount(node_ids,weights=sides*quantities,minlength=len(network.buses))-demand
    result=dict(solver=solver,status=status,iterations=int(iterations),
        quantities=quantities.tolist(),objective_dollars=sum(c.side*c.integral(q) for c,q in zip(curves,quantities)),
        mec=mec,mcc=mcc.tolist(),mlc=mlc.tolist(),nodal_prices=prices.tolist(),
        flows_mw=(ptdf@injection).tolist(),net_injection_mw=injection.tolist(),
        losses_mw=float(loss_offset_mw+loss@injection),
        upper_flow_duals=upper_dual.tolist(),lower_flow_duals=lower_dual.tolist(),
        elapsed_seconds=time.perf_counter()-started)
    result['verification']=verify_network(curves,nodes,network,demand,result,
                 loss_sensitivity=loss,loss_offset_mw=loss_offset_mw,dispatch_bounds=dispatch_bounds)
    if not result['verification']['passed']:
        raise RuntimeError(f'Constrained network certificate failed: {result["verification"]}')
    return result


def verify_network(curves, nodes, network, demand, result, *, loss_sensitivity=None,
                   loss_offset_mw=0., dispatch_bounds=None):
    demand,loss,domains=_inputs(curves,nodes,network,demand,loss_sensitivity,loss_offset_mw,dispatch_bounds)
    incidence,bf,bbus,ptdf,keep=network.matrices()
    q=np.asarray(result['quantities']);prices=np.asarray(result['nodal_prices'])
    if q.shape!=(len(curves),) or prices.shape!=demand.shape or not np.all(np.isfinite(q)):
        return dict(passed=False,error='Invalid awards/prices')
    injection=np.zeros(len(network.buses))
    for c,node,quantity in zip(curves,nodes,q):
        injection[network.buses.index(node)]+=c.side*quantity
    injection-=demand
    losses=loss_offset_mw+loss@injection
    balanced=injection.copy();balanced[network.buses.index(network.reference)]-=losses
    angles=np.zeros(len(network.buses))
    if keep:
        angles[keep]=np.linalg.solve(bbus[np.ix_(keep,keep)],balanced[keep])
    flows=ptdf@injection
    limits=np.asarray([b.limit_mw for b in network.branches])
    upper=np.asarray(result['upper_flow_duals']);lower=np.asarray(result['lower_flow_duals'])
    mec=result['mec']
    mcc=-ptdf.T@(upper-lower);mlc=-mec*loss
    obj=sum(c.side*c.integral(v) for c,v in zip(curves,q))
    dual_bound=sum(_curve_minimum(c,lo,hi,prices[network.buses.index(node)])
                   for c,node,(lo,hi) in zip(curves,nodes,domains))
    dual_bound+=float(prices@demand+mec*loss_offset_mw-limits@(upper+lower))
    gap=obj-dual_bound
    errors=dict(balance_error_mw=abs(sum(injection)-losses),
        bound_error_mw=max(max(lo-v,v-hi,0.) for (lo,hi),v in zip(domains,q)),
        flow_limit_error_mw=float(max(np.maximum(abs(flows)-limits,0.),default=0.)),
        kirchhoff_error_mw=float(max(np.max(abs(bf@angles-flows),initial=0.),
                                    np.max(abs(incidence.T@flows-balanced),initial=0.))),
        exported_flow_error_mw=float(np.max(abs(flows-np.asarray(result['flows_mw'])),initial=0.)),
        price_decomposition_error=float(max(np.max(abs(prices-(mec+mcc+mlc)),initial=0.),
                                    np.max(abs(mcc-np.asarray(result['mcc'])),initial=0.),
                                    np.max(abs(mlc-np.asarray(result['mlc'])),initial=0.))),
        objective_error_dollars=abs(obj-result['objective_dollars']),
        dual_lower_bound_dollars=float(dual_bound),primal_dual_gap_dollars=float(gap),
        negative_dual_error=float(max(-np.min(upper,initial=0.),-np.min(lower,initial=0.),0.)))
    dollar_tolerance=max(.05,abs(obj)*1e-8)
    finite=all(math.isfinite(float(v)) for v in errors.values()) and math.isfinite(float(losses))
    passed=finite and errors['balance_error_mw']<=1e-5 and errors['bound_error_mw']<=1e-6
    passed=passed and all(errors[k]<=1e-5 for k in ['flow_limit_error_mw','kirchhoff_error_mw','exported_flow_error_mw'])
    passed=passed and errors['price_decomposition_error']<=1e-7 and errors['negative_dual_error']<=1e-7
    passed=passed and errors['objective_error_dollars']<=dollar_tolerance and -dollar_tolerance<=gap<=dollar_tolerance
    passed=passed and losses>=-1e-5
    return dict(passed=bool(passed),**errors,losses_mw=float(losses),angles_radians=angles.tolist(),
                dollar_tolerance=dollar_tolerance)
