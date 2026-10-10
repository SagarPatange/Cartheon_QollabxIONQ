"""The simulated world before anything happens: the loads that will be tendered, the trucks, and the roads.

Loads, appointments and the fleet come from data/kaggle_logistics/ (MIT). Tender times are not in the data; each
load gets one from the lead-time mixture (freight_sim/lead_time.py), drawn with a seeded random generator.
"""

import csv
import gzip
import random
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from freight_sim.clock import MINUTES_PER_DAY, MINUTES_PER_HOUR
from freight_sim.lead_time import DEFAULT_LEAD_TIME, LeadTimeMixture
from freight_sim.network import RoadNetwork, load_road_network

KAGGLE_FOLDER = Path("data/kaggle_logistics")
EQUIPMENT_CODES = {"Refrigerated": "R", "Dry Van": "D"}
# Share of reefer trailers among the active trailers in trailers.csv (86 reefer : 94 dry van).
REEFER_SHARE = 86 / 180

# Home terminals that are not lane cities, and the nearest lane city by straight-line distance (checked once,
# 2026-10-10, with Census coordinates).
NEAREST_LANE_CITY = {
    "Omaha": "Kansas City",
    "Salt Lake City": "Las Vegas",
    "Nashville": "Memphis",
    "Milwaukee": "Chicago",
    "Oklahoma City": "Dallas",
}


@dataclass(frozen=True)
class Load:
    """One full truckload. Times are minutes since midnight of the first simulated day."""

    load_id: str
    origin: str
    destination: str
    equipment: str  # "R" reefer, "D" dry van
    revenue: float
    pickup_minute: float
    delivery_minute: float
    tender_minute: float


@dataclass(frozen=True)
class TruckStart:
    """A truck at the start of the simulation."""

    truck_id: str
    city: str
    equipment: str


@dataclass(frozen=True)
class Scenario:
    loads: list[Load]
    trucks: list[TruckStart]
    network: RoadNetwork
    # Trucks in maintenance or inactive: never dispatched, shown on the map at their start city.
    out_of_service: list[dict] = field(default_factory=list)


def minutes_since(start_day: date, timestamp: str) -> float:
    """Minutes from midnight of start_day to a 'YYYY-MM-DD HH:MM:SS…' timestamp."""
    moment = datetime.fromisoformat(timestamp[:19])
    day_offset = (moment.date() - start_day).days
    return day_offset * MINUTES_PER_DAY + moment.hour * MINUTES_PER_HOUR + moment.minute + moment.second / 60


def city_label(city: str, state: str) -> str:
    return f"{city}, {state}"


def build_loads(
    load_rows: list[dict],
    scheduled_times: dict[str, tuple[str, str]],
    routes: dict[str, dict],
    start_date: str,
    end_date: str,
    lead_time: LeadTimeMixture,
    rng: random.Random,
) -> list[Load]:
    """Loads dated start_date to end_date (both included), each with a drawn tender time, sorted by tender time."""
    first_day = date.fromisoformat(start_date)
    last_day = date.fromisoformat(end_date)
    loads = []
    for row in load_rows:
        load_day = date.fromisoformat(row["load_date"])
        if not first_day <= load_day <= last_day:
            continue
        route = routes[row["route_id"]]
        pickup_timestamp, delivery_timestamp = scheduled_times[row["load_id"]]
        pickup_minute = minutes_since(first_day, pickup_timestamp)
        lead_minutes = lead_time.sample_hours(rng) * MINUTES_PER_HOUR
        loads.append(Load(
            load_id=row["load_id"],
            origin=city_label(route["origin_city"], route["origin_state"]),
            destination=city_label(route["destination_city"], route["destination_state"]),
            equipment=EQUIPMENT_CODES[row["load_type"]],
            revenue=float(row["revenue"]),
            pickup_minute=pickup_minute,
            delivery_minute=minutes_since(first_day, delivery_timestamp),
            tender_minute=pickup_minute - lead_minutes,
        ))
    loads.sort(key=lambda load: load.tender_minute)
    return loads


def start_city_for_terminal(terminal: str, lane_cities: list[str]) -> str:
    """The lane city a truck based at `terminal` starts in: the terminal itself, or the nearest lane city."""
    city_by_name = {label.split(",")[0]: label for label in lane_cities}
    if terminal in city_by_name:
        return city_by_name[terminal]
    nearest_name = NEAREST_LANE_CITY.get(terminal)
    if nearest_name is None or nearest_name not in city_by_name:
        raise ValueError(f"no lane city known for home terminal {terminal}")
    return city_by_name[nearest_name]


def build_trucks(truck_rows: list[dict], lane_cities: list[str], reefer_share: float, rng: random.Random) -> list:
    """Active trucks at their start cities, each pulling a reefer (with probability reefer_share) or a dry van."""
    trucks = []
    for row in truck_rows:
        if row["status"] != "Active":
            continue
        equipment = "R" if rng.random() < reefer_share else "D"
        start_city = start_city_for_terminal(row["home_terminal"], lane_cities)
        trucks.append(TruckStart(row["truck_id"], start_city, equipment))
    return trucks


def build_out_of_service(truck_rows: list[dict], lane_cities: list[str]) -> list[dict]:
    """Trucks that are not Active (in maintenance or inactive), with the lane city they sit in."""
    out_of_service = []
    for row in truck_rows:
        if row["status"] == "Active":
            continue
        city = start_city_for_terminal(row["home_terminal"], lane_cities)
        out_of_service.append({"id": row["truck_id"], "city": city, "status": row["status"]})
    return out_of_service


def read_csv_rows(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def read_scheduled_times(event_rows: list[dict]) -> dict[str, tuple[str, str]]:
    """Load ID → (scheduled pickup, scheduled delivery)."""
    pickups = {}
    deliveries = {}
    for row in event_rows:
        if row["event_type"] == "Pickup":
            pickups[row["load_id"]] = row["scheduled_datetime"]
        else:
            deliveries[row["load_id"]] = row["scheduled_datetime"]
    return {load_id: (pickups[load_id], deliveries[load_id]) for load_id in pickups}


def load_scenario(start_date: str, end_date: str, seed: int, lead_time: LeadTimeMixture = DEFAULT_LEAD_TIME):
    """The scenario for a date range from the project's data files. The same seed gives the same tenders and
    trailer types."""
    rng = random.Random(seed)
    network = load_road_network()
    routes = {row["route_id"]: row for row in read_csv_rows(KAGGLE_FOLDER / "routes.csv")}
    scheduled_times = read_scheduled_times(read_csv_rows(KAGGLE_FOLDER / "delivery_events.csv.gz"))
    load_rows = read_csv_rows(KAGGLE_FOLDER / "loads.csv.gz")
    loads = build_loads(load_rows, scheduled_times, routes, start_date, end_date, lead_time, rng)
    lane_cities = list(network.index_of_city)
    truck_rows = read_csv_rows(KAGGLE_FOLDER / "trucks.csv")
    trucks = build_trucks(truck_rows, lane_cities, REEFER_SHARE, rng)
    out_of_service = build_out_of_service(truck_rows, lane_cities)
    return Scenario(loads=loads, trucks=trucks, network=network, out_of_service=out_of_service)
