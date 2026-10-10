"""Build the small JSON files the US dispatch map reads.

Run from the project folder:
    python tools/build_dispatch_map_data.py path/to/2023_Gaz_place_national.txt

Reads data/kaggle_logistics/ (loads, routes, delivery events) and the US Census Bureau 2023 Gazetteer of places
(public domain; https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) for city
coordinates, because the Kaggle facilities table has no coordinates for 4 of the 20 lane cities.

Writes data/dispatch_map/cities.json, lanes.json and loads_YYYY.json (one per year).
"""

import csv
import gzip
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

KAGGLE_FOLDER = Path("data/kaggle_logistics")
OUTPUT_FOLDER = Path("data/dispatch_map")

EQUIPMENT_CODES = {"Refrigerated": "R", "Dry Van": "D"}
BOOKING_CODES = {"Spot": "S", "Contract": "C", "Dedicated": "D"}
YEAR_FILE_COLUMNS = ["day", "lane", "pickup_min", "transit_min", "equipment", "booking", "revenue"]


def find_city_point(gazetteer_rows: list[dict], city: str, state: str) -> tuple[float, float]:
    """The Census internal point (latitude, longitude) of a city. Consolidated cities such as Indianapolis are
    listed as 'Indianapolis city (balance)'."""
    accepted_names = {f"{city} city", f"{city} city (balance)"}
    for row in gazetteer_rows:
        if row["USPS"] == state and row["NAME"] in accepted_names:
            return float(row["INTPTLAT"]), float(row["INTPTLONG"])
    raise ValueError(f"no Census place named {city}, {state}")


def city_label(city: str, state: str) -> str:
    return f"{city}, {state}"


def build_cities(routes: list[dict], loads: list[dict], points: dict) -> list[dict]:
    """Every lane city with its coordinates and how many loads it sends and receives over the whole dataset."""
    route_by_id = {route["route_id"]: route for route in routes}
    outbound = Counter()
    inbound = Counter()
    for load in loads:
        route = route_by_id[load["route_id"]]
        outbound[(route["origin_city"], route["origin_state"])] += 1
        inbound[(route["destination_city"], route["destination_state"])] += 1
    cities = []
    for (city, state), (latitude, longitude) in sorted(points.items()):
        cities.append({
            "name": city,
            "state": state,
            "lat": latitude,
            "lon": longitude,
            "outbound": outbound[(city, state)],
            "inbound": inbound[(city, state)],
        })
    return cities


def build_lanes(routes: list[dict], loads: list[dict]) -> list[dict]:
    """Every lane, in routes.csv order, with its rate, transit time and total loads."""
    loads_per_route = Counter(load["route_id"] for load in loads)
    lanes = []
    for route in routes:
        lanes.append({
            "id": route["route_id"],
            "origin": city_label(route["origin_city"], route["origin_state"]),
            "destination": city_label(route["destination_city"], route["destination_state"]),
            "miles": int(route["typical_distance_miles"]),
            "rate_per_mile": float(route["base_rate_per_mile"]),
            "transit_days": int(route["typical_transit_days"]),
            "loads": loads_per_route[route["route_id"]],
        })
    return lanes


def minutes_after_midnight(timestamp: str) -> int:
    """'2022-01-01 06:30:00.000000' → 390."""
    hours = int(timestamp[11:13])
    minutes = int(timestamp[14:16])
    return hours * 60 + minutes


def minutes_between(start_timestamp: str, end_timestamp: str) -> int:
    """Whole minutes from one timestamp to a later one (seconds are dropped)."""
    start_day = date.fromisoformat(start_timestamp[:10])
    end_day = date.fromisoformat(end_timestamp[:10])
    day_difference = (end_day - start_day).days
    return day_difference * 24 * 60 + minutes_after_midnight(end_timestamp) - minutes_after_midnight(start_timestamp)


def build_year_files(loads: list[dict], scheduled_times: dict, lane_ids: list[str]) -> dict[int, dict]:
    """One compact table per year: [day of year from 0, lane index, scheduled pickup minute, scheduled transit
    minutes, equipment code, booking code, revenue in whole dollars]. scheduled_times maps a load ID to its
    (scheduled pickup, scheduled delivery) timestamps."""
    lane_index_by_id = {lane_id: index for index, lane_id in enumerate(lane_ids)}
    year_files: dict[int, dict] = {}
    for load in loads:
        load_day = date.fromisoformat(load["load_date"])
        pickup_timestamp, delivery_timestamp = scheduled_times[load["load_id"]]
        row = [
            load_day.timetuple().tm_yday - 1,
            lane_index_by_id[load["route_id"]],
            minutes_after_midnight(pickup_timestamp),
            minutes_between(pickup_timestamp, delivery_timestamp),
            EQUIPMENT_CODES[load["load_type"]],
            BOOKING_CODES[load["booking_type"]],
            round(float(load["revenue"])),
        ]
        if load_day.year not in year_files:
            year_files[load_day.year] = {"year": load_day.year, "columns": YEAR_FILE_COLUMNS, "rows": []}
        year_files[load_day.year]["rows"].append(row)
    return year_files


def read_csv_rows(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", newline="") as csv_file:
        return list(csv.DictReader(csv_file, delimiter="\t" if path.suffix == ".txt" else ","))


def read_scheduled_times(events: list[dict]) -> dict[str, tuple[str, str]]:
    """Load ID → (scheduled pickup, scheduled delivery)."""
    pickups = {}
    deliveries = {}
    for event in events:
        if event["event_type"] == "Pickup":
            pickups[event["load_id"]] = event["scheduled_datetime"]
        else:
            deliveries[event["load_id"]] = event["scheduled_datetime"]
    return {load_id: (pickups[load_id], deliveries[load_id]) for load_id in pickups}


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, separators=(",", ":")))


def main(gazetteer_path: Path) -> None:
    routes = read_csv_rows(KAGGLE_FOLDER / "routes.csv")
    loads = read_csv_rows(KAGGLE_FOLDER / "loads.csv.gz")
    scheduled_times = read_scheduled_times(read_csv_rows(KAGGLE_FOLDER / "delivery_events.csv.gz"))
    gazetteer_rows = []
    for row in read_csv_rows(gazetteer_path):
        # The Census file pads its last column with spaces.
        gazetteer_rows.append({key.strip(): value.strip() for key, value in row.items()})

    lane_cities = set()
    for route in routes:
        lane_cities.add((route["origin_city"], route["origin_state"]))
        lane_cities.add((route["destination_city"], route["destination_state"]))
    points = {}
    for city, state in lane_cities:
        points[(city, state)] = find_city_point(gazetteer_rows, city, state)

    lanes = build_lanes(routes, loads)
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    write_json(OUTPUT_FOLDER / "cities.json", build_cities(routes, loads, points))
    write_json(OUTPUT_FOLDER / "lanes.json", lanes)
    lane_ids = [lane["id"] for lane in lanes]
    for year, year_file in build_year_files(loads, scheduled_times, lane_ids).items():
        write_json(OUTPUT_FOLDER / f"loads_{year}.json", year_file)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python tools/build_dispatch_map_data.py path/to/2023_Gaz_place_national.txt")
    main(Path(sys.argv[1]))
