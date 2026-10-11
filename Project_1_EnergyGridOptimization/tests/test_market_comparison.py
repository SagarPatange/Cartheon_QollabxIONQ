import unittest,time,tempfile
from pathlib import Path
from application.market_data import DatasetStore
from application.market_jobs import MarketRunManager
from tests.test_market_data import files,PROJECT
class MarketComparisonTests(unittest.TestCase):
 def test_requires_certified_baseline_and_reuses_completed_run(self):
  with tempfile.TemporaryDirectory(dir=PROJECT/'results/spp-interface-development') as tmp:
   store=DatasetStore(Path(tmp)/'uploads',load_default=False);d=store.register(*files())
   m=MarketRunManager(store,Path(tmp)/'runs');self.addCleanup(m.close)
   baseline=m.submit(d['dataset_id'],[0])
   for _ in range(100):
    b=m.get(baseline['run_id'])
    if b['status']=='complete':break
    time.sleep(.02)
   with self.assertRaises(ValueError):m.submit_comparison(baseline['run_id'],True)
   comparison=m.submit_comparison(baseline['run_id'],0)
   for _ in range(200):
    c=m.get(comparison['run_id'])
    if c['status'] not in ('queued','running'):break
    time.sleep(.02)
   self.assertIn(c['status'],('complete','unavailable'))
   self.assertEqual(c['baseline_run_id'],baseline['run_id'])
   self.assertEqual(m.submit_comparison(baseline['run_id'],0)['run_id'],c['run_id'])
if __name__=='__main__':unittest.main()
