import unittest
from optimizer.energy_auction import Curve
from application.market_jobs import solve_hour
from quantum.spp_dispatch import build_spp_oracle,conditional_price
class SppDispatchTests(unittest.TestCase):
 def test_signed_candidates_and_baseline(self):
  curves=[Curve('a','1_a',1,((10,10),),False),Curve('b','1_b',1,((20,20),),False),Curve('c','0_c',-1,((3,100),),False)]
  baseline=solve_hour(curves,12)
  oracle=build_spp_oracle(curves,baseline)
  self.assertEqual(oracle['status'],'ready')
  self.assertAlmostEqual(oracle['entries'][0]['objective_dollars'],baseline['objective_dollars'])
  for e in oracle['entries']:
   if e['feasible']:
    self.assertAlmostEqual(sum(c.side*q for c,q in zip(curves,e['quantities'])),12)
    self.assertAlmostEqual(sum(c.side*c.integral(q) for c,q in zip(curves,e['quantities'])),e['objective_dollars'])
 def test_unavailable(self):
  curves=[Curve('a','1_a',1,((10,10),),False)]
  self.assertEqual(build_spp_oracle(curves,solve_hour(curves,10))['status'],'unavailable')
 def test_negative_residual_and_price_range(self):
  curves=[Curve('sink','1_sink',1,((-10,0),(0,100)),True),Curve('cheap','1_cheap',1,((20,10),),False),Curve('high','1_high',1,((20,40),),False)]
  baseline=solve_hour(curves,11)
  oracle=build_spp_oracle(curves,baseline)
  self.assertEqual(oracle['status'],'ready')
  self.assertEqual(oracle['balancing_row_id'],'sink')
  self.assertTrue(any(e['quantities'][0]<0 for e in oracle['entries'] if e['feasible']))
  kink=Curve('k','1_k',1,((5,10),(10,20)),False)
  self.assertEqual(conditional_price(kink,5)['range'],[10,20])
  self.assertIsNone(conditional_price(kink,5)['value'])
  self.assertIsNone(conditional_price(kink,0)['value'])
if __name__=='__main__':unittest.main()
