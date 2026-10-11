import unittest
from optimizer.energy_auction import Curve
from studies.fidelity_diagnostics import diagnose_hour


class FidelityDiagnosticTests(unittest.TestCase):
    def test_signed_quantities_and_responsive_bids_reconcile_fixed_load(self):
        cs=[Curve('s','1_s',1,((10.,20.),),False),
            Curve('sink','1_sink',1,((-2.,-10.),(0.,-10.)),False),
            Curve('bid','0_bid',-1,((3.,50.),),False)]
        d=diagnose_hour(cs,[10.,-2.,3.],5.,20.,30.)
        self.assertEqual((d['supply_mw'],d['signed_consumption_mw'],d['responsive_purchase_mw']),(10.,2.,3.))
        self.assertEqual(d['balance_residual_mw'],0.)
        self.assertEqual(d['price_error_dollars_per_mwh'],-10.)

    def test_repeated_codes_remain_distinct_and_classification_unknown(self):
        cs=[Curve('row1','1_same',1,((10.,20.),),False),
            Curve('row2','1_same',1,((10.,20.),),False)]
        d=diagnose_hour(cs,[3.,2.],5.,20.,30.)
        self.assertEqual({r['row_id'] for r in d['marginal_rows']},{'row1','row2'})
        self.assertTrue(all(r['classification']=={'physical_type':'unknown','baa':'unknown','node':'unknown'}
                            for r in d['marginal_rows']))
        self.assertEqual(d['fixed_demand_mw'],5.)

    def test_sloped_interior_row_identified_at_its_own_marginal_price(self):
        c=Curve('s','1_s',1,((0.,10.),(10.,30.)),True)
        d=diagnose_hour([c],[5.],5.,20.,30.)
        self.assertEqual(d['marginal_rows'][0]['category'],'interior_sloped')
        self.assertEqual(d['marginal_rows'][0]['marginal_price_interval'],[20.,20.])
        self.assertEqual(d['marginal_rows'][0]['points'],[[0.,10.],[10.,30.]])

    def test_endpoint_tie_separate_from_interior_price_setting_row(self):
        c=Curve('s','1_s',1,((10.,20.),),False)
        d=diagnose_hour([c],[10.],10.,20.,30.)
        self.assertEqual(d['marginal_rows'][0]['category'],'upper_endpoint_tie')
        self.assertEqual(d['interior_marginal_count'],0)

    def test_block_discontinuity_brackets_dual_price(self):
        c=Curve('s','1_s',1,((0.,10.),(5.,20.),(10.,30.)),False)
        d=diagnose_hour([c],[5.],5.,25.,30.)
        self.assertEqual(d['marginal_rows'][0]['category'],'interior_block_kink')
        self.assertEqual(d['marginal_rows'][0]['marginal_price_interval'],[20.,30.])

    def test_invalid_awards_rejected(self):
        c=Curve('s','1_s',1,((10.,20.),),False)
        for quantities in ([],[float('nan')],[11.]):
            with self.subTest(quantities=quantities),self.assertRaises(ValueError):
                diagnose_hour([c],quantities,5.,20.,30.)


if __name__=='__main__':
    unittest.main()
