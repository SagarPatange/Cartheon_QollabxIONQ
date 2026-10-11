"""Run lifecycle and real-solver integration tests."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from application.scenarios import default_controls
from application.jobs import BusyRunError, RunManager

PROJECT = Path(__file__).resolve().parents[1]
BASE = json.loads((PROJECT / 'data/operating_case.json').read_text(encoding='utf-8'))


def await_status(manager, run_id, expected, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = manager.get(run_id)
        if result['status'] in expected:
            return result
        time.sleep(.025)
    raise AssertionError(f'run did not reach {expected}: {manager.get(run_id)}')


class RunManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=PROJECT / 'results')
        self.addCleanup(self.temp.cleanup)
        self.started = threading.Event()
        self.release = threading.Event()

        def worker(scenario, output_dir):
            self.started.set()
            self.release.wait(5)
            return {'status': 'complete', 'scenario': scenario, 'objective': 42}

        self.manager = RunManager(base=BASE, solver=worker, output_root=Path(self.temp.name))
        self.addCleanup(self.manager.close)
        self.addCleanup(self.release.set)

    def test_one_active_job_and_revision_tagged_atomic_result(self):
        controls = default_controls(BASE)
        first = self.manager.submit(controls, 7)
        self.assertEqual(first['status'], 'queued')
        self.assertTrue(self.started.wait(5))
        with self.assertRaises(BusyRunError):
            self.manager.submit(controls, 8)
        self.assertNotIn('data', self.manager.get(first['run_id']))
        self.release.set()
        done = await_status(self.manager, first['run_id'], {'complete'})
        self.assertEqual(done['revision'], 7)
        self.assertEqual(done['data']['objective'], 42)
        done['data']['objective'] = -1
        self.assertEqual(self.manager.get(first['run_id'])['data']['objective'], 42)
        second = self.manager.submit(controls, 8)
        self.assertNotEqual(first['run_id'], second['run_id'])
        self.assertEqual(await_status(self.manager, second['run_id'], {'complete'})['revision'], 8)

    def test_validation_and_unknown_id(self):
        controls = default_controls(BASE)
        for revision in (True, -1, 2**53, 1.1, '1'):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                self.manager.submit(controls, revision)
        controls['load_percent'] = float('nan')
        with self.assertRaises(ValueError):
            self.manager.submit(controls, 1)
        with self.assertRaises(KeyError):
            self.manager.get('missing')

    def test_infeasible_and_error_are_retained_without_data(self):
        from application.solver import InfeasibleScenario, SolverError
        for error, status in ((InfeasibleScenario('no dispatch'), 'infeasible'),
                              (SolverError('certificate failed'), 'error')):
            with self.subTest(status=status):
                def fail(scenario, output_dir):
                    raise error
                manager = RunManager(base=BASE, solver=fail, output_root=Path(self.temp.name))
                try:
                    submitted = manager.submit(default_controls(BASE), 1)
                    result = await_status(manager, submitted['run_id'], {status})
                    self.assertNotIn('data', result)
                    self.assertTrue(result['error'])
                    self.assertEqual(manager.get(submitted['run_id']), result)
                finally:
                    manager.close()


class RealSolverTest(unittest.TestCase):
    def test_default_case_through_manager(self):
        root = PROJECT / 'results/application-jobs-integration'
        root.mkdir(parents=True, exist_ok=True)
        manager = RunManager(base=BASE, output_root=root)
        try:
            submitted = manager.submit(default_controls(BASE), 3)
            result = await_status(manager, submitted['run_id'], {'complete', 'error', 'infeasible'}, 120)
            self.assertEqual(result['status'], 'complete', result.get('error'))
            self.assertTrue(result['data']['certificates']['commitment']['passed'])
            self.assertTrue(result['data']['certificates']['conditional_pricing']['passed'])
            self.assertAlmostEqual(result['data']['commitment']['objective_dollars'], 82039.2757548886, places=4)
        finally:
            manager.close()
