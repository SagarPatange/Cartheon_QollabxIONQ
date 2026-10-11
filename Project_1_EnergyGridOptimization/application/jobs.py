"""Serialized, revision-tagged scenario runs for the local application."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import threading
from uuid import uuid4

from application.scenarios import PROJECT, build_scenario
from application.solver import SolverError, solve_scenario


class BusyRunError(RuntimeError):
    """A run is queued or running already."""


class RunManager:
    def __init__(self, *, base=None, solver=solve_scenario, output_root=None):
        if base is None:
            base = json.loads((PROJECT / 'data/operating_case.json').read_text(encoding='utf-8'))
        self.base = deepcopy(base)
        self.solver = solver
        self.output_root = Path(output_root or PROJECT / 'results/application-runs')
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='application-solver')
        self._lock = threading.Lock()
        self._runs = {}
        self._active = None
        self._closed = False

    def submit(self, controls: dict, revision: int) -> dict:
        if type(revision) is not int or not 0 <= revision <= 2**53 - 1:
            raise ValueError('revision: require an integer from 0 through 2^53-1')
        # Validation and the exact snapshot complete before a run is accepted.
        try:
            scenario = build_scenario(self.base, deepcopy(controls))
        except (TypeError, KeyError, OverflowError) as error:
            raise ValueError(f'Invalid controls: {error}') from error
        run_id = uuid4().hex
        with self._lock:
            if self._closed:
                raise RuntimeError('Run manager is closed')
            if self._active is not None:
                raise BusyRunError('A solve is already active')
            record = {'run_id': run_id, 'revision': revision, 'status': 'queued'}
            self._runs[run_id] = record
            self._active = run_id
            self._executor.submit(self._run, run_id, scenario)
            return deepcopy(record)

    def _run(self, run_id, scenario):
        with self._lock:
            self._runs[run_id]['status'] = 'running'
        try:
            report = self.solver(scenario, self.output_root / run_id)
            if not isinstance(report, dict) or report.get('status') != 'complete':
                raise SolverError('Solver did not return a completed report')
            # Ensure a single immutable JSON-compatible report is published.
            report = json.loads(json.dumps(report, allow_nan=False))
            outcome = {'status': 'complete', 'data': report}
        except SolverError as error:
            outcome = {'status': error.status, 'error': str(error)[:240]}
        except Exception:
            outcome = {'status': 'error', 'error': 'Run failed; inspect its local artifacts'}
        with self._lock:
            self._runs[run_id].update(outcome)
            self._active = None

    def get(self, run_id: str) -> dict:
        with self._lock:
            if run_id not in self._runs:
                raise KeyError(run_id)
            return deepcopy(self._runs[run_id])

    def close(self) -> None:
        with self._lock:
            self._closed = True
        self._executor.shutdown(wait=True)
