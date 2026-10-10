"""Tests for tools/build_lane_routes.py: real road paths for each lane, from OSRM, simplified."""

from build_lane_routes import find_city_pairs, parse_osrm_route, simplify_path


def test_city_pairs_are_counted_once_whichever_direction_the_lane_runs():
    lanes = [
        {"origin": "Memphis, TN", "destination": "Indianapolis, IN"},
        {"origin": "Indianapolis, IN", "destination": "Memphis, TN"},
        {"origin": "Memphis, TN", "destination": "Dallas, TX"},
    ]
    assert find_city_pairs(lanes) == [("Dallas, TX", "Memphis, TN"), ("Indianapolis, IN", "Memphis, TN")]


def test_parse_osrm_route_returns_miles_hours_and_lat_lon_points():
    response = {
        "code": "Ok",
        "routes": [{
            "distance": 160934.4,
            "duration": 7200,
            "geometry": {"type": "LineString", "coordinates": [[-89.9, 35.1], [-86.1, 39.7]]},
        }],
    }
    route = parse_osrm_route(response)
    assert round(route["miles"], 3) == 100.0
    assert route["hours"] == 2.0
    assert route["points"] == [[35.1, -89.9], [39.7, -86.1]]


def test_parse_osrm_route_fails_fast_on_an_error_response():
    try:
        parse_osrm_route({"code": "NoRoute", "message": "Impossible route"})
    except ValueError as error:
        assert "NoRoute" in str(error)
    else:
        raise AssertionError("expected a ValueError")


def test_simplify_path_drops_points_that_lie_almost_on_a_straight_line():
    path = [[0.0, 0.0], [0.5, 0.001], [1.0, 0.0], [1.0, 1.0]]
    assert simplify_path(path, tolerance=0.01) == [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]


def test_simplify_path_keeps_a_corner_bigger_than_the_tolerance():
    path = [[0.0, 0.0], [0.5, 0.5], [1.0, 0.0]]
    assert simplify_path(path, tolerance=0.01) == path
