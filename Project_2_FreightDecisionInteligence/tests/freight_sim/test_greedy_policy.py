"""Tests for freight_sim/policies/greedy.py: nearest free truck with the right trailer, else hold or decline."""

from freight_sim.network import RoadNetwork
from freight_sim.policies.greedy import greedy_nearest_truck
from freight_sim.scenario import Load
from freight_sim.state import DecisionState, TruckView

CITIES = ["Dallas, TX", "Memphis, TN", "Houston, TX"]
MILES = [[0, 450, 250], [450, 0, 690], [250, 690, 0]]
NETWORK = RoadNetwork(CITIES, MILES, average_mph=50)
HOUR = 60


def make_load(load_id, equipment="D", pickup_hour=20, origin="Dallas, TX"):
    return Load(load_id, origin, "Memphis, TN", equipment, 2000.0, pickup_hour * HOUR, (pickup_hour + 13) * HOUR, 0)


def make_state(loads, trucks, minute=9 * HOUR):
    return DecisionState(minute=minute, open_loads=loads, free_trucks=trucks, network=NETWORK)


def test_the_truck_with_the_fewest_empty_miles_takes_the_load():
    trucks = [TruckView("far", "Memphis, TN", "D"), TruckView("near", "Houston, TX", "D")]
    decision = greedy_nearest_truck(make_state([make_load("L1")], trucks))
    assert decision.accept == {"L1": "near"}


def test_a_truck_with_the_wrong_trailer_is_not_used():
    trucks = [TruckView("reefer", "Dallas, TX", "R"), TruckView("dry", "Memphis, TN", "D")]
    decision = greedy_nearest_truck(make_state([make_load("L1")], trucks))
    assert decision.accept == {"L1": "dry"}


def test_each_truck_takes_at_most_one_load_and_earlier_pickups_go_first():
    loads = [make_load("later", pickup_hour=30), make_load("sooner", pickup_hour=20)]
    decision = greedy_nearest_truck(make_state(loads, [TruckView("T1", "Dallas, TX", "D")]))
    assert decision.accept == {"sooner": "T1"}


def test_a_load_no_free_truck_can_reach_in_time_is_held():
    # Memphis → Dallas is 9 h; pickup at 12:00 with a 2 h grace cannot be met from 9:00.
    trucks = [TruckView("T1", "Memphis, TN", "D")]
    decision = greedy_nearest_truck(make_state([make_load("L1", pickup_hour=12)], trucks))
    assert decision.accept == {}
    assert decision.decline == set()


def test_a_load_whose_pickup_is_already_more_than_two_hours_late_is_declined():
    decision = greedy_nearest_truck(make_state([make_load("L1", pickup_hour=6)], [TruckView("T1", "Dallas, TX", "D")]))
    assert decision.decline == {"L1"}


def test_every_decision_comes_with_a_reason_a_dispatcher_can_read():
    loads = [make_load("taken", pickup_hour=20), make_load("held", pickup_hour=11, origin="Houston, TX"),
             make_load("late", pickup_hour=6)]
    trucks = [TruckView("T1", "Dallas, TX", "D")]
    decision = greedy_nearest_truck(make_state(loads, trucks))
    assert decision.reasons["taken"] == "Accepted: T1 is the nearest free dry van (in Dallas, 0 empty mi)"
    assert decision.reasons["late"] == "Declined: pickup was 3.0 h ago, past the 2 h grace"
    assert decision.reasons["held"] == "Held: no free dry van can reach Houston in time"


def test_greedy_records_the_nearest_trucks_it_weighed_and_picks_the_first():
    from freight_sim.network import RoadNetwork
    from freight_sim.policies.greedy import greedy_nearest_truck
    from freight_sim.scenario import Load
    from freight_sim.state import DecisionState, TruckView

    network = RoadNetwork(["Dallas, TX", "Memphis, TN", "Houston, TX"],
                          [[0, 450, 250], [450, 0, 690], [250, 690, 0]], average_mph=50)
    load = Load("L1", "Dallas, TX", "Memphis, TN", "D", 2000.0, 20 * 60, 33 * 60, 0)
    trucks = [TruckView("far", "Memphis, TN", "D"), TruckView("near", "Houston, TX", "D"),
              TruckView("here", "Dallas, TX", "D")]
    state = DecisionState(minute=9 * 60, open_loads=[load], free_trucks=trucks, network=network)
    details = greedy_nearest_truck(state).details["L1"]
    assert details["reachable"] == 3
    assert [option["truck_id"] for option in details["options"]] == ["here", "near", "far"]
    assert [option["chosen"] for option in details["options"]] == [True, False, False]
