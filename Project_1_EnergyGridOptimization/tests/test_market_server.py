import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from application.jobs import RunManager
from application.market_data import DatasetStore
from application.market_jobs import MarketRunManager
from application.server import make_server
from tests.test_market_data import files, PROJECT

class MarketServerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=PROJECT/'results/spp-interface-development')
        self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name)
        assets=root/'assets';assets.mkdir()
        (assets/'market.html').write_text('<title>Actual SPP data</title>')
        (assets/'index.html').write_text('<title>Test network</title>')
        store=DatasetStore(root/'uploads',load_default=False)
        d=store.register(*files());store.default_id=d['dataset_id']
        self.market=MarketRunManager(store,root/'market-runs');self.addCleanup(self.market.close)
        self.old=RunManager(output_root=root/'old-runs');self.addCleanup(self.old.close)
        self.server=make_server(0,self.old,static_dir=assets,market=self.market)
        self.addCleanup(self.server.server_close)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.stop)
        self.port=self.server.server_port

    def stop(self):self.server.shutdown();self.thread.join(3)
    def request(self,method,path,body=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        c.request(method,path,body,headers or {});r=c.getresponse();data=r.read();code=r.status;c.close()
        try:data=json.loads(data)
        except ValueError:pass
        return code,data
    def post(self,path,payload,**headers):
        return self.request('POST',path,json.dumps(payload),{'Content-Type':'application/json',**headers})

    def test_default_routes_upload_and_run_identity(self):
        self.assertIn(b'Actual SPP',self.request('GET','/')[1])
        self.assertIn(b'Test network',self.request('GET','/test-system')[1])
        self.assertEqual(self.request('GET','/api/config')[0],200)
        e,c=files('07/02/2026')
        code,d=self.post('/api/market/datasets',{'energy':e,'clearing':c})
        self.assertEqual(code,201)
        self.assertEqual(d['operating_day'],'2026-07-02')
        code,h=self.request('GET',f"/api/market/datasets/{d['dataset_id']}/hours/0")
        self.assertEqual(code,200);self.assertEqual(len(h['submissions']),3)
        code,r=self.post('/api/market/runs',{'dataset_id':d['dataset_id'],'hour_indices':[0]})
        self.assertEqual(code,202);self.assertEqual(r['dataset_id'],d['dataset_id'])

    def test_input_and_origin_errors(self):
        e,c=files();p={'energy':e,'clearing':c}
        self.assertEqual(self.post('/api/market/datasets',p,Origin='https://evil.example')[0],403)
        self.assertEqual(self.post('/api/market/datasets',p,Host='evil.example')[0],403)
        self.assertEqual(self.request('POST','/api/market/datasets','{}',{'Content-Type':'text/plain'})[0],400)
        self.assertEqual(self.request('POST','/api/market/datasets','{}',{'Content-Type':'application/json','Content-Length':str(33*1024*1024)})[0],400)
        self.assertEqual(self.post('/api/market/datasets',{'energy':e})[0],400)
        self.assertEqual(self.post('/api/market/runs',{'dataset_id':'unknown','hour_indices':[0]})[0],404)
        self.assertEqual(self.request('GET','/api/market/datasets/unknown/hours/0')[0],404)

    def test_comparison_route_validation_and_identity(self):
        import time
        payload={'baseline_run_id':'unknown','hour_index':0}
        self.assertEqual(self.post('/api/market/comparisons',payload)[0],404)
        self.assertEqual(self.post('/api/market/comparisons',dict(payload,hour_index=True))[0],400)
        self.assertEqual(self.post('/api/market/comparisons',dict(payload,extra=1))[0],400)
        self.assertEqual(self.post('/api/market/comparisons',payload,Origin='https://evil.example')[0],403)
        baseline=self.market.submit(self.market.store.default_id,[0])
        for _ in range(100):
            if self.market.get(baseline['run_id'])['status']=='complete':break
            time.sleep(.02)
        code,accepted=self.post('/api/market/comparisons',{'baseline_run_id':baseline['run_id'],'hour_index':0})
        self.assertEqual(code,202)
        self.assertEqual(accepted['kind'],'comparison')
        self.assertEqual(accepted['baseline_run_id'],baseline['run_id'])
        self.assertEqual(self.request('GET','/api/market/runs/'+accepted['run_id'])[0],200)
