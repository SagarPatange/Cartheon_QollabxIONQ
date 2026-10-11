import unittest,tempfile,zipfile,json
from pathlib import Path
from quantum.qollab_spp_export import export_spp_package
from optimizer.energy_auction import PROJECT
class SppExportTests(unittest.TestCase):
 @unittest.skipUnless((PROJECT/'results/spp-qaoa-development/spp-trial.json').exists(),'Requires retained actual-SPP trial artifacts')
 def test_flat_actual_spp_package_without_raw_offers(self):
  with tempfile.TemporaryDirectory(dir=PROJECT/'results') as tmp:
   result=export_spp_package(Path(tmp)/'upload',Path('results/spp-qaoa-development/spp-trial.json'))
   with zipfile.ZipFile(result['archive']) as z:
    self.assertIn('index.html',z.namelist());self.assertIn('main.js',z.namelist());self.assertIn('main.py',z.namelist())
    self.assertFalse(any(n.endswith('.csv') for n in z.namelist()))
    oracle=json.loads(z.read('data/spp_oracle.json'))
    self.assertEqual(oracle['n_bits'],4)
    self.assertEqual(len(oracle['entries']),16)
    self.assertNotIn('quantities',oracle['entries'][0])
    self.assertEqual(oracle['source']['utc_end'],'07/01/2026 06:00:00')
if __name__=='__main__':unittest.main()
