import unittest
from dataclasses import replace
import numpy as np
from tests.test_multihour_dispatch import two_hour_case
from optimizer.unit_commitment import CommitmentUnit, solve_commitment, verify_commitment, price_fixed_commitment, enumerate_commitments


def specs(case,cheap_startup=10.):
    return tuple(CommitmentUnit(u.unit_id,cheap_startup if i==0 else 0.,0.,0.,0.,
        i==1,10.,(0.,)*len(case.curves),20.,20.) for i,u in enumerate(case.units))


class CommitmentTests(unittest.TestCase):
    def test_expensive_startup_changes_least_cost_schedule(self):
        case=two_hour_case(20.)
        cheap=solve_commitment(case,specs(case,10.))
        expensive=solve_commitment(case,specs(case,1000.))
        self.assertAlmostEqual(cheap['objective_dollars'],410.,places=4)
        self.assertAlmostEqual(expensive['objective_dollars'],1000.,places=4)
        self.assertEqual([on[0] for on in cheap['on']],[1,1])
        self.assertEqual([on[0] for on in expensive['on']],[0,0])
        self.assertTrue(expensive['verification']['passed'])

    def test_minimum_up_time_keeps_started_unit_on(self):
        case=two_hour_case(20.)
        case=replace(case,interval_end=case.interval_end+('2026-07-01T08:00:00+00:00',),interval_hours=(1.,)*3,
            curves=case.curves+(tuple(replace(c,row_id=c.row_id+'-last') for c in case.curves[-1]),),
            nodes=(('a','b'),)*3,unit_ids=(('cheap','local'),)*3,row_types=(('physical','physical'),)*3,
            demand=((0.,0.),(0.,10.),(0.,0.)),
            units=tuple(replace(u,minimum_mw=(0.,)*3,maximum_mw=(20.,)*3,available=(True,)*3) for u in case.units))
        s=specs(case,0.);s=(replace(s[0],minimum_up_hours=2.,no_load_dollars_per_hour=100.),s[1])
        result=solve_commitment(case,s)
        self.assertEqual([on[0] for on in result['on']],[0,1,1])
        self.assertAlmostEqual(result['objective_dollars'],400.,places=4)

    def test_initial_down_time_prevents_an_early_start(self):
        case=two_hour_case(20.);s=specs(case)
        s=(replace(s[0],minimum_down_hours=3.,initial_status_hours=0.),s[1])
        r=solve_commitment(case,s)
        self.assertEqual([on[0] for on in r['on']],[0,0])
        self.assertAlmostEqual(r['objective_dollars'],1000.,places=4)

    def test_startup_ramp_limits_first_interval_generation(self):
        case=two_hour_case(20.);s=specs(case,0.)
        s=(replace(s[0],startup_ramp_mw=5.),s[1])
        r=solve_commitment(case,s)
        np.testing.assert_allclose(r['quantities'],[[5.,5.],[10.,0.]],atol=1e-5)

    def test_infeasible_shutdown_does_not_disappear_on_unavailability(self):
        case=two_hour_case(20.)
        case=replace(case,units=(replace(case.units[0],initial_dispatch_mw=10.,available=(False,False)),case.units[1]))
        s=specs(case,0.);s=(replace(s[0],initial_on=True,shutdown_ramp_mw=5.),s[1])
        with self.assertRaises(RuntimeError):
            solve_commitment(case,s)

    def test_sloped_cost_is_rejected_by_linear_commitment_model(self):
        from optimizer.energy_auction import Curve
        case=two_hour_case(20.)
        case=replace(case,curves=tuple((Curve(f's-{h}','1_s',1,((0.,10.),(20.,30.)),True),cs[1]) for h,cs in enumerate(case.curves)))
        with self.assertRaises(ValueError):
            solve_commitment(case,specs(case))

    def test_fixed_commitment_price_matches_nodal_demand_derivative(self):
        case=two_hour_case(20.);s=specs(case,1000.);r=solve_commitment(case,s)
        prices=price_fixed_commitment(case,s,r['on'])
        changed=replace(case,demand=((0.,10.),(0.,10.01)))
        plus=price_fixed_commitment(changed,s,r['on'])
        self.assertAlmostEqual((plus['objective_dollars']-prices['objective_dollars'])/.01,50.,places=5)
        np.testing.assert_allclose(prices['nodal_prices'],[[50.,50.],[50.,50.]],atol=1e-5)
        self.assertTrue(prices['verification']['passed'])

    def test_tiny_commitment_matches_complete_enumeration(self):
        case=two_hour_case(20.);s=specs(case)
        result=solve_commitment(case,s);enumerated=enumerate_commitments(case,s)
        self.assertEqual(enumerated['candidates'],16)
        self.assertAlmostEqual(result['objective_dollars'],enumerated['best_objective_dollars'],places=5)
        self.assertLess(result['mip_gap'],1e-8)

    def test_corrupted_status_or_startup_cost_fails_certificate(self):
        case=two_hour_case(20.);s=specs(case);r=solve_commitment(case,s)
        r['starts'][0][0]=0
        self.assertFalse(verify_commitment(case,s,r)['passed'])

    def test_terminal_policy_rejects_incomplete_minimum_run(self):
        case=two_hour_case(20.);s=specs(case)
        s=(replace(s[0],minimum_up_hours=3.),s[1])
        r=solve_commitment(case,s)
        self.assertEqual([on[0] for on in r['on']],[0,0])

    def test_loader_requires_explicit_commitment_parameters(self):
        import json,tempfile
        from pathlib import Path
        from optimizer.energy_auction import PROJECT
        from optimizer.unit_commitment import load_commitment_specs
        case=two_hour_case();payload={'units':[{'unit_id':u.unit_id} for u in case.units]}
        with tempfile.TemporaryDirectory(dir=PROJECT) as tmp:
            path=Path(tmp)/'case.json';path.write_text(json.dumps(payload))
            with self.assertRaises(ValueError):
                load_commitment_specs(path,case)

    def test_exported_conditional_price_and_dual_bound_are_rebuilt(self):
        from optimizer.unit_commitment import verify_fixed_pricing
        case=two_hour_case(20.);s=specs(case,1000.)
        r=price_fixed_commitment(case,s,[[0,1],[0,1]])
        r['nodal_prices'][0][0]+=1.
        self.assertFalse(verify_fixed_pricing(case,s,r)['passed'])

    def test_invalid_export_arrays_fail_commitment_and_pricing(self):
        from copy import deepcopy
        from optimizer.unit_commitment import verify_fixed_pricing
        case=two_hour_case(20.);sp=specs(case)
        for original,verify,keys in [
            (solve_commitment(case,sp),verify_commitment,['flows_mw','unit_generation_mw']),
            (price_fixed_commitment(case,sp,[[1,1],[1,1]]),verify_fixed_pricing,
             ['flows_mw','unit_generation_mw','mec','mcc','mlc','nodal_prices'])]:
            for key in keys:
                for value in [float('nan'),float('inf')]:
                    with self.subTest(key=key,value=value):
                        bad=deepcopy(original);a=np.asarray(bad[key],dtype=float);a.flat[0]=value;bad[key]=a.tolist()
                        self.assertFalse(verify(case,sp,bad)['passed'])
                with self.subTest(key=key,shape=True):
                    bad=deepcopy(original);bad[key]=[]
                    self.assertFalse(verify(case,sp,bad)['passed'])


if __name__=='__main__':
    unittest.main()
