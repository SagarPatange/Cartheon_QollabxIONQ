"""Tests for freight_sim/scenario.py: turning the Kaggle tables into simulator loads and trucks."""

import random

import pytest

from freight_sim.lead_time import LeadTimeHump, LeadTimeMixture
from freight_sim.scenario import build_loads, build_out_of_service, build_trucks, start_city_for_terminal

ROUTES = {
    "R1": {"origin_city": "Dallas", "origin_state": "TX", "destination_city": "Memphis", "destination_state": "TN"}
}
LOAD_ROWS = [
    {"load_id": "L1", "route_id": "R1", "load_date": "2022-03-01", "load_type": "Refrigerated", "revenue": "1500.5"},
    {"load_id": "L2", "route_id": "R1", "load_date": "2022-03-03", "load_type": "Dry Van", "revenue": "900"},
    {"load_id": "L3", "route_id": "R1", "load_date": "2022-02-28", "load_type": "Dry Van", "revenue": "800"},
]
SCHEDULED = {
    "L1": ("2022-03-01 10:00:00.000000", "2022-03-02 02:00:00.000000"),
    "L2": ("2022-03-03 08:00:00.000000", "2022-03-03 20:00:00.000000"),
    "L3": ("2022-02-28 08:00:00.000000", "2022-02-28 20:00:00.000000"),
}
# One hump with an exact 5-hour lead time would need sigma 0; a narrow hump keeps the test simple.
FIXED_LEAD = LeadTimeMixture([LeadTimeHump(share=1.0, median_hours=5, p10_hours=4.999, p90_hours=5.001)])


def test_loads_in_the_date_range_get_minutes_from_the_first_midnight():
    loads = build_loads(LOAD_ROWS, SCHEDULED, ROUTES, "2022-03-01", "2022-03-02", FIXED_LEAD, random.Random(1))
    assert [load.load_id for load in loads] == ["L1"]
    load = loads[0]
    assert load.origin == "Dallas, TX"
    assert load.destination == "Memphis, TN"
    assert load.equipment == "R"
    assert load.revenue == 1500.5
    assert load.pickup_minute == 10 * 60
    assert load.delivery_minute == 26 * 60
    assert abs(load.tender_minute - 5 * 60) < 0.5


def test_loads_are_sorted_by_tender_time():
    loads = build_loads(LOAD_ROWS, SCHEDULED, ROUTES, "2022-03-01", "2022-03-03", FIXED_LEAD, random.Random(1))
    tenders = [load.tender_minute for load in loads]
    assert tenders == sorted(tenders)


def test_terminals_in_lane_cities_start_there_and_others_start_at_the_nearest_lane_city():
    lane_cities = ["Kansas City, MO", "Dallas, TX"]
    assert start_city_for_terminal("Dallas", lane_cities) == "Dallas, TX"
    assert start_city_for_terminal("Omaha", lane_cities) == "Kansas City, MO"
    with pytest.raises(ValueError, match="Boise"):
        start_city_for_terminal("Boise", lane_cities)


def test_only_active_trucks_are_used_and_each_gets_a_trailer_type():
    truck_rows = [
        {"truck_id": "T1", "status": "Active", "home_terminal": "Dallas"},
        {"truck_id": "T2", "status": "Maintenance", "home_terminal": "Dallas"},
        {"truck_id": "T3", "status": "Active", "home_terminal": "Omaha"},
    ]
    trucks = build_trucks(truck_rows, ["Kansas City, MO", "Dallas, TX"], reefer_share=0.5, rng=random.Random(3))
    assert [truck.truck_id for truck in trucks] == ["T1", "T3"]
    assert trucks[1].city == "Kansas City, MO"
    assert {truck.equipment for truck in trucks} <= {"R", "D"}


def test_trucks_in_maintenance_or_inactive_are_listed_as_out_of_service_at_their_start_city():
    truck_rows = [
        {"truck_id": "T1", "status": "Active", "home_terminal": "Dallas"},
        {"truck_id": "T2", "status": "Maintenance", "home_terminal": "Omaha"},
        {"truck_id": "T3", "status": "Inactive", "home_terminal": "Dallas"},
    ]
    out_of_service = build_out_of_service(truck_rows, ["Kansas City, MO", "Dallas, TX"])
    assert out_of_service == [
        {"id": "T2", "city": "Kansas City, MO", "status": "Maintenance"},
        {"id": "T3", "city": "Dallas, TX", "status": "Inactive"},
    ]
