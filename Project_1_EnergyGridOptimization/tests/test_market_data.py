import csv
import io
from pathlib import Path
import tempfile
import unittest

from application.market_data import DatasetStore

PROJECT = Path(__file__).resolve().parents[1]

def files(day='07/01/2026', repeated=False):
    headers=['CPTHourEnd','GMTHourEnd','RCode','Use_Bid_Slope']+[v for i in range(1,11) for v in (f'MW{i}',f'Price{i}')]
    energy=io.StringIO(); w=csv.writer(energy); w.writerow(headers)
    clearing=io.StringIO(); c=csv.writer(clearing); c.writerow(['Interval','GMTIntervalEnd','BAA','Cleared Fixed Demand Bid','SMP'])
    for h in (1,2):
        local=f'{day} {1 if repeated else h:02}:00:00'; utc=f'{day} {h+5:02}:00:00'
        w.writerow([local,utc,'1_test','0',10,20]+['']*18)
        w.writerow([local,utc,'1_test','0',-2,-5,0,0]+['']*16)
        w.writerow([local,utc,'0_bid','1',2,40]+['']*18)
        c.writerow([local,utc,'SPP',5,22])
    return {'name':'offers.csv','text':energy.getvalue()},{'name':'clearing.csv','text':clearing.getvalue()}

class MarketDataTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=PROJECT/'results/spp-interface-development')
        self.addCleanup(self.temp.cleanup)
        self.store=DatasetStore(upload_root=Path(self.temp.name),load_default=False)

    def test_valid_and_distinct_signed_rows(self):
        e,c=files(); d=self.store.register(e,c)
        self.assertEqual(d['operating_day'],'2026-07-01')
        self.assertEqual(len(d['hours']),2)
        self.assertFalse(d['complete_day'])
        curves=self.store.curves(d['dataset_id'],0)
        self.assertEqual(len({x.row_id for x in curves}),3)
        self.assertEqual(curves[1].lower,-2)
        self.assertEqual(curves[2].side,-1)
        self.assertEqual(self.store.hour(d['dataset_id'],0)['submissions'][2]['slope'],True)

    def test_repeated_local_hour_uses_utc(self):
        e,c=files(repeated=True); d=self.store.register(e,c)
        self.assertEqual(len(d['hours']),2)
        self.assertNotEqual(self.store.curves(d['dataset_id'],0)[0].row_id,self.store.curves(d['dataset_id'],1)[0].row_id)

    def test_bad_inputs_not_persisted(self):
        for kind in ('mismatch','duplicate','nan','curve','fields','headers','day'):
            with self.subTest(kind=kind):
                e,c=files()
                if kind=='mismatch': c['text']=c['text'].replace('07/01/2026 07:00:00','07/01/2026 08:00:00')
                if kind=='duplicate': c['text']+=c['text'].splitlines()[1]+'\n'
                if kind=='nan': c['text']=c['text'].replace(',5,22',',NaN,22')
                if kind=='curve': e['text']=e['text'].replace(',10,20,',',10,NaN,')
                if kind=='fields': e['text']=e['text'].replace('1_test,0,10,20','1_test,0,10,20,EXTRA')
                if kind=='headers': c['text']=c['text'].replace('SMP','BAA')
                if kind=='day': c['text']=c['text'].replace('07/01/2026','07/02/2026')
                with self.assertRaises(ValueError): self.store.register(e,c)
                self.assertEqual(list(Path(self.temp.name).iterdir()),[])

    def test_filename_never_becomes_path_and_limits(self):
        e,c=files(); e['name']='../../outside.csv'; d=self.store.register(e,c)
        folder=Path(self.temp.name)/d['dataset_id']
        self.assertEqual({p.name for p in folder.iterdir()},{'energy.csv','clearing.csv','metadata.json'})
        with self.assertRaises(ValueError): self.store.hour(d['dataset_id'],-1)
        with self.assertRaises(KeyError): self.store.describe('unknown')
        e['text']='x'*(24*1024*1024+1)
        with self.assertRaises(ValueError): self.store.register(e,c)
