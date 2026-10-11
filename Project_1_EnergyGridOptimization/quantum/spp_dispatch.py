"""Bounded actual-offer dispatch table; no invented commitment parameters."""
import math
import time
from optimizer.energy_auction import verify

def conditional_price(curve,q):
    if q<=curve.lower+1e-7 or q>=curve.upper-1e-7:
        return dict(value=None,range=None,status='At quantity bound; no unique conditional price')
    values=[]
    for a,b,p,g in curve.pieces():
        if a-1e-7<=q<=b+1e-7:values.append(p+g*(min(b,max(a,q))-a))
    lo,hi=min(values),max(values)
    return dict(value=(lo+hi)/2 if hi-lo<=1e-7 else None,range=[lo,hi],status='unique' if hi-lo<=1e-7 else 'Marginal price interval at a kink')

def build_spp_oracle(curves,baseline,*,max_bits=4,step_mw=1.0):
    started=time.perf_counter()
    if type(max_bits) is not int or not 1<=max_bits<=4 or not math.isfinite(step_mw) or not 0<step_mw<=1:
        raise ValueError('Require 1-4 bits and positive step at most 1 MW')
    awards=baseline.get('awards',[])
    if len(awards)!=len(curves) or [a['row_id'] for a in awards]!=[c.row_id for c in curves]:
        raise ValueError('Baseline source rows do not match')
    quantities=[a['quantity_mw'] for a in awards]
    original=dict(quantities=quantities,fixed_demand_mw=baseline['fixed_demand_mw'],objective_dollars=baseline['objective_dollars'],clearing_price_dollars_per_mwh=baseline['model_price_dollars_per_mwh'])
    check=verify(curves,original)
    if not check['passed']:raise ValueError('Require certified original baseline')
    interior=sorted((i for i,c in enumerate(curves) if min(quantities[i]-c.lower,c.upper-quantities[i])>1e-6),key=lambda i:(-min(quantities[i]-curves[i].lower,curves[i].upper-quantities[i]),curves[i].row_id))
    unavailable=lambda reason:dict(status='unavailable',reason=reason)
    if not interior:return unavailable('No interior balancing submission')
    balancer=interior[0];price=baseline['model_price_dollars_per_mwh']
    def distance(i):
        vals=[p+g*(min(b,max(a,quantities[i]))-a) for a,b,p,g in curves[i].pieces() if a-1e-7<=quantities[i]<=b+1e-7]
        return max(min(vals)-price,price-max(vals),0) if vals else math.inf
    candidates=sorted((i for i,c in enumerate(curves) if i!=balancer and c.upper-c.lower>1e-6),key=lambda i:(distance(i),curves[i].row_id))[:max_bits]
    if not candidates:return unavailable('No adjustable decision submission')
    levels=[]
    for i in candidates:
        c=curves[i];q=quantities[i];up,down=c.upper-q,q-c.lower
        direction=1 if up>=down else -1
        step=min(step_mw,.1*(c.upper-c.lower),up if direction==1 else down)
        levels.append([q,q+direction*step])
    frozen=[i for i in range(len(curves)) if i not in candidates and i!=balancer]
    frozen_net=sum(curves[i].side*quantities[i] for i in frozen)
    frozen_cost=sum(curves[i].side*curves[i].integral(quantities[i]) for i in frozen)
    entries=[];n=len(candidates)
    for index in range(1<<n):
        q=quantities.copy()
        for bit,i in enumerate(candidates):q[i]=levels[bit][(index>>bit)&1]
        residual=baseline['fixed_demand_mw']-frozen_net-sum(curves[i].side*q[i] for i in candidates)
        q[balancer]=residual/curves[balancer].side
        bounds=max(max(c.lower-v,v-c.upper,0) for c,v in zip(curves,q))
        balance=abs(sum(c.side*v for c,v in zip(curves,q))-baseline['fixed_demand_mw'])
        feasible=bounds<=1e-6 and balance<=1e-5
        objective=sum(c.side*c.integral(v) for c,v in zip(curves,q)) if feasible else None
        if feasible and objective<baseline['objective_dollars']-check['tolerances']['dollars']:raise RuntimeError('Candidate contradicts certified full-auction optimum')
        entries.append(dict(index=index,bitstring=f'{index:0{n}b}',feasible=feasible,objective_dollars=objective,quantities=q,conditional_price=conditional_price(curves[balancer],q[balancer]) if feasible else None,verification=dict(passed=feasible,balance_error_mw=balance,bound_error_mw=bounds)))
    feasible=[e['objective_dollars'] for e in entries if e['feasible']]
    if not feasible or max(feasible)-min(feasible)<=1e-7:return unavailable('No distinct feasible cost alternative in this neighborhood')
    best=min(feasible);maxcost=max(feasible)
    penalty=maxcost+max(1,maxcost-best,abs(maxcost)*.01)
    return dict(status='ready',n_bits=n,costs=[e['objective_dollars'] if e['feasible'] else penalty for e in entries],entries=entries,best_objective_dollars=best,optimal_indices=[e['index'] for e in entries if e['feasible'] and abs(e['objective_dollars']-best)<=1e-7],penalty_dollars=penalty,decisions=[dict(bit=b,row_id=curves[i].row_id,rcode=curves[i].rcode,levels_mw=levels[b]) for b,i in enumerate(candidates)],balancing_row_id=curves[balancer].row_id,frozen_count=len(frozen),frozen_net_injection_mw=frozen_net,frozen_cost_dollars=frozen_cost,baseline_quantities=quantities,source_rows=[c.row_id for c in curves],selection_rule='Largest interior slack balances; nearest marginal price decisions; move toward greatest headroom by min(1 MW, 10% range, headroom)',timing=dict(preparation_seconds=time.perf_counter()-started,pricing_evaluations=len(entries)))
