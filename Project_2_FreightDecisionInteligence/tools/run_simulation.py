"""Run one dispatch policy on a date range of the Kaggle loads and print the summary.

Run from the project folder:
    python tools/run_simulation.py 2022-03-01 2022-03-14 --seed 1

Simulation starts at midnight of the first date and runs until midnight after the last date. Loads tendered
before the start are visible at the first decision.
"""

import argparse
from datetime import date

from freight_sim.clock import MINUTES_PER_DAY
from freight_sim.policies.greedy import greedy_nearest_truck
from freight_sim.scenario import load_scenario
from freight_sim.simulator import Settings, simulate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("start_date")
    parser.add_argument("end_date")
    parser.add_argument("--seed", type=int, default=1)
    arguments = parser.parse_args()

    scenario = load_scenario(arguments.start_date, arguments.end_date, arguments.seed)
    day_count = (date.fromisoformat(arguments.end_date) - date.fromisoformat(arguments.start_date)).days + 1
    result = simulate(scenario, greedy_nearest_truck, Settings(end_minute=day_count * MINUTES_PER_DAY))
    print(f"{len(scenario.trucks)} trucks, {len(scenario.loads)} loads, seed {arguments.seed}, policy greedy")
    for name, value in result.summary.items():
        print(f"  {name:22} {value:,.2f}" if isinstance(value, float) else f"  {name:22} {value:,}")


if __name__ == "__main__":
    main()
