"""Tests for freight_sim/policies/milp.py: the load–truck assignment with the most total profit, solved by SciPy."""

from freight_sim.network import RoadNetwork
from freight_sim.policies.greedy import greedy_nearest_truck
from freight_sim.policies.milp import milp_max_profit
from freight_sim.scenario import Load
from freight_sim.state import DecisionState, TruckView

CITIES = ["Dallas, TX", "Memphis, TN", "Houston, TX"]
MILES = [[0, 450, 250], [450, 0, 690], [250, 690, 0]]
NETWORK = RoadNetwork(CITIES, MILES, average_mph=50)
HOUR = 60


def make_load(load_id, equipment="D", pickup_hour=20, origin="Dallas, TX", revenue=2000.0):
    return Load(load_id, origin, "Memphis, TN", equipment, revenue, pickup_hour * HOUR, (pickup_hour + 13) * HOUR, 0)


def make_state(loads, trucks, minute=9 * HOUR):
    return DecisionState(minute=minute, open_loads=loads, free_trucks=trucks, network=NETWORK)


def test_the_optimizer_beats_greedy_when_the_nearest_truck_is_needed_elsewhere():
    # Greedy gives the Houston truck to the earlier Dallas load (250 empty mi) and then sends the Memphis truck
    # 690 mi to Houston: 940 empty mi. Swapping them costs only 450.
    loads = [make_load("dallas", pickup_hour=20), make_load("houston", pickup_hour=40, origin="Houston, TX")]
    trucks = [TruckView("A", "Houston, TX", "D"), TruckView("B", "Memphis, TN", "D")]
    assert greedy_nearest_truck(make_state(loads, trucks)).accept == {"dallas": "A", "houston": "B"}
    assert milp_max_profit(make_state(loads, trucks)).accept == {"dallas": "B", "houston": "A"}


def test_a_truck_with_the_wrong_trailer_is_not_used():
    trucks = [TruckView("reefer", "Dallas, TX", "R"), TruckView("dry", "Memphis, TN", "D")]
    decision = milp_max_profit(make_state([make_load("L1")], trucks))
    assert decision.accept == {"L1": "dry"}


def test_each_truck_takes_at_most_one_load():
    loads = [make_load("L1"), make_load("L2"), make_load("L3")]
    trucks = [TruckView("T1", "Dallas, TX", "D"), TruckView("T2", "Dallas, TX", "D")]
    decision = milp_max_profit(make_state(loads, trucks))
    assert len(decision.accept) == 2
    assert sorted(decision.accept.values()) == ["T1", "T2"]


def test_a_load_that_would_lose_money_is_held_not_accepted():
    # $100 for 450 empty + 450 loaded miles at $1.50/mi loses $1,250.
    decision = milp_max_profit(make_state([make_load("cheap", revenue=100.0)], [TruckView("T1", "Memphis, TN", "D")]))
    assert decision.accept == {}
    assert decision.decline == set()
    assert decision.reasons["cheap"] == "Held: every free dry van that can reach Dallas in time would lose money"


def test_a_load_whose_pickup_is_already_more_than_two_hours_late_is_declined():
    decision = milp_max_profit(make_state([make_load("L1", pickup_hour=6)], [TruckView("T1", "Dallas, TX", "D")]))
    assert decision.decline == {"L1"}
    assert decision.reasons["L1"] == "Declined: pickup was 3.0 h ago, past the 2 h grace"


def test_every_decision_comes_with_a_reason_a_dispatcher_can_read():
    loads = [make_load("taken"), make_load("unreachable", pickup_hour=11, origin="Houston, TX"),
             make_load("outbid", pickup_hour=25, revenue=1500.0)]
    decision = milp_max_profit(make_state(loads, [TruckView("T1", "Dallas, TX", "D")]))
    assert decision.accept == {"taken": "T1"}
    assert decision.reasons["taken"] == "Accepted: optimizer assigned T1 (in Dallas, 0 empty mi, $1,325 margin)"
    assert decision.reasons["unreachable"] == "Held: no free dry van can reach Houston in time"
    assert decision.reasons["outbid"] == "Held: the optimizer gave every truck that can reach Dallas to a better load"


def test_no_open_loads_or_no_free_trucks_is_fine():
    assert milp_max_profit(make_state([], [TruckView("T1", "Dallas, TX", "D")])).accept == {}
    assert milp_max_profit(make_state([make_load("L1")], [])).accept == {}


def test_each_load_records_the_options_the_optimizer_weighed():
    # Greedy-style trap from the first test: the optimizer gives the Houston truck to the Houston load, so for the
    # Dallas load that truck is an option it did not take, and the details say where it went instead.
    loads = [make_load("dallas", pickup_hour=20), make_load("houston", pickup_hour=40, origin="Houston, TX")]
    trucks = [TruckView("A", "Houston, TX", "D"), TruckView("B", "Memphis, TN", "D")]
    details = milp_max_profit(make_state(loads, trucks)).details
    assert details["dallas"]["reachable"] == 2
    dallas_options = {option["truck_id"]: option for option in details["dallas"]["options"]}
    assert dallas_options["B"]["chosen"] is True
    assert dallas_options["A"]["chosen"] is False
    assert dallas_options["A"]["taken_by"] == "houston"
    assert dallas_options["A"]["score"] > dallas_options["B"]["score"]


def test_a_held_load_records_that_no_truck_could_reach_it():
    loads = [make_load("far", pickup_hour=11, origin="Houston, TX")]
    details = milp_max_profit(make_state(loads, [TruckView("T1", "Memphis, TN", "D")])).details
    assert details["far"] == {"reachable": 0, "options": []}
