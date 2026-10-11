import unittest
from dataclasses import replace
import numpy as np
from tests.test_multihour_dispatch import two_hour_case
from tests.test_unit_commitment import specs
from optimizer.reserve_coupling import ReserveUnit, ReserveCase
from optimizer.unit_commitment import solve_commitment, price_fixed_commitment, verify_commitment


def reserve_case(case,requirement=3.,eligible=3.,response=1.):
    return ReserveCase((ReserveUnit('cheap','north',(eligible,)*2,(1.,)*2,response),
                        ReserveUnit('local','south',(0.,)*2,(2.,)*2,response)),
                       {'north':(requirement,)*2,'south':(0.,)*2})


class ReserveCouplingTests(unittest.TestCase):
    def case(self,demand=7.):
        c=two_hour_case(20.)
        return replace(c,demand=((0.,demand),)*2,
                       units=(replace(c.units[0],maximum_mw=(10.,)*2),replace(c.units[1],available=(False,False))))

    def test_three_mw_reserve_leaves_only_seven_mw_energy_capacity(self):
        c=self.case();s=specs(c,0.);r=solve_commitment(c,s,reserve=reserve_case(c))
        np.testing.assert_allclose(r['quantities'],[[7.,0.],[7.,0.]],atol=1e-6)
        np.testing.assert_allclose(r['reserve_mw'],[[3.,0.],[3.,0.]],atol=1e-6)
        self.assertAlmostEqual(r['objective_dollars'],286.,places=5)
        self.assertTrue(r['verification']['passed'])

    def test_reserve_shortfall_is_infeasible_without_added_slack(self):
        c=self.case(8.)
        with self.assertRaises(RuntimeError):
            solve_commitment(c,specs(c,0.),reserve=reserve_case(c))

    def test_ineligible_and_unavailable_units_cannot_supply_reserve(self):
        c=self.case()
        with self.assertRaises(RuntimeError):
            solve_commitment(c,specs(c,0.),reserve=reserve_case(c,eligible=0.))

    def test_response_ramp_caps_eligible_reserve(self):
        c=self.case();c=replace(c,units=(replace(c.units[0],ramp_up_mw_per_hour=1.),c.units[1]))
        with self.assertRaises(RuntimeError):
            solve_commitment(c,specs(c,0.),reserve=reserve_case(c,response=.25))

    def test_zone_requirement_cannot_be_filled_by_another_zone(self):
        c=self.case();reserve=reserve_case(c)
        reserve=replace(reserve,requirements_mw={'north':(0.,)*2,'south':(3.,)*2})
        with self.assertRaises(RuntimeError):
            solve_commitment(c,specs(c,0.),reserve=reserve)

    def test_corrupted_reserve_award_fails_independent_checks(self):
        c=self.case();s=specs(c,0.);reserve=reserve_case(c)
        r=solve_commitment(c,s,reserve=reserve);r['reserve_mw'][0][0]=4.
        self.assertFalse(verify_commitment(c,s,r,reserve=reserve)['passed'])

    def test_conditional_reserve_pricing_has_original_cost_dual_certificate(self):
        c=self.case();s=specs(c,0.);reserve=reserve_case(c)
        r=solve_commitment(c,s,reserve=reserve)
        pricing=price_fixed_commitment(c,s,r['on'],reserve=reserve)
        self.assertAlmostEqual(pricing['objective_dollars'],r['objective_dollars'],places=5)
        self.assertTrue(pricing['verification']['passed'])


if __name__=='__main__':
    unittest.main()
