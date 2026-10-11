import unittest
from quantum.spp_comparison import summarize_method,compare_spp_oracle
class ComparisonTests(unittest.TestCase):
 def test_missing_feasible_and_inferior_result(self):
  oracle={'entries':[{'conditional_price':{'value':20}}]}
  run={'counts':{},'score':{'best_index':None,'best_objective_dollars':None,'best_gap_dollars':None,'optimal_hit_rate':0,'observed_feasible_rate':0},'execution_seconds':1}
  result=summarize_method(oracle,[run])
  self.assertIsNone(result['best_objective_dollars']);self.assertEqual(result['success_trials'],0)
 def test_equal_candidate_budgets_and_exact_reference(self):
  from optimizer.energy_auction import Curve
  from application.market_jobs import solve_hour
  from quantum.spp_dispatch import build_spp_oracle
  curves=[Curve('a','1_a',1,((10,10),),False),Curve('b','1_b',1,((20,20),),False),Curve('c','0_c',-1,((3,100),),False)]
  oracle=build_spp_oracle(curves,solve_hour(curves,12))
  result=compare_spp_oracle(oracle,shots=8,repeats=2,maxiter=6)
  self.assertEqual(result['exact']['objective_dollars'],min(e['objective_dollars'] for e in oracle['entries'] if e['feasible']))
  for m in result['methods'].values():
   self.assertEqual(len(m['runs']),2)
   for r in m['runs']:self.assertEqual(sum(r['counts'].values()),8)
if __name__=='__main__':unittest.main()
