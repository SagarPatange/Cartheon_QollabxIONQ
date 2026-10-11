"""Serialized independent-hour SPP auctions with immutable input provenance."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import hashlib
from pathlib import Path
import threading
import time
from uuid import uuid4

from application.jobs import BusyRunError
from optimizer.energy_auction import PROJECT, solve, verify


def solve_hour(curves,fixed_demand_mw):
    result = solve(curves,fixed_demand_mw=fixed_demand_mw)
    certificate = verify(curves,result)
    if not certificate['passed']:
        raise RuntimeError('Original-curve verification failed')
    return dict(status='complete',solver=result['solver'],
                objective_dollars=float(result['objective_dollars']),
                model_price_dollars_per_mwh=float(result['clearing_price_dollars_per_mwh']),
                fixed_demand_mw=fixed_demand_mw,
                net_injection_mw=sum(c.side*q for c,q in zip(curves,result['quantities'])),
                verification=certificate,
                numerical_optimizer_verified=result['numerical_optimizer_verified'],
                elapsed_seconds=result['elapsed_seconds'],
                awards=[dict(row_id=c.row_id,quantity_mw=float(q),net_injection_mw=float(c.side*q),
                             objective_contribution_dollars=float(c.side*c.integral(q)))
                        for c,q in zip(curves,result['quantities'])])


class MarketRunManager:
    def __init__(self,store,output_root=None,*,solver=solve_hour):
        self.store = store
        self.output_root = Path(output_root or PROJECT/'results/market-runs')
        self.solver = solver
        self._executor = ThreadPoolExecutor(max_workers=1,thread_name_prefix='market-solver')
        self._lock = threading.Lock()
        self._runs = {}
        self._active = None
        self._comparison_cache = {}
        self._closed = False

    def submit(self,dataset_id,hour_indices):
        if not isinstance(dataset_id,str):
            raise ValueError('Require a dataset ID')
        metadata = self.store.describe(dataset_id)
        if (not isinstance(hour_indices,list) or not hour_indices or
            any(type(i) is not int or not 0 <= i < len(metadata['hours']) for i in hour_indices) or
            len(set(hour_indices)) != len(hour_indices)):
            raise ValueError('Require unique valid hour indices')
        run_id = uuid4().hex
        with self._lock:
            if self._closed:
                raise RuntimeError('Market runner is closed')
            if self._active is not None:
                raise BusyRunError('A market solve is already active')
            record = dict(run_id=run_id,dataset_id=dataset_id,status='queued',
                          hour_indices=list(hour_indices),completed=0,total=len(hour_indices),hours=[])
            self._runs[run_id] = record
            self._active = run_id
            self._executor.submit(self._run,run_id,metadata,list(hour_indices))
            return deepcopy(record)

    def _run(self,run_id,metadata,indices):
        started = time.perf_counter()
        folder = self.output_root/run_id
        try:
            folder.mkdir(parents=True,exist_ok=False)
            (folder/'dataset.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
            with self._lock:
                self._runs[run_id]['status'] = 'running'
            for index in indices:
                inputs = self.store.hour(metadata['dataset_id'],index)
                (folder/f'hour-{index:02}-inputs.json').write_text(json.dumps(inputs,allow_nan=False)+'\n',encoding='utf-8')
                identity = {k:inputs[k] for k in ('dataset_id','index','utc_end','cpt_end','fixed_demand_mw','historical_smp')}
                try:
                    result = self.solver(self.store.curves(metadata['dataset_id'],index),inputs['fixed_demand_mw'])
                    if result.get('status') != 'complete' or not result.get('verification',{}).get('passed'):
                        raise RuntimeError('Solver did not return a certified result')
                    result = dict(result,**identity)
                except ValueError as error:
                    status = 'infeasible' if 'exceeds available net supply' in str(error) else 'error'
                    result = dict(identity,status=status,error=str(error)[:240])
                except Exception as error:
                    result = dict(identity,status='error',error=f'{type(error).__name__}: {str(error)[:200]}')
                (folder/f'hour-{index:02}-result.json').write_text(json.dumps(result,allow_nan=False)+'\n',encoding='utf-8')
                with self._lock:
                    self._runs[run_id]['hours'].append(result)
                    self._runs[run_id]['completed'] += 1
            with self._lock:
                record = self._runs[run_id]
                successes = sum(h['status']=='complete' for h in record['hours'])
                snapshot = deepcopy(record)
                snapshot['status'] = 'complete' if successes==len(indices) else 'partial' if successes else 'failed'
                snapshot['elapsed_seconds'] = time.perf_counter()-started
            (folder/'report.json').write_text(json.dumps(snapshot,allow_nan=False)+'\n',encoding='utf-8')
            with self._lock:
                self._runs[run_id].update(status=snapshot['status'],elapsed_seconds=snapshot['elapsed_seconds'])
        except Exception as error:
            with self._lock:
                self._runs[run_id].update(status='error',error=f'{type(error).__name__}: {str(error)[:200]}')
        finally:
            with self._lock:
                self._active = None

    def submit_comparison(self,baseline_run_id,hour_index):
        if type(hour_index) is not int:
            raise ValueError('Require integer hour_index')
        baseline_run=self.get(baseline_run_id)
        if baseline_run.get('kind')=='comparison':
            raise ValueError('Require a classical baseline run')
        baseline=next((h for h in baseline_run['hours'] if h['index']==hour_index),None)
        if baseline is None or baseline.get('status')!='complete' or not baseline['verification']['passed']:
            raise ValueError('Require a certified classical hour')
        metadata=self.store.describe(baseline_run['dataset_id'])
        payload=dict(encoding='spp-dispatch-v2',baseline_run_id=baseline_run_id,hashes=metadata['sha256'],utc_end=baseline['utc_end'],awards=baseline['awards'],demand=baseline['fixed_demand_mw'],price=baseline['model_price_dollars_per_mwh'],settings=dict(shots=256,repeats=5,seed=2026,depth=1,restarts=1,maxiter=40))
        key=hashlib.sha256(json.dumps(payload,sort_keys=True,allow_nan=False).encode()).hexdigest()
        with self._lock:
            if self._closed:raise RuntimeError('Market runner is closed')
            cached=self._comparison_cache.get(key)
            if cached and self._runs[cached]['status'] in ('complete','unavailable'):
                return deepcopy(self._runs[cached])
            if self._active is not None:raise BusyRunError('A market solve is already active')
            run_id=uuid4().hex
            record=dict(kind='comparison',run_id=run_id,dataset_id=baseline_run['dataset_id'],baseline_run_id=baseline_run_id,hour_index=hour_index,utc_end=baseline['utc_end'],status='queued',cache_key=key)
            self._runs[run_id]=record;self._comparison_cache[key]=run_id;self._active=run_id
            self._executor.submit(self._run_comparison,run_id,baseline,metadata,payload)
            return deepcopy(record)

    def _run_comparison(self,run_id,baseline,metadata,payload):
        try:
            from quantum.spp_dispatch import build_spp_oracle
            from quantum.spp_comparison import compare_spp_oracle
            with self._lock:
                self._runs[run_id]['status']='running'
                record=deepcopy(self._runs[run_id])
            folder=self.output_root/run_id;folder.mkdir(parents=True,exist_ok=False)
            curves=self.store.curves(record['dataset_id'],record['hour_index'])
            oracle=build_spp_oracle(curves,baseline)
            (folder/'oracle.json').write_text(json.dumps(oracle,allow_nan=False),encoding='utf-8')
            (folder/'provenance.json').write_text(json.dumps(dict(dataset=metadata,inputs=payload),allow_nan=False),encoding='utf-8')
            result=compare_spp_oracle(oracle)
            result['full_auction_reference']=dict(objective_dollars=baseline['objective_dollars'],model_price_dollars_per_mwh=baseline['model_price_dollars_per_mwh'])
            record.update(status=result['status'],result=result)
            (folder/'report.json').write_text(json.dumps(record,allow_nan=False),encoding='utf-8')
            with self._lock:self._runs[run_id]=record
        except Exception as error:
            with self._lock:self._runs[run_id].update(status='error',error=f'{type(error).__name__}: {error}'[:240])
        finally:
            with self._lock:self._active=None

    def get(self,run_id):
        with self._lock:
            return deepcopy(self._runs[run_id])

    def close(self):
        with self._lock:
            self._closed = True
        self._executor.shutdown(wait=True)
