"""Tests for freight_sim/simulator.py: the event engine (Powell's transition function) on tiny scenarios.

Network: Dallas – Memphis 450 road miles, Dallas – Houston 250. At 50 mph: 9 h and 5 h, no rest needed.
Load and unload take 2 h each. Decisions every hour 9:00–17:00.
"""

import pytest

from freight_sim.network import RoadNetwork
from freight_sim.scenario import Load, Scenario, TruckStart
from freight_sim.simulator import Settings, simulate
from freight_sim.state import Decision

CITIES = ["Dallas, TX", "Memphis, TN", "Houston, TX"]
MILES = [[0, 450, 250], [450, 0, 690], [250, 690, 0]]
NETWORK = RoadNetwork(CITIES, MILES, average_mph=50)
HOUR = 60


def make_load(load_id, origin="Dallas, TX", destination="Memphis, TN", equipment="D", pickup_hour=12, tender_hour=8):
    return Load(
        load_id=load_id,
        origin=origin,
        destination=destination,
        equipment=equipment,
        revenue=2000.0,
        pickup_minute=pickup_hour * HOUR,
        delivery_minute=(pickup_hour + 13) * HOUR,
        tender_minute=tender_hour * HOUR,
    )


def accept_all_with(truck_id):
    """A policy that accepts every open load with one named truck (if that truck is free)."""

    def policy(state):
        free_ids = {truck.truck_id for truck in state.free_trucks}
        if truck_id not in free_ids or not state.open_loads:
            return Decision(accept={}, decline=set())
        return Decision(accept={state.open_loads[0].load_id: truck_id}, decline=set())

    return policy


def test_an_accepted_load_runs_empty_to_pickup_waits_for_the_appointment_and_delivers():
    scenario = Scenario(
        loads=[make_load("L1", pickup_hour=11)], trucks=[TruckStart("T1", "Houston, TX", "D")], network=NETWORK
    )
    result = simulate(scenario, accept_all_with("T1"), Settings(end_minute=3 * 24 * HOUR))
    trip = result.trips[0]
    # Decided at 9:00; 5 h empty from Houston → at Dallas 14:00: 3 h after the 11:00 appointment, beyond the 2 h grace.
    assert trip.decided_minute == 9 * HOUR
    assert trip.pickup_arrival_minute == 14 * HOUR
    assert trip.is_late_pickup
    # Load 14:00–16:00, drive 9 h → arrive 01:00 next day, unload until 03:00.
    assert trip.delivery_arrival_minute == 25 * HOUR
    assert trip.free_minute == 27 * HOUR
    assert trip.empty_miles == 250
    assert trip.loaded_miles == 450


def test_a_truck_that_arrives_early_waits_for_the_appointment():
    load = make_load("L1", pickup_hour=20)
    scenario = Scenario(loads=[load], trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK)
    trip = simulate(scenario, accept_all_with("T1"), Settings(end_minute=3 * 24 * HOUR)).trips[0]
    assert trip.pickup_arrival_minute == 9 * HOUR
    assert trip.loading_start_minute == 20 * HOUR
    assert not trip.is_late_pickup


def test_a_load_is_not_visible_before_its_tender_time():
    seen_load_ids = []

    def recording_policy(state):
        seen_load_ids.append((state.minute, [load.load_id for load in state.open_loads]))
        return Decision(accept={}, decline=set())

    load = make_load("L1", pickup_hour=40, tender_hour=10.5)
    scenario = Scenario(loads=[load], trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK)
    simulate(scenario, recording_policy, Settings(end_minute=12 * HOUR))
    assert seen_load_ids == [(9 * HOUR, []), (10 * HOUR, []), (11 * HOUR, ["L1"]), (12 * HOUR, ["L1"])]


def test_a_busy_truck_is_not_offered_until_it_is_free_again_at_its_destination():
    loads = [make_load("L1"), make_load("L2", origin="Memphis, TN", destination="Dallas, TX", pickup_hour=30)]
    scenario = Scenario(loads=loads, trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK)
    result = simulate(scenario, accept_all_with("T1"), Settings(end_minute=3 * 24 * HOUR))
    assert [trip.load_id for trip in result.trips] == ["L1", "L2"]
    # L1: depart Dallas 14:00, Memphis 23:00, free 01:00 day 2; next decision 09:00 day 2 (minute 33 h).
    assert result.trips[1].decided_minute == 33 * HOUR
    assert result.trips[1].empty_miles == 0


def test_declined_loads_and_loads_left_too_long_are_not_hauled():
    loads = [make_load("L1"), make_load("L2", pickup_hour=10)]

    def decline_l1_only(state):
        decline = {load.load_id for load in state.open_loads if load.load_id == "L1"}
        return Decision(accept={}, decline=decline)

    scenario = Scenario(loads=loads, trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK)
    result = simulate(scenario, decline_l1_only, Settings(end_minute=2 * 24 * HOUR))
    assert result.declined_load_ids == ["L1"]
    # L2 is never accepted; 24 h after its 10:00 pickup it expires at the next decision (day 2, 10:00).
    assert result.expired_load_ids == ["L2"]
    assert result.trips == []


