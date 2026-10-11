"""Tests for freight_sim/network.py: road miles between cities and truck time including rest breaks."""

import pytest

from freight_sim.network import RoadNetwork, drive_and_rest_hours

CITIES = ["Dallas, TX", "Memphis, TN"]
MILES = [[0.0, 452.0], [452.0, 0.0]]


def test_a_short_drive_needs_no_rest():
    assert drive_and_rest_hours(5) == 5


def test_exactly_eleven_hours_of_driving_needs_no_rest():
    assert drive_and_rest_hours(11) == 11


def test_every_started_block_after_eleven_hours_adds_a_ten_hour_rest():
    assert drive_and_rest_hours(12) == 22
    assert drive_and_rest_hours(22) == 32
    assert drive_and_rest_hours(23) == 43


def test_no_driving_takes_no_time():
    assert drive_and_rest_hours(0) == 0


def test_the_network_gives_road_miles_between_two_cities():
    network = RoadNetwork(CITIES, MILES, average_mph=50)
    assert network.miles("Dallas, TX", "Memphis, TN") == 452.0
    assert network.miles("Dallas, TX", "Dallas, TX") == 0.0


def test_truck_hours_are_miles_at_the_average_speed_plus_rests():
    network = RoadNetwork(CITIES, MILES, average_mph=50)
    assert network.truck_hours("Dallas, TX", "Memphis, TN") == 452 / 50


def test_an_unknown_city_fails_fast():
    network = RoadNetwork(CITIES, MILES, average_mph=50)
    with pytest.raises(KeyError, match="Omaha"):
        network.miles("Omaha, NE", "Dallas, TX")
