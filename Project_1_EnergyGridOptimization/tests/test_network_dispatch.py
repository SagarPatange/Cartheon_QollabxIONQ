import unittest
import numpy as np
from optimizer.energy_auction import Curve, clearing_oracle
from optimizer.network_dispatch import Branch, Network, solve_network, verify_network


class NetworkDispatchTests(unittest.TestCase):
    def network(self, limit=5.):
        return Network(('a','b'), (Branch('ab','a','b',.1,limit),), 'a', 100.)

    def offers(self):
        return [Curve('cheap','1_c',1,((20.,20.),),False),
                Curve('local','1_l',1,((20.,50.),),False)]

    def test_congestion_selects_deliverable_supply_and_separates_prices(self):
        r=solve_network(self.offers(),['a','b'],self.network(),[0.,15.])
        np.testing.assert_allclose(r['quantities'],[5.,10.],atol=1e-6)
        self.assertAlmostEqual(r['objective_dollars'],600.,places=5)
        np.testing.assert_allclose(r['nodal_prices'],[20.,50.],atol=1e-6)
        np.testing.assert_allclose(r['mcc'],[0.,30.],atol=1e-6)
        self.assertTrue(r['verification']['passed'])

    def test_unconstrained_network_matches_single_node(self):
        cs=self.offers(); r=solve_network(cs,['a','b'],self.network(100.),[0.,15.])
        reference=clearing_oracle(cs,fixed_demand_mw=15.)
        self.assertAlmostEqual(r['objective_dollars'],reference['objective_dollars'],places=5)
        np.testing.assert_allclose(r['nodal_prices'],[20.,20.],atol=1e-6)

    def test_linear_loss_sensitivity_produces_loss_and_loss_price(self):
        r=solve_network(self.offers(),['a','b'],self.network(100.),[0.,10.],
                        loss_sensitivity=[0.,-.1])
        np.testing.assert_allclose(r['quantities'],[11.,0.],atol=1e-6)
        self.assertAlmostEqual(r['losses_mw'],1.,places=6)
        np.testing.assert_allclose(r['nodal_prices'],[20.,22.],atol=1e-6)
        np.testing.assert_allclose(r['mlc'],[0.,2.],atol=1e-6)

    def test_sloped_offer_integral_and_price(self):
        cs=[Curve('s','1_s',1,((0.,10.),(10.,30.)),True)]
        r=solve_network(cs,['a'],self.network(100.),[0.,7.5])
        self.assertAlmostEqual(r['objective_dollars'],131.25,places=4)
        np.testing.assert_allclose(r['nodal_prices'],[25.,25.],atol=1e-4)

    def test_signed_consumption(self):
        cs=[Curve('s','1_s',1,((10.,-30.),),False),
            Curve('sink','1_sink',1,((-5.,-10.),(0.,-10.)),False)]
        r=solve_network(cs,['a','b'],self.network(100.),[0.,0.])
        np.testing.assert_allclose(r['quantities'],[5.,-5.],atol=1e-6)
        self.assertAlmostEqual(r['objective_dollars'],-100.,places=5)

    def test_explicit_availability_and_limits(self):
        r=solve_network(self.offers(),['a','b'],self.network(100.),[0.,15.],
                        dispatch_bounds={'cheap':(0.,0.)})
        np.testing.assert_allclose(r['quantities'],[0.,15.],atol=1e-6)
        self.assertAlmostEqual(r['objective_dollars'],750.,places=5)

    def test_responsive_purchase_requires_additional_deliverable_supply(self):
        cs=self.offers()+[Curve('buy','0_buy',-1,((3.,60.),),False)]
        r=solve_network(cs,['a','b','b'],self.network(),[0.,15.])
        np.testing.assert_allclose(r['quantities'],[5.,13.,3.],atol=1e-6)
        self.assertAlmostEqual(r['objective_dollars'],570.,places=5)

    def test_tighter_sloped_domain_preserves_integral(self):
        cs=[Curve('s','1_s',1,((0.,10.),(10.,30.)),True)]
        r=solve_network(cs,['a'],self.network(100.),[0.,5.],dispatch_bounds={'s':(3.,6.)})
        self.assertAlmostEqual(r['objective_dollars'],75.,places=4)
        self.assertAlmostEqual(r['nodal_prices'][1],20.,places=4)

    def test_meshed_network_obeys_kirchhoff(self):
        n=Network(('a','b','c'),(Branch('ab','a','b',.1,100.),
              Branch('bc','b','c',.1,100.),Branch('ac','a','c',.1,100.)),'a',100.)
        r=solve_network([self.offers()[0]],['a'],n,[0.,0.,9.])
        np.testing.assert_allclose(r['flows_mw'],[3.,3.,6.],atol=1e-6)
        self.assertLess(r['verification']['kirchhoff_error_mw'],1e-6)

    def test_infeasible_network_is_not_replaced_with_single_node(self):
        with self.assertRaises(RuntimeError):
            solve_network([self.offers()[0]],['a'],self.network(),[0.,15.])

    def test_disconnected_and_incomplete_mapping_rejected(self):
        with self.assertRaises(ValueError):
            Network(('a','b','c'),(Branch('ab','a','b',.1,10.),),'a',100.).matrices()
        with self.assertRaises(ValueError):
            solve_network(self.offers(),['a'],self.network(),[0.,15.])

    def test_corrupt_flow_is_detected(self):
        cs=self.offers();n=self.network();r=solve_network(cs,['a','b'],n,[0.,15.])
        r['flows_mw'][0]+=1.
        self.assertFalse(verify_network(cs,['a','b'],n,[0.,15.],r)['passed'])

    def test_price_matches_incremental_nodal_demand_cost(self):
        cs=self.offers();n=self.network();r=solve_network(cs,['a','b'],n,[0.,15.])
        delta=.001
        upper=solve_network(cs,['a','b'],n,[0.,15.+delta])
        lower=solve_network(cs,['a','b'],n,[0.,15.-delta])
        self.assertAlmostEqual((upper['objective_dollars']-lower['objective_dollars'])/(2*delta),
                               r['nodal_prices'][1],places=4)

    def test_binding_count_can_be_serialized_in_simulation_report(self):
        import json
        from studies.network_simulation import binding_count
        count=binding_count(self.network(),np.array([5.]))
        self.assertEqual(json.loads(json.dumps({'count':count}))['count'],1)

    def test_simulation_studies_respect_configured_seeds_and_loss_offset(self):
        from studies.network_simulation import study_inputs
        config={'mapping_seeds':[4,8], 'synthetic_loss_sensitivities':[0.,-.1],
                'synthetic_loss_offset_mw':2.}
        self.assertEqual(study_inputs(config),[
            ('unconstrained_control',4,None,0.),('constrained_lossless',4,None,0.),
            ('constrained_lossless',8,None,0.),('constrained_linear_losses',4,[0.,-.1],2.)])

    def test_finite_difference_check_serializes_numpy_price(self):
        import json
        from studies.network_simulation import derivative_check
        check=derivative_check('hour','node',.1,np.float64(20.),np.float64(20.001))
        self.assertTrue(json.loads(json.dumps(check))['passed'])


if __name__=='__main__':
    unittest.main()
