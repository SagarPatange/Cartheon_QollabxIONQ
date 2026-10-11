"""Tests for freight_sim/quantum/assignment_oracle.py: the contested cluster and its exact cost table (no Qiskit)."""

from freight_sim.network import RoadNetwork
from freight_sim.policies.objectives import OBJECTIVES
from freight_sim.quantum.assignment_oracle import build_assignment_oracle, find_contested_cluster
from freight_sim.scenario import Load
from freight_sim.state import DecisionState, TruckView

CITIES = ["Dallas, TX", "Memphis, TN", "Houston, TX"]
MILES = [[0, 450, 250], [450, 0, 690], [250, 690, 0]]
NETWORK = RoadNetwork(CITIES, MILES, average_mph=50)
HOUR = 60
PROFIT = OBJECTIVES["profit"]


def make_load(load_id, revenue, pickup_hour=30):
    return Load(load_id, "Dallas, TX", "Memphis, TN", "D", revenue, pickup_hour * HOUR, (pickup_hour + 13) * HOUR, 0)


def make_contested_state():
    """Two loads out of Dallas, two trucks: the Dallas truck is wanted by both, the Houston truck is the fallback."""
    loads = [make_load("big", 3000.0), make_load("small", 2200.0, pickup_hour=31)]
    trucks = [TruckView("near", "Dallas, TX", "D"), TruckView("far", "Houston, TX", "D")]
    return DecisionState(minute=9 * HOUR, open_loads=loads, free_trucks=trucks, network=NETWORK)


def test_the_cluster_is_the_loads_competing_for_one_truck_with_their_best_trucks():
    cluster = find_contested_cluster(make_contested_state(), PROFIT)
    assert {(pair.load_id, pair.truck_id) for pair in cluster} == {
        ("big", "near"), ("big", "far"), ("small", "near"), ("small", "far"),
    }


def test_no_contest_means_no_cluster():
    state = DecisionState(minute=9 * HOUR, open_loads=[make_load("only", 3000.0)],
                          free_trucks=[TruckView("near", "Dallas, TX", "D")], network=NETWORK)
    assert find_contested_cluster(state, PROFIT) == []


def test_a_truck_or_load_used_twice_is_infeasible_and_costs_more_than_any_feasible_choice():
    oracle = build_assignment_oracle(find_contested_cluster(make_contested_state(), PROFIT), "profit")
    assert oracle["n_bits"] == 4
    assert len(oracle["entries"]) == 16
    feasible_costs = [entry["cost"] for entry in oracle["entries"] if entry["feasible"]]
    for entry, cost in zip(oracle["entries"], oracle["costs"], strict=True):
        if not entry["feasible"]:
            assert cost == oracle["penalty_cost"] > max(feasible_costs)
    assert oracle["entries"][0]["feasible"] and oracle["entries"][0]["value"] == 0


def test_the_tables_best_assignment_is_the_one_the_milp_picks():
    oracle = build_assignment_oracle(find_contested_cluster(make_contested_state(), PROFIT), "profit")
    assert oracle["milp_index"] in oracle["optimal_indices"]
    best = oracle["entries"][oracle["optimal_indices"][0]]
    # Both loads get a truck: one the near truck, the other the far one.
    assert sorted(best["assignment"]) == ["big", "small"]
    assert sorted(best["assignment"].values()) == ["far", "near"]
    assert best["value"] == oracle["best_value"]
