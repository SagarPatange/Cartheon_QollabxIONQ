"""Tests for freight_sim/replay.py: one simulated week packed for the page."""

import json

import pytest

from freight_sim.network import RoadNetwork
from freight_sim.replay import build_replay, parse_simulation_request
from freight_sim.scenario import Load, Scenario, TruckStart
from freight_sim.simulator import Settings, simulate
from freight_sim.state import Decision

CITIES = ["Dallas, TX", "Memphis, TN"]
NETWORK = RoadNetwork(CITIES, [[0, 450], [450, 0]], average_mph=50)
HOUR = 60


def accept_first(state):
    if not state.open_loads or not state.free_trucks:
        return Decision(accept={}, decline=set())
    return Decision(accept={state.open_loads[0].load_id: state.free_trucks[0].truck_id}, decline=set(),
                    reasons={state.open_loads[0].load_id: "Accepted: first free truck"})


def make_replay():
    load = Load("L1", "Dallas, TX", "Memphis, TN", "D", 2000.0, 12 * HOUR, 25 * HOUR, 8 * HOUR)
    out_of_service = [{"id": "T9", "city": "Memphis, TN", "status": "Maintenance"}]
    scenario = Scenario(loads=[load], trucks=[TruckStart("T1", "Dallas, TX", "D")], network=NETWORK,
                        out_of_service=out_of_service)
    settings = Settings(end_minute=7 * 24 * HOUR)
    result = simulate(scenario, accept_first, settings)
    return build_replay(scenario, result, settings, start_date="2022-03-07", policy_name="greedy", seed=1)


def test_the_replay_has_everything_the_page_draws_and_is_plain_json():
    replay = make_replay()
    assert replay["start_date"] == "2022-03-07"
    assert replay["days"] == 7
    assert replay["policy"] == "greedy"
    assert replay["trucks"] == [{"id": "T1", "start_city": "Dallas, TX", "equipment": "D"}]
    assert replay["out_of_service"] == [{"id": "T9", "city": "Memphis, TN", "status": "Maintenance"}]
    assert {"summary", "daily", "events", "trips", "settings"} <= set(replay)
    json.dumps(replay)


def test_a_trip_in_the_replay_has_every_moment_the_map_needs_to_place_the_truck():
    trip = make_replay()["trips"][0]
    assert trip == {
        "load_id": "L1", "truck_id": "T1", "from_city": "Dallas, TX", "origin": "Dallas, TX",
        "destination": "Memphis, TN", "equipment": "D", "decided": 540, "pickup_arrival": 540,
        "loading_start": 720, "depart_loaded": 840, "delivery_arrival": 1380, "free": 1500,
        "empty_miles": 0, "loaded_miles": 450, "revenue": 2000.0, "late": False,
    }


def test_a_simulation_request_reads_week_policy_and_seed():
    assert parse_simulation_request("start=2022-03-07&policy=greedy&seed=3") == ("2022-03-07", "greedy", 3)


def test_a_simulation_request_defaults_to_the_greedy_policy_and_seed_one():
    assert parse_simulation_request("start=2022-03-07") == ("2022-03-07", "greedy", 1)


BAD_QUERIES = ["", "start=March", "start=2021-12-30", "start=2024-12-30", "start=2022-03-07&policy=x"]


@pytest.mark.parametrize("query", BAD_QUERIES)
def test_a_bad_simulation_request_fails_fast(query):
    with pytest.raises(ValueError):
        parse_simulation_request(query)