def test_a_decision_that_breaks_the_rules_fails_fast():
    scenario = Scenario(
        loads=[make_load("L1", equipment="R")], trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK
    )
    with pytest.raises(ValueError, match="trailer"):
        simulate(scenario, accept_all_with("T1"), Settings(end_minute=24 * HOUR))


def test_the_summary_adds_up_money_miles_and_lateness():
    scenario = Scenario(
        loads=[make_load("L1", pickup_hour=11)], trucks=[TruckStart("T1", "Houston, TX", "D")], network=NETWORK
    )
    settings = Settings(end_minute=3 * 24 * HOUR, cost_per_mile=1.5, late_pickup_penalty=250)
    summary = simulate(scenario, accept_all_with("T1"), settings).summary
    assert summary["loads_tendered"] == 1
    assert summary["loads_accepted"] == 1
    assert summary["revenue"] == 2000.0
    assert summary["empty_miles"] == 250
    assert summary["loaded_miles"] == 450
    assert summary["late_pickups"] == 1
    assert summary["profit"] == 2000.0 - 1.5 * 700 - 250


def explaining_policy(state):
    """Accepts the first open load with the first free truck, and says so."""
    if not state.open_loads or not state.free_trucks:
        reasons = {load.load_id: "Held: waiting" for load in state.open_loads}
        return Decision(accept={}, decline=set(), reasons=reasons)
    load = state.open_loads[0]
    truck = state.free_trucks[0]
    reasons = {load.load_id: f"Accepted: {truck.truck_id} is free"}
    for other_load in state.open_loads[1:]:
        reasons[other_load.load_id] = "Held: waiting"
    return Decision(accept={load.load_id: truck.truck_id}, decline=set(), reasons=reasons)


def test_the_event_log_tells_the_story_of_a_load_in_time_order():
    scenario = Scenario(
        loads=[make_load("L1", pickup_hour=11)], trucks=[TruckStart("T1", "Houston, TX", "D")], network=NETWORK
    )
    events = simulate(scenario, explaining_policy, Settings(end_minute=3 * 24 * HOUR)).events
    kinds = [event["kind"] for event in events]
    assert kinds == ["tender", "accept", "depart_empty", "arrive_pickup", "depart_loaded", "deliver", "truck_free"]
    assert [event["minute"] for event in events] == sorted(event["minute"] for event in events)
    accept_event = events[1]
    assert accept_event["load_id"] == "L1"
    assert accept_event["truck_id"] == "T1"
    assert accept_event["text"] == "Accepted: T1 is free"
    assert events[3]["is_late"] is True


def test_a_held_load_is_logged_once_not_at_every_hour():
    loads = [make_load("L1", pickup_hour=30), make_load("L2", pickup_hour=40)]
    scenario = Scenario(loads=loads, trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK)
    events = simulate(scenario, explaining_policy, Settings(end_minute=20 * HOUR)).events
    hold_events = [event for event in events if event["kind"] == "hold"]
    assert [event["load_id"] for event in hold_events] == ["L2"]


def test_daily_metrics_count_money_by_the_day_the_load_was_accepted():
    loads = [make_load("L1", pickup_hour=11), make_load("L2", origin="Memphis, TN", destination="Dallas, TX",
                                                         pickup_hour=34)]
    scenario = Scenario(loads=loads, trucks=[TruckStart("T1", "Houston, TX", "D")], network=NETWORK)
    settings = Settings(end_minute=3 * 24 * HOUR, cost_per_mile=1.5, late_pickup_penalty=250)
    daily = simulate(scenario, accept_all_with("T1"), settings).daily
    assert [day["day"] for day in daily] == [0, 1, 2]
    assert daily[0]["accepted"] == 1
    assert daily[0]["revenue"] == 2000.0
    assert daily[0]["profit"] == 2000.0 - 1.5 * 700 - 250
    assert daily[1]["accepted"] == 1
    assert daily[2]["accepted"] == 0


def test_the_summary_reports_acceptance_rate_and_truck_utilisation():
    scenario = Scenario(loads=[make_load("L1", pickup_hour=9)], trucks=[TruckStart("T1", "Dallas, TX", "D")],
                        network=NETWORK)
    summary = simulate(scenario, accept_all_with("T1"), Settings(end_minute=2 * 24 * HOUR)).summary
    assert summary["acceptance_rate"] == 1.0
    # Busy 9:00 to 22:00 (load 2 h, drive 9 h, unload 2 h) = 13 h of 48 h.
    assert abs(summary["truck_utilisation"] - 13 / 48) < 1e-9
