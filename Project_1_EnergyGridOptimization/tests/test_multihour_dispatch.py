import unittest
from dataclasses import replace
import numpy as np
from optimizer.energy_auction import Curve
from optimizer.network_dispatch import Branch, Network, solve_network
from optimizer.multihour_dispatch import DispatchCase, Unit, solve_multihour, verify_multihour


def two_hour_case(ramp=5.):
    network=Network(('a','b'),(Branch('ab','a','b',.1,100.),),'a',100.)
    units=(Unit('cheap','a',(0.,0.),(20.,20.),(True,True),0.,ramp,20.),
           Unit('local','b',(0.,0.),(20.,20.),(True,True),0.,20.,20.))
    curves=tuple((Curve(f'cheap-{h}','1_cheap',1,((20.,20.),),False),
                  Curve(f'local-{h}','1_local',1,((20.,50.),),False)) for h in range(2))
    return DispatchCase(network,('2026-07-01T06:00:00+00:00','2026-07-01T07:00:00+00:00'),
        (1.,1.),curves,(('a','b'),)*2,(('cheap','local'),)*2,(('physical','physical'),)*2,
        ((0.,10.),(0.,10.)),units)


class MultiHourTests(unittest.TestCase):
    def test_ramp_links_hours_and_initial_dispatch(self):
        r=solve_multihour(two_hour_case())
        np.testing.assert_allclose(r['quantities'],[[5.,5.],[10.,0.]],atol=1e-5)
        self.assertAlmostEqual(r['objective_dollars'],550.,places=4)
        self.assertTrue(r['verification']['passed'])

    def test_unrestricted_ramps_match_independent_network_hours(self):
        case=two_hour_case(20.);r=solve_multihour(case)
        references=[solve_network(cs,nodes,case.network,d) for cs,nodes,d in zip(case.curves,case.nodes,case.demand)]
        self.assertAlmostEqual(r['objective_dollars'],sum(x['objective_dollars'] for x in references),places=5)
        np.testing.assert_allclose(r['nodal_prices'],[x['nodal_prices'] for x in references],atol=1e-5)

    def test_unavailable_cheap_unit_cannot_generate(self):
        case=two_hour_case(20.)
        case=replace(case,units=(replace(case.units[0],available=(False,True)),case.units[1]))
        r=solve_multihour(case)
        np.testing.assert_allclose(r['quantities'],[[0.,10.],[10.,0.]],atol=1e-5)

    def test_two_rows_share_unit_capacity_instead_of_duplicating_it(self):
        case=two_hour_case(20.)
        extra=tuple(cs+(Curve(f'extra-{h}','1_cheap',1,((20.,20.),),False),) for h,cs in enumerate(case.curves))
        case=replace(case,curves=extra,nodes=(('a','b','a'),)*2,
            unit_ids=(('cheap','local','cheap'),)*2,row_types=(('physical',)*3,)*2,
            demand=((0.,15.),)*2,units=(replace(case.units[0],maximum_mw=(10.,10.)),case.units[1]))
        r=solve_multihour(case)
        self.assertAlmostEqual(r['objective_dollars'],900.,places=4)
        self.assertTrue(all(abs(q[0]+q[2]-10.)<1e-5 for q in r['quantities']))

    def test_missing_mapping_and_physical_node_mismatch_rejected(self):
        case=two_hour_case()
        for bad in (replace(case,unit_ids=(('cheap',),)*2),
                    replace(case,nodes=(('b','b'),)*2),
                    replace(case,unit_ids=((None,'local'),)*2)):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                solve_multihour(bad)

    def test_bad_initial_dispatch_and_time_grid_rejected(self):
        case=two_hour_case()
        for bad in (replace(case,units=(replace(case.units[0],initial_dispatch_mw=30.),case.units[1])),
                    replace(case,interval_end=(case.interval_end[0],case.interval_end[0]))):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                solve_multihour(bad)

    def test_infeasible_initial_ramp_is_not_repaired(self):
        case=two_hour_case(0.)
        case=replace(case,units=(case.units[0],replace(case.units[1],available=(False,False))))
        with self.assertRaises(RuntimeError):
            solve_multihour(case)

    def test_slope_integral_preserved_across_intervals(self):
        case=two_hour_case(20.)
        curves=tuple((Curve(f's-{h}','1_s',1,((0.,10.),(20.,30.)),True),case.curves[h][1]) for h in range(2))
        case=replace(case,curves=curves)
        r=solve_multihour(case)
        self.assertAlmostEqual(r['objective_dollars'],300.,places=4)
        np.testing.assert_allclose(r['nodal_prices'],[[20.,20.],[20.,20.]],atol=1e-4)

    def test_tampered_cross_hour_award_fails_independent_certificate(self):
        case=two_hour_case();r=solve_multihour(case)
        r['quantities'][0]=[10.,0.]
        self.assertFalse(verify_multihour(case,r)['passed'])

    def test_virtual_submission_is_not_assigned_physical_ramp(self):
        case=two_hour_case()
        case=replace(case,unit_ids=((None,'local'),)*2,row_types=(('virtual','physical'),)*2,
                     units=(case.units[1],))
        r=solve_multihour(case)
        np.testing.assert_allclose(r['quantities'],[[10.,0.],[10.,0.]],atol=1e-5)

    def test_operating_case_loader_preserves_explicit_unit_mapping(self):
        import json
        import tempfile
        from pathlib import Path
        from dataclasses import asdict
        from optimizer.multihour_dispatch import load_operating_case
        case=two_hour_case()
        payload={'network':asdict(case.network),'units':[asdict(u) for u in case.units],
                 'intervals':[{'end':end,'duration_hours':dt,'demand_mw':d,'submissions':[
                     dict(row_id=c.row_id,RCode=c.rcode,side=c.side,points=c.points,slope=c.slope,node=node,
                          unit_id=uid,type=kind)
                     for c,node,uid,kind in zip(cs,nodes,uids,kinds)]}
                     for end,dt,d,cs,nodes,uids,kinds in zip(case.interval_end,case.interval_hours,case.demand,
                        case.curves,case.nodes,case.unit_ids,case.row_types)]}
        from optimizer.energy_auction import PROJECT
        with tempfile.TemporaryDirectory(dir=PROJECT) as tmp:
            path=Path(tmp)/'case.json';path.write_text(json.dumps(payload))
            loaded=load_operating_case(path)
            self.assertEqual(loaded,case)

    def test_interval_duration_scales_cost_and_preserves_price_units(self):
        case=two_hour_case(20.)
        case=replace(case,interval_end=('2026-07-01T06:00:00+00:00','2026-07-01T06:30:00+00:00'),
                     interval_hours=(.5,.5))
        r=solve_multihour(case)
        self.assertAlmostEqual(r['objective_dollars'],200.,places=5)
        np.testing.assert_allclose(r['nodal_prices'],[[20.,20.],[20.,20.]],atol=1e-5)

    def test_temporal_comparison_reports_cost_of_ramp_constraints(self):
        from optimizer.multihour_dispatch import compare_temporal
        comparison=compare_temporal(two_hour_case())
        self.assertAlmostEqual(comparison['linked']['objective_dollars'],550.,places=5)
        self.assertAlmostEqual(comparison['unlinked_control']['objective_dollars'],400.,places=5)
        self.assertAlmostEqual(comparison['ramp_cost_difference_dollars'],150.,places=5)

    def test_invalid_export_arrays_fail_certificate(self):
        from copy import deepcopy
        case=two_hour_case(20.);original=solve_multihour(case)
        for key in ['flows_mw','unit_generation_mw','segment_quantities','mec','mcc','mlc','nodal_prices']:
            for value in [float('nan'),float('inf')]:
                with self.subTest(key=key,value=value):
                    bad=deepcopy(original);a=np.asarray(bad[key],dtype=float);a.flat[0]=value;bad[key]=a.tolist()
                    self.assertFalse(verify_multihour(case,bad)['passed'])
            with self.subTest(key=key,shape=True):
                bad=deepcopy(original);bad[key]=[]
                self.assertFalse(verify_multihour(case,bad)['passed'])


if __name__=='__main__':
    unittest.main()
