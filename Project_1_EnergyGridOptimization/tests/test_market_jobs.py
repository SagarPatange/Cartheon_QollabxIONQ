import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from application.market_data import DatasetStore
from application.market_jobs import MarketRunManager, solve_hour
from application.jobs import BusyRunError
from tests.test_market_data import files, PROJECT

class MarketJobTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=PROJECT/'results/spp-interface-development')
        self.addCleanup(self.temp.cleanup)
        self.store=DatasetStore(Path(self.temp.name)/'uploads',load_default=False)
        self.dataset=self.store.register(*files())

    def manager(self,**kwargs):
        m=MarketRunManager(self.store,output_root=Path(self.temp.name)/'runs',**kwargs)
        self.addCleanup(m.close); return m

    def await_run(self,m,run):
        for _ in range(100):
            r=m.get(run['run_id'])
            if r['status'] not in ('queued','running'): return r
            time.sleep(.02)
        self.fail('Run did not complete')

    def test_certified_hour_and_artifacts(self):
        m=self.manager(); d=self.dataset
        r=self.await_run(m,m.submit(d['dataset_id'],[0]))
        self.assertEqual(r['status'],'complete')
        self.assertEqual(r['dataset_id'],d['dataset_id'])
        h=r['hours'][0]
        self.assertTrue(h['verification']['passed'])
        self.assertAlmostEqual(h['net_injection_mw'],5)
        self.assertAlmostEqual(h['objective_dollars'],60)
        self.assertEqual(len(h['awards']),3)
        p=Path(self.temp.name)/'runs'/r['run_id']
        self.assertEqual(json.loads((p/'report.json').read_text())['status'],'complete')
        self.assertTrue((p/'hour-00-inputs.json').is_file())

    def test_busy_and_validation(self):
        release=threading.Event()
        def slow(curves,fixed): release.wait(3); return solve_hour(curves,fixed)
        m=self.manager(solver=slow);self.addCleanup(release.set)
        with self.assertRaises(KeyError):m.submit('unknown',[0])
        for indices in ([],[-1],[2],[0,0],[True]):
            with self.assertRaises(ValueError):m.submit(self.dataset['dataset_id'],indices)
        r=m.submit(self.dataset['dataset_id'],[0])
        with self.assertRaises(BusyRunError):m.submit(self.dataset['dataset_id'],[1])
        release.set(); self.assertEqual(self.await_run(m,r)['status'],'complete')

    def test_partial_day_failure_does_not_hide_success(self):
        e,c=files('07/02/2026');c['text']=c['text'].replace('07/02/2026 07:00:00,SPP,5','07/02/2026 07:00:00,SPP,50')
        d=self.store.register(e,c);m=self.manager()
        r=self.await_run(m,m.submit(d['dataset_id'],[0,1]))
        self.assertEqual(r['status'],'partial')
        self.assertEqual(r['completed'],2)
        self.assertEqual([h['status'] for h in r['hours']],['complete','infeasible'])
        self.assertEqual(r['dataset_id'],d['dataset_id'])
