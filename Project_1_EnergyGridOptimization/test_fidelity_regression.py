"""Integration regression for the July 1 fourth-hour convergence failure."""
import unittest
from energy_auction import PROJECT, load_curves, solve, clearing_oracle, verify


class FidelityRegression(unittest.TestCase):
    def test_fourth_hour_combined_fixed_demand(self):
        curves = load_curves(PROJECT/'data/DA-ENERGY-OFFERS-202607010100.csv',
                             '07/01/2026 04:00:00')
        result = solve(curves, fixed_demand_mw=36660.306)
        self.assertTrue(result['numerical_optimizer_verified'])
        reference = clearing_oracle(curves, fixed_demand_mw=36660.306)
        self.assertTrue(verify(curves, result)['passed'])
        self.assertAlmostEqual(result['objective_dollars'], reference['objective_dollars'], places=2)


if __name__ == '__main__':
    unittest.main()
