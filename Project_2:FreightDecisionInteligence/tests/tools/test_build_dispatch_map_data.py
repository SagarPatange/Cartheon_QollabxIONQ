"""Tests for tools/build_dispatch_map_data.py: the files the US dispatch map reads."""

import pytest
from build_dispatch_map_data import (
    build_cities,
    build_lanes,
    build_year_files,
    find_city_point,
    minutes_after_midnight,
)

GAZETTEER_ROWS = [
    {"USPS": "TN", "NAME": "Memphis city", "INTPTLAT": "35.10", "INTPTLONG": "-89.97"},
    {"USPS": "MI", "NAME": "Memphis city", "INTPTLAT": "42.89", "INTPTLONG": "-82.77"},
    {"USPS": "IN", "NAME": "Indianapolis city (balance)", "INTPTLAT": "39.77", "INTPTLONG": "-86.14"},
]

ROUTES = [
    {"route_id": "R1", "origin_city": "Memphis", "origin_state": "TN", "destination_city": "Indianapolis",
     "destination_state": "IN", "typical_distance_miles": "464", "base_rate_per_mile": "2.1",
     "fuel_surcharge_rate": "0.2", "typical_transit_days": "1"},
    {"route_id": "R2", "origin_city": "Indianapolis", "origin_state": "IN", "destination_city": "Memphis",
     "destination_state": "TN", "typical_distance_miles": "464", "base_rate_per_mile": "1.9",
     "fuel_surcharge_rate": "0.2", "typical_transit_days": "1"},
]

LOADS = [
    {"load_id": "L1", "route_id": "R1", "load_date": "2022-01-01", "load_type": "Refrigerated", "weight_lbs": "20000",
     "revenue": "1000.4", "booking_type": "Spot"},
    {"load_id": "L2", "route_id": "R1", "load_date": "2022-01-02", "load_type": "Dry Van", "weight_lbs": "30000",
     "revenue": "1500.6", "booking_type": "Contract"},
    {"load_id": "L3", "route_id": "R2", "load_date": "2023-03-05", "load_type": "Dry Van", "weight_lbs": "25000",
     "revenue": "900", "booking_type": "Dedicated"},
]

PICKUP_TIMES = {
    "L1": ("2022-01-01 06:30:00.000000", "2022-01-02 01:30:00.000000"),
    "L2": ("2022-01-02 18:00:00.000000", "2022-01-03 08:00:00.000000"),
    "L3": ("2023-03-05 12:15:00.000000", "2023-03-06 00:15:00.000000"),
}


def test_a_city_is_matched_by_name_and_state():
    assert find_city_point(GAZETTEER_ROWS, "Memphis", "TN") == (35.10, -89.97)


def test_a_consolidated_city_listed_as_balance_is_found():
    assert find_city_point(GAZETTEER_ROWS, "Indianapolis", "IN") == (39.77, -86.14)


def test_an_unknown_city_fails_fast():
    with pytest.raises(ValueError, match="Atlantis"):
        find_city_point(GAZETTEER_ROWS, "Atlantis", "GA")


def test_cities_count_loads_sent_and_received():
    points = {("Memphis", "TN"): (35.10, -89.97), ("Indianapolis", "IN"): (39.77, -86.14)}
    cities = build_cities(ROUTES, LOADS, points)
    memphis = next(city for city in cities if city["name"] == "Memphis")
    assert memphis == {"name": "Memphis", "state": "TN", "lat": 35.10, "lon": -89.97, "outbound": 2, "inbound": 1}


def test_lanes_keep_rates_and_count_their_loads():
    lanes = build_lanes(ROUTES, LOADS)
    assert lanes[0] == {
        "id": "R1", "origin": "Memphis, TN", "destination": "Indianapolis, IN", "miles": 464,
        "rate_per_mile": 2.1, "transit_days": 1, "loads": 2,
    }


def test_minutes_after_midnight_reads_the_clock_part_of_a_timestamp():
    assert minutes_after_midnight("2022-01-01 06:30:00.000000") == 390


def test_year_files_hold_one_compact_row_per_load_with_day_of_year():
    year_files = build_year_files(LOADS, PICKUP_TIMES, ["R1", "R2"])
    assert sorted(year_files) == [2022, 2023]
    year_2022 = year_files[2022]
    assert year_2022["columns"] == ["day", "lane", "pickup_min", "transit_min", "equipment", "booking", "revenue"]
    assert year_2022["rows"] == [[0, 0, 390, 1140, "R", "S", 1000], [1, 0, 1080, 840, "D", "C", 1501]]
    assert year_files[2023]["rows"][0][0] == 63
