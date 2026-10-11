import csv
import tempfile
import unittest
from pathlib import Path

from optimizer.energy_auction import Curve, load_curves, solve, verify, run, clearing_oracle


class AuctionTests(unittest.TestCase):
    def curve(self, name, side, points, slope=False):
        return Curve(name, name, side, tuple(points), slope)

    def test_block_interval_uses_right_endpoint_price(self):
        c = self.curve('s', 1, [(10, 20), (20, 40)])
        self.assertAlmostEqual(c.integral(15), 400)

    def test_slope_cost_is_integral_not_terminal_price_times_quantity(self):
        c = self.curve('s', 1, [(10, 20), (20, 40)], True)
        self.assertAlmostEqual(c.integral(15), 325)

    def test_signed_curve_normalizes_cost_at_zero(self):
        c = self.curve('storage', 1, [(-10, -20), (0, 0), (10, 20)], True)
        self.assertEqual(c.integral(0), 0)
        self.assertAlmostEqual(c.integral(-5), 25)
        self.assertAlmostEqual(c.integral(5), 25)

    def test_block_auction_hand_solution(self):
        cs = [self.curve('s', 1, [(10, 20)]), self.curve('b', -1, [(7, 50)])]
        r = solve(cs)
        self.assertAlmostEqual(r['quantities'][0], 7, places=5)
        self.assertAlmostEqual(r['quantities'][1], 7, places=5)
        self.assertAlmostEqual(r['objective_dollars'], -210, places=4)
        self.assertTrue(verify(cs, r)['passed'])

    def test_fixed_demand_is_mandatory_and_included_in_dual_certificate(self):
        cs = [self.curve('s', 1, [(10, 20)])]
        r = solve(cs, fixed_demand_mw=5)
        self.assertAlmostEqual(r['quantities'][0], 5)
        self.assertAlmostEqual(r['clearing_price_dollars_per_mwh'], 20)
        self.assertAlmostEqual(r['objective_dollars'], 100)
        self.assertTrue(verify(cs, r)['passed'])

    def test_sloped_supply_price_at_fixed_quantity(self):
        cs = [self.curve('s', 1, [(0, 10), (10, 30)], True)]
        r = solve(cs, fixed_demand_mw=7.5)
        self.assertAlmostEqual(r['quantities'][0], 7.5, places=5)
        self.assertAlmostEqual(r['clearing_price_dollars_per_mwh'], 25, places=4)
        self.assertAlmostEqual(r['objective_dollars'], 131.25, places=4)
        self.assertTrue(verify(cs, r)['passed'])

    def test_fixed_demand_is_additional_to_cleared_purchase_bids(self):
        cs = [self.curve('s', 1, [(10, 20)]), self.curve('b', -1, [(3, 50)])]
        r = solve(cs, fixed_demand_mw=5)
        self.assertAlmostEqual(r['quantities'][0], 8)
        self.assertAlmostEqual(r['quantities'][1], 3)
        self.assertAlmostEqual(r['objective_dollars'], 10)
        self.assertTrue(verify(cs, r)['passed'])

    def test_invalid_and_infeasible_fixed_demand_rejected(self):
        cs = [self.curve('s', 1, [(10, 20)])]
        for fixed in [-1, float('nan'), float('inf'), 11]:
            with self.assertRaises(ValueError):
                solve(cs, fixed_demand_mw=fixed)

    def test_independent_clearing_handles_flat_price_ties(self):
        cs = [self.curve('a', 1, [(10, 20)]), self.curve('b', 1, [(10, 20)])]
        r = clearing_oracle(cs, fixed_demand_mw=7)
        self.assertAlmostEqual(sum(r['quantities']), 7, places=6)
        self.assertAlmostEqual(r['clearing_price_dollars_per_mwh'], 20, places=6)
        self.assertAlmostEqual(r['objective_dollars'], 140, places=5)
        self.assertTrue(verify(cs, r)['passed'])

    def test_independent_sloped_clearing_matches_analytic_solution(self):
        cs = [self.curve('s', 1, [(0, 10), (10, 30)], True),
              self.curve('b', -1, [(0, 40), (10, 20)], True)]
        r = clearing_oracle(cs)
        self.assertAlmostEqual(r['quantities'][0], 7.5, places=5)
        self.assertAlmostEqual(r['clearing_price_dollars_per_mwh'], 25, places=5)
        self.assertAlmostEqual(r['objective_dollars'], -112.5, places=5)
        self.assertTrue(verify(cs, r)['passed'])

    def test_independent_clearing_preserves_negative_offer_consumption(self):
        cs = [self.curve('s', 1, [(10, -30)]),
              self.curve('sink', 1, [(-5, -10), (0, -10)])]
        r = clearing_oracle(cs)
        self.assertAlmostEqual(r['quantities'][0], 5, places=5)
        self.assertAlmostEqual(r['quantities'][1], -5, places=5)
        self.assertAlmostEqual(r['objective_dollars'], -100, places=5)
        self.assertTrue(verify(cs, r)['passed'])

    def test_independent_clearing_valid_with_nonunique_balance_price(self):
        cs = [self.curve('s', 1, [(7, 20)]), self.curve('b', -1, [(7, 50)])]
        r = clearing_oracle(cs)
        # Any price between 20 and 50 can support these awards.
        self.assertGreaterEqual(r['clearing_price_dollars_per_mwh'], 20)
        self.assertLessEqual(r['clearing_price_dollars_per_mwh'], 50)
        self.assertAlmostEqual(r['objective_dollars'], -210, places=5)
        self.assertTrue(verify(cs, r)['passed'])

    def test_independent_clearing_rejects_infeasible_load(self):
        with self.assertRaises(ValueError):
            clearing_oracle([self.curve('s', 1, [(10, 20)])], fixed_demand_mw=11)

    def test_sloped_supply_and_demand_hand_solution(self):
        cs = [self.curve('s', 1, [(0, 10), (10, 30)], True),
              self.curve('b', -1, [(0, 40), (10, 20)], True)]
        r = solve(cs)
        self.assertAlmostEqual(r['quantities'][0], 7.5, places=3)
        self.assertAlmostEqual(r['objective_dollars'], -112.5, places=3)
        self.assertTrue(verify(cs, r)['passed'])

    def test_negative_price_generation_serves_signed_sink(self):
        cs = [self.curve('s', 1, [(10, -30)]),
              self.curve('sink', 1, [(-5, -10), (0, -10)])]
        r = solve(cs)
        self.assertAlmostEqual(r['quantities'][0], 5, places=5)
        self.assertAlmostEqual(r['quantities'][1], -5, places=5)
        self.assertAlmostEqual(r['objective_dollars'], -100, places=4)

    def test_reject_nonconvex_supply_and_bid(self):
        for side, prices in [(1, [30, 20]), (-1, [20, 30])]:
            with self.assertRaises(ValueError):
                self.curve('bad', side, list(zip([1, 2], prices)))

    def test_zero_capacity_curve_stays_in_result(self):
        cs = [self.curve('zero', 1, [(0, 20)]), self.curve('b', -1, [(2, 30)])]
        r = solve(cs)
        self.assertEqual(len(r['quantities']), 2)
        self.assertAlmostEqual(sum(r['quantities']), 0)

    def test_verification_detects_corrupted_award(self):
        cs = [self.curve('s', 1, [(10, 20)]), self.curve('b', -1, [(7, 50)])]
        r = solve(cs)
        r['quantities'][0] += 1
        self.assertFalse(verify(cs, r)['passed'])

    def test_failed_numerical_optimizer_uses_certified_same_model(self):
        from unittest.mock import patch
        cs = [self.curve('s', 1, [(10, 20)]), self.curve('b', -1, [(7, 50)])]
        with patch('optimizer.energy_auction._solve_numerical', side_effect=RuntimeError('iteration limit')):
            r = solve(cs)
        self.assertFalse(r['numerical_optimizer_verified'])
        self.assertEqual(r['rejected_numerical_attempt']['error'], 'iteration limit')
        self.assertTrue(verify(cs, r)['passed'])
        self.assertAlmostEqual(r['objective_dollars'], -210, places=5)

    def test_solver_success_with_invalid_awards_is_rejected(self):
        from unittest.mock import patch
        cs = [self.curve('s', 1, [(10, 20)]), self.curve('b', -1, [(7, 50)])]
        bad = dict(quantities=[8., 7.], objective_dollars=-190.,
                   clearing_price_dollars_per_mwh=20., status='solved')
        with patch('optimizer.energy_auction._solve_numerical', return_value=bad):
            r = solve(cs)
        self.assertFalse(r['numerical_optimizer_verified'])
        self.assertFalse(r['rejected_numerical_attempt']['verification']['passed'])
        self.assertTrue(verify(cs, r)['passed'])

    def test_csv_preserves_repeated_codes_and_original_row_ids(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as d:
            p = Path(d) / 'offers.csv'
            fields = ['CPTHourEnd', 'GMTHourEnd', 'RCode', 'Use_Bid_Slope'] + [
                field for i in range(1, 11) for field in (f'MW{i}', f'Price{i}')]
            with p.open('w', newline='') as f:
                w = csv.DictWriter(f, fieldnames=fields)
                w.writeheader()
                for price in [20, 30]:
                    w.writerow(dict(CPTHourEnd='hour', GMTHourEnd='utc', RCode='1_same',
                                    Use_Bid_Slope='0', MW1='10', Price1=str(price)))
            cs = load_curves(p, 'hour')
            self.assertEqual(len(cs), 2)
            self.assertNotEqual(cs[0].row_id, cs[1].row_id)
            self.assertEqual(cs[0].rcode, cs[1].rcode)

    def test_csv_rejects_missing_curve_columns(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as d:
            p = Path(d) / 'truncated.csv'
            p.write_text('CPTHourEnd,RCode,Use_Bid_Slope,MW1,Price1\n'
                         'hour,1_s,0,10,20\n')
            with self.assertRaisesRegex(ValueError, 'Missing required'):
                load_curves(p, 'hour')

    def test_runs_keep_separate_complete_artifacts(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as d:
            p = Path(d) / 'offers.csv'
            fields = ['CPTHourEnd', 'GMTHourEnd', 'RCode', 'Use_Bid_Slope'] + [
                field for i in range(1, 11) for field in (f'MW{i}', f'Price{i}')]
            with p.open('w', newline='') as f:
                w = csv.DictWriter(f, fieldnames=fields)
                w.writeheader()
                for code, price in [('1_supply', 20), ('0_bid', 50)]:
                    w.writerow(dict(CPTHourEnd='hour', GMTHourEnd='utc', RCode=code,
                                    Use_Bid_Slope='0', MW1='10', Price1=str(price)))
            a = run('hour', source=p, output_root=Path(d) / 'results')
            old_report = (Path(a['output_directory']) / 'first_hour_report.json').read_bytes()
            b = run('hour', source=p, output_root=Path(d) / 'results')
            self.assertNotEqual(a['output_directory'], b['output_directory'])
            self.assertEqual((Path(a['output_directory']) / 'first_hour_report.json').read_bytes(), old_report)
            for report in (a, b):
                folder = Path(report['output_directory'])
                self.assertTrue((folder / 'full_hour_awards.csv').is_file())
                self.assertTrue((folder / 'block_only_subset_awards.csv').is_file())
                self.assertTrue(all(s['verification']['passed'] for s in report['studies'].values()))


if __name__ == '__main__':
    unittest.main()
