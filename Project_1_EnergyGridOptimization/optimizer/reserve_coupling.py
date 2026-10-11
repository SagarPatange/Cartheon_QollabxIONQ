"""One declared upward spinning-reserve product, explicit zonal requirements."""
import math
from dataclasses import dataclass
import numpy as np
from scipy import sparse


@dataclass(frozen=True)
class ReserveUnit:
    unit_id: str
    zone: str
    eligible_mw: tuple
    price_dollars_per_mw_hour: tuple
    response_hours: float


@dataclass(frozen=True)
class ReserveCase:
    units: tuple
    requirements_mw: dict


def validate_reserve(case,reserve):
    by_id={r.unit_id:r for r in reserve.units}
    if len(by_id)!=len(reserve.units) or set(by_id)!={u.unit_id for u in case.units}:
        raise ValueError('Require one reserve declaration per physical unit')
    ordered=tuple(by_id[u.unit_id] for u in case.units);t=len(case.curves)
    if set(reserve.requirements_mw)!={r.zone for r in ordered}:
        raise ValueError('Require explicit requirements for every declared zone')
    for values in reserve.requirements_mw.values():
        if len(values)!=t or any(not math.isfinite(v) or v<0 for v in values):
            raise ValueError('Invalid reserve requirements')
    for u,r in zip(case.units,ordered):
        if not r.zone or len(r.eligible_mw)!=t or len(r.price_dollars_per_mw_hour)!=t:
            raise ValueError('Incomplete reserve capabilities/prices')
        if not math.isfinite(r.response_hours) or r.response_hours<=0:
            raise ValueError('Require positive response time')
        if any(not math.isfinite(v) or v<0 for v in [*r.eligible_mw,*r.price_dollars_per_mw_hour]):
            raise ValueError('Invalid reserve MW or price')
        if any(e>cap for e,cap in zip(r.eligible_mw,u.maximum_mw)):
            raise ValueError('Eligible reserve exceeds declared physical capability')
    return ordered


def extend_reserve_model(case,model,reserve):
    ordered=validate_reserve(case,reserve);t=len(case.curves);nu=len(case.units)
    original=len(model['cost']);n=original+t*nu
    indices=np.arange(original,n).reshape(t,nu)
    a=sparse.hstack([model['a'],sparse.csc_matrix((len(model['b']),t*nu))],format='csc')
    rows=[];rhs=[];meta=[]
    for h in range(t):
        for i,(u,r) in enumerate(zip(case.units,ordered)):
            ridx=indices[h,i];oidx=model['on_idx'][h,i]
            row=np.zeros(n);row[:model['ns']]=model['base']['unit_matrices'][h][i]
            row[ridx]=1.;row[oidx]-=u.maximum_mw[h]
            rows.append(row);rhs.append(-model['base']['unit_bases'][h][i]);meta.append(('energy_reserve_capacity',h,i))
            for cap,label in [(r.eligible_mw[h],'reserve_eligibility'),
                              (u.ramp_up_mw_per_hour*r.response_hours,'reserve_response')]:
                row=np.zeros(n);row[ridx]=1.;row[oidx]-=cap
                rows.append(row);rhs.append(0.);meta.append((label,h,i))
        for zone,requirements in reserve.requirements_mw.items():
            row=np.zeros(n)
            for i,r in enumerate(ordered):
                if r.zone==zone:
                    row[indices[h,i]]=-1.
            rows.append(row);rhs.append(-requirements[h]);meta.append(('reserve_requirement',h,zone))
    result=dict(model,a=sparse.vstack([a,sparse.csc_matrix(np.asarray(rows))],format='csc'),
        b=np.r_[model['b'],rhs],meta=model['meta']+meta,
        cost=np.r_[model['cost'],[r.price_dollars_per_mw_hour[h]*case.interval_hours[h] for h in range(t) for r in ordered]],
        lower=np.r_[model['lower'],np.zeros(t*nu)],
        upper=np.r_[model['upper'],[r.eligible_mw[h] for h in range(t) for r in ordered]],
        integrality=np.r_[model['integrality'],np.zeros(t*nu)].astype(int),reserve_idx=indices,
        continuous_indices=np.r_[model['continuous_indices'],indices.ravel()],reserve=reserve)
    return result


def verify_reserve(case,reserve,result):
    ordered=validate_reserve(case,reserve);award=np.asarray(result['reserve_mw']);on=np.asarray(result['on'])
    generation=np.asarray(result['unit_generation_mw'])
    if award.shape!=on.shape or not np.all(np.isfinite(award)):
        return dict(passed=False,reserve_error_mw=float('inf'),reserve_cost_dollars=0.)
    error=0.;cost=0.
    for h in range(len(case.curves)):
        for i,(u,r) in enumerate(zip(case.units,ordered)):
            value=award[h,i]
            error=max(error,-value,value-r.eligible_mw[h]*on[h,i],
                value-u.ramp_up_mw_per_hour*r.response_hours*on[h,i],
                value+generation[h,i]-u.maximum_mw[h]*on[h,i],value if not u.available[h] else 0.)
            cost+=value*r.price_dollars_per_mw_hour[h]*case.interval_hours[h]
        for zone,requirements in reserve.requirements_mw.items():
            error=max(error,requirements[h]-sum(award[h,i] for i,r in enumerate(ordered) if r.zone==zone))
    return dict(passed=bool(error<=1e-5),reserve_error_mw=float(error),reserve_cost_dollars=float(cost))


def load_reserve_case(path,case):
    import json
    from pathlib import Path
    raw=json.loads(Path(path).read_text())
    try:
        units=tuple(ReserveUnit(u['unit_id'],u['reserve']['zone'],tuple(u['reserve']['eligible_mw']),
            tuple(u['reserve']['price_dollars_per_mw_hour']),u['reserve']['response_hours']) for u in raw['units'])
        reserve=ReserveCase(units,{k:tuple(v) for k,v in raw['reserve_requirements_mw'].items()})
    except (KeyError,TypeError) as error:
        raise ValueError('Require explicitly supplied reserve MW, response capability, prices and zonal requirements') from error
    validate_reserve(case,reserve)
    return reserve
