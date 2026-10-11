"""Build the exact cost table for the quantum experiment from a real simulated week.

Runs the week with the MILP policy, keeps what it saw at every decision epoch, picks the epoch with the largest
contested cluster (freight_sim/quantum/assignment_oracle.py), and writes its table as JSON.

Run from the project folder:
    python tools/build_quantum_oracle.py --start 2022-03-07 --objective profit --out data/quantum/freight_oracle.json
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from freight_sim.policies.milp import make_milp_policy  # noqa: E402
from freight_sim.policies.objectives import OBJECTIVES  # noqa: E402
from freight_sim.quantum.assignment_oracle import build_assignment_oracle, find_contested_cluster  # noqa: E402
from freight_sim.replay import load_week  # noqa: E402
from freight_sim.simulator import simulate  # noqa: E402

DEFAULT_OUT = "data/quantum/freight_oracle.json"


def record_states(start_date: str, seed: int, objective_key: str) -> list:
    """Every DecisionState the MILP policy saw during the week, in order."""
    scenario, settings = load_week(start_date, seed)
    policy = make_milp_policy(objective_key)
    states = []

    def recording_policy(state):
        states.append(state)
        return policy(state)

    simulate(scenario, recording_policy, settings)
    return states


def pick_most_contested(states: list, objective_key: str):
    """(state, cluster) for the epoch whose contested cluster has the most pairs; the earliest on a tie."""
    objective = OBJECTIVES[objective_key]
    best_state = None
    best_cluster = []
    for state in states:
        cluster = find_contested_cluster(state, objective)
        if len(cluster) > len(best_cluster):
            best_state = state
            best_cluster = cluster
    if best_state is None:
        raise ValueError("no epoch in this week has two loads competing for one truck")
    return best_state, best_cluster


def build_oracle_for_week(start_date: str, seed: int, objective_key: str) -> dict:
    states = record_states(start_date, seed, objective_key)
    state, cluster = pick_most_contested(states, objective_key)
    oracle = build_assignment_oracle(cluster, objective_key)
    oracle["source"] = {
        "week_start": start_date, "seed": seed, "epoch_minute": state.minute, "epoch_count": len(states),
        "open_loads": len(state.open_loads), "free_trucks": len(state.free_trucks),
    }
    return oracle


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", default="2022-03-07")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--objective", default="profit", choices=sorted(OBJECTIVES))
    parser.add_argument("--out", default=DEFAULT_OUT)
    arguments = parser.parse_args()
    oracle = build_oracle_for_week(arguments.start, arguments.seed, arguments.objective)
    out_path = Path(arguments.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(oracle, indent=1))
    feasible_count = sum(1 for entry in oracle["entries"] if entry["feasible"])
    print(f"{oracle['n_bits']} pairs, {feasible_count} of {len(oracle['entries'])} assignments feasible, "
          f"best value {oracle['best_value']:,.2f} → {out_path}")


if __name__ == "__main__":
    main()
