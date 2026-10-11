"""JSON boundary between Qollab's JavaScript page and the real Python solvers."""

import json
import time

from freight_sim.policies.milp import make_milp_policy
from freight_sim.policies.objectives import OBJECTIVES
from freight_sim.quantum.assignment_oracle import build_assignment_oracle, find_contested_cluster
from freight_sim.quantum.comparison import run_comparison
from freight_sim.replay import compare_objectives, load_week, simulate_week
from freight_sim.simulator import simulate

_backend_used = False


def map_data():
    """Literal paths let Qollab preload all map assets without network requests."""
    with open("data/dispatch_map/cities.json", encoding="utf-8") as source:
        cities = json.load(source)
    with open("data/dispatch_map/lanes.json", encoding="utf-8") as source:
        lanes = json.load(source)
    with open("data/osm_routes/lane_routes.json", encoding="utf-8") as source:
        paths = json.load(source)
    return json.dumps({"cities": cities, "lanes": lanes, "paths": paths})


def run_week(start_date, policy_name, objective_key, seed):
    return json.dumps(simulate_week(start_date, policy_name, int(seed), objective_key))


def compare_week(start_date, seed):
    return json.dumps({"start_date": start_date, "seed": seed, "runs": compare_objectives(start_date, int(seed))})


def prepare_oracle(start_date, seed, objective_key):
    """Pick the largest contested cluster, earliest on ties, from this week's MILP run."""
    started = time.perf_counter()
    scenario, settings = load_week(start_date, int(seed))
    policy = make_milp_policy(objective_key)
    objective = OBJECTIVES[objective_key]
    best_cluster = []
    best_state = None

    def recording_policy(state):
        nonlocal best_cluster, best_state
        cluster = find_contested_cluster(state, objective)
        if len(cluster) > len(best_cluster):
            best_cluster, best_state = cluster, state
        return policy(state)

    simulate(scenario, recording_policy, settings)
    if not best_cluster:
        raise ValueError("This week has no contested load–truck assignment; select another week.")
    oracle = build_assignment_oracle(best_cluster, objective_key)
    oracle["source"] = {"week_start": start_date, "seed": int(seed), "epoch_minute": best_state.minute,
                        "open_loads": len(best_state.open_loads), "free_trucks": len(best_state.free_trucks)}
    oracle["preparation_seconds"] = time.perf_counter() - started
    return oracle


def quantum_compare(backend, start_date="2022-03-07", seed=1, objective_key="profit", shots=256):
    """One live quantum job; the backend always comes from Qollab's QPU selector."""
    global _backend_used
    if _backend_used:
        raise RuntimeError("One backend job has already run. Press Qollab Run again for another experiment.")
    oracle = prepare_oracle(start_date, int(seed), objective_key)
    _backend_used = True
    comparison = run_comparison(backend, oracle, shots=int(shots), seed=2026, depth=1, restarts=1, maxiter=40)
    return json.dumps({"oracle": oracle, "comparison": comparison})
