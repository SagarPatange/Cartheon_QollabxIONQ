"""Tests for freight_sim/policies/objectives.py through the assignment policy: each objective picks differently on
purpose, and every one still gives each truck at most one load and each load at most one truck."""

import pytest

from freight_sim.network import RoadNetwork
from freight_sim.policies.catalog import build_policy
from freight_sim.policies.milp import make_milp_policy
from freight_sim.policies.objectives import OBJECTIVES
from freight_sim.scenario import Load
from freight_sim.state import DecisionState, TruckView

CITIES = ["Dallas, TX", "Memphis, TN", "Houston, TX"]
MILES = [[0, 450, 250], [450, 0, 690], [250, 690, 0]]
NETWORK = RoadNetwork(CITIES, MILES, average_mph=50)
HOUR = 60


def make_load(load_id, pickup_hour=20, origin="Dallas, TX", revenue=2000.0):
    return Load(load_id, origin, "Memphis, TN", "D", revenue, pickup_hour * HOUR, (pickup_hour + 13) * HOUR, 0)


def decide(objective_key, loads, trucks, minute=9 * HOUR):
    state = DecisionState(minute=minute, open_loads=loads, free_trucks=trucks, network=NETWORK)
    return make_milp_policy(objective_key)(state)


def test_there_are_five_objectives_each_with_a_name_for_the_page():
    assert sorted(OBJECTIVES) == ["balanced", "cost", "profit", "revenue", "service"]
    for objective in OBJECTIVES.values():
        assert objective.label


def test_customer_satisfaction_covers_a_load_that_max_profit_holds_because_it_loses_money():
    # $500 for 450 loaded miles at $1.50/mi loses $175 even with the truck already in Dallas.
    loads = [make_load("cheap", revenue=500.0)]
    trucks = [TruckView("T1", "Dallas, TX", "D")]
    assert decide("profit", loads, trucks).accept == {}
    assert decide("service", loads, trucks).accept == {"cheap": "T1"}
    assert decide("service", loads, trucks).reasons["cheap"].endswith("−$175 margin)")


def test_customer_satisfaction_prefers_the_truck_that_makes_the_appointment():
    # Pickup at 13:00, decided at 09:00. The Houston truck needs 5 h and arrives at 14:00, an hour after the
    # appointment but inside the 2 h grace; the Dallas truck is there already.
    loads = [make_load("L1", pickup_hour=13)]
    trucks = [TruckView("houston", "Houston, TX", "D"), TruckView("dallas", "Dallas, TX", "D")]
    assert decide("service", loads, trucks).accept == {"L1": "dallas"}


def test_max_revenue_takes_the_bigger_load_when_there_is_one_truck():
    loads = [make_load("small", revenue=1500.0), make_load("big", pickup_hour=21, revenue=3000.0)]
    trucks = [TruckView("T1", "Dallas, TX", "D")]
    assert decide("revenue", loads, trucks).accept == {"big": "T1"}


def test_low_cost_refuses_a_far_truck_that_max_profit_would_send():
    # From Memphis: 450 empty + 450 loaded miles at $1.50 = $1,350 cost; $2,000 pays $650 margin, but counting the
    # empty miles three times costs $1,350 more, so low cost holds the load.
    loads = [make_load("L1")]
    trucks = [TruckView("far", "Memphis, TN", "D")]
    assert decide("profit", loads, trucks).accept == {"L1": "far"}
    low_cost = decide("cost", loads, trucks)
    assert low_cost.accept == {}
    assert low_cost.reasons["L1"] == (
        "Held: every free dry van that can reach Dallas in time would drive too far empty for what it pays"
    )


def test_balanced_covers_a_slightly_losing_load_but_not_a_far_one():
    near_cheap = [make_load("cheap", revenue=500.0)]
    assert decide("balanced", near_cheap, [TruckView("T1", "Dallas, TX", "D")]).accept == {"cheap": "T1"}
    far_cheap = [make_load("cheap", revenue=500.0)]
    assert decide("balanced", far_cheap, [TruckView("T1", "Memphis, TN", "D")]).accept == {}


@pytest.mark.parametrize("objective_key", sorted(OBJECTIVES))
def test_every_objective_gives_each_truck_at_most_one_load(objective_key):
    loads = [make_load("L1"), make_load("L2", pickup_hour=21), make_load("L3", pickup_hour=22)]
    trucks = [TruckView("T1", "Dallas, TX", "D"), TruckView("T2", "Dallas, TX", "D")]
    decision = decide(objective_key, loads, trucks)
    assert len(set(decision.accept.values())) == len(decision.accept) <= 2


def test_the_catalog_builds_greedy_or_the_optimizer_and_rejects_unknown_names():
    assert build_policy("greedy", "service").__name__ == "greedy_nearest_truck"
    assert callable(build_policy("milp", "balanced"))
    with pytest.raises(ValueError):
        build_policy("milp", "happiness")
    with pytest.raises(ValueError):
        build_policy("quantum", "profit")
