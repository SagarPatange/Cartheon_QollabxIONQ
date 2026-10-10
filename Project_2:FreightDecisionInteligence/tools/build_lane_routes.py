"""Fetch the real road path of every lane from OSRM and save it, simplified, for the dispatch map.

Run from the project folder, after tools/build_dispatch_map_data.py:
    python tools/build_lane_routes.py

Reads data/dispatch_map/lanes.json and cities.json. Writes data/osm_routes/lane_routes.json.

Paths come from the public OSRM demo server (https://router.project-osrm.org), which routes on OpenStreetMap data.
Its usage policy allows light use at no more than one request per second, so the script waits between requests.
The saved paths are OpenStreetMap data (ODbL): see data/osm_routes/NOTICE.md.
"""

import json
import time
import urllib.request
from pathlib import Path

MAP_FOLDER = Path("data/dispatch_map")
OUTPUT_PATH = Path("data/osm_routes/lane_routes.json")
OSRM_URL = "https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
OSRM_OPTIONS = "?overview=full&geometries=geojson"
USER_AGENT = "FreightDecisionIntelligence/0.1 (Qollab x IonQ hackathon project)"
SECONDS_BETWEEN_REQUESTS = 1.1  # the demo server asks for at most one request per second

METERS_PER_MILE = 1609.344
SECONDS_PER_HOUR = 3600
# About 1 km at US latitudes: invisible at the zoom levels a national map uses, and keeps the file small.
SIMPLIFY_TOLERANCE_DEGREES = 0.01


def find_city_pairs(lanes: list[dict]) -> list[tuple[str, str]]:
    """Each pair of lane cities once, alphabetically, whichever direction its lanes run. Roads are assumed to be
    the same both ways at national scale."""
    pairs = set()
    for lane in lanes:
        first_city, second_city = sorted([lane["origin"], lane["destination"]])
        pairs.add((first_city, second_city))
    return sorted(pairs)


def parse_osrm_route(response: dict) -> dict:
    """Miles, hours and [lat, lon] points of the first route in an OSRM response."""
    if response.get("code") != "Ok":
        raise ValueError(f"OSRM error {response.get('code')}: {response.get('message', '')}")
    route = response["routes"][0]
    points = []
    for longitude, latitude in route["geometry"]["coordinates"]:
        points.append([latitude, longitude])
    miles = route["distance"] / METERS_PER_MILE
    hours = route["duration"] / SECONDS_PER_HOUR
    return {"miles": miles, "hours": hours, "points": points}


def distance_to_segment(point: list[float], start: list[float], end: list[float]) -> float:
    """Distance (in coordinate units) from a point to the straight segment start-end."""
    delta_x = end[0] - start[0]
    delta_y = end[1] - start[1]
    length_squared = delta_x * delta_x + delta_y * delta_y
    if length_squared == 0:
        return ((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2) ** 0.5
    fraction = ((point[0] - start[0]) * delta_x + (point[1] - start[1]) * delta_y) / length_squared
    fraction = max(0.0, min(1.0, fraction))
    nearest_x = start[0] + fraction * delta_x
    nearest_y = start[1] + fraction * delta_y
    return ((point[0] - nearest_x) ** 2 + (point[1] - nearest_y) ** 2) ** 0.5


def simplify_path(path: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas–Peucker: keep the end points, and recursively keep the point farthest from the straight line between
    them while it is farther than the tolerance."""
    if len(path) < 3:
        return list(path)
    farthest_index = 0
    farthest_distance = 0.0
    for index in range(1, len(path) - 1):
        distance = distance_to_segment(path[index], path[0], path[-1])
        if distance > farthest_distance:
            farthest_index = index
            farthest_distance = distance
    if farthest_distance <= tolerance:
        return [path[0], path[-1]]
    first_half = simplify_path(path[: farthest_index + 1], tolerance)
    second_half = simplify_path(path[farthest_index:], tolerance)
    return first_half[:-1] + second_half


def fetch_osrm_route(start: dict, end: dict) -> dict:
    """Ask the OSRM demo server for the driving route between two cities."""
    url = OSRM_URL.format(start_lon=start["lon"], start_lat=start["lat"], end_lon=end["lon"], end_lat=end["lat"])
    request = urllib.request.Request(url + OSRM_OPTIONS, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return parse_osrm_route(json.load(response))


def main() -> None:
    lanes = json.loads((MAP_FOLDER / "lanes.json").read_text())
    cities = json.loads((MAP_FOLDER / "cities.json").read_text())
    city_by_label = {f"{city['name']}, {city['state']}": city for city in cities}
    routes = []
    for first_label, second_label in find_city_pairs(lanes):
        route = fetch_osrm_route(city_by_label[first_label], city_by_label[second_label])
        routes.append({
            "cities": [first_label, second_label],
            "road_miles": round(route["miles"], 1),
            "drive_hours": round(route["hours"], 2),
            "points": simplify_path(route["points"], SIMPLIFY_TOLERANCE_DEGREES),
        })
        print(f"{first_label} – {second_label}: {route['miles']:.0f} mi, {len(routes[-1]['points'])} points")
        time.sleep(SECONDS_BETWEEN_REQUESTS)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(routes, separators=(",", ":")))


if __name__ == "__main__":
    main()
