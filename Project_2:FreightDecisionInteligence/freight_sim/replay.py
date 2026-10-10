"""Run one week and pack the result as plain JSON for the dispatch page.

The page asks for a week with a query string such as `start=2022-03-07&policy=greedy&seed=1`. Locally,
tools/serve.py answers it; on Qollab, the page will call simulate_week through the Python bridge instead.
"""

from dataclasses import asdict
from datetime import date, timedelta
from urllib.parse import parse_qs

from freight_sim.clock import MINUTES_PER_DAY
from freight_sim.policies.catalog import POLICIES
from freight_sim.scenario import load_scenario
from freight_sim.simulator import Result, Settings, simulate

DAYS_PER_RUN = 7
FIRST_DATA_DAY = date(2022, 1, 1)
LAST_DATA_DAY = date(2024, 12, 31)
DEFAULT_POLICY = "greedy"
DEFAULT_SEED = 1


def parse_simulation_request(query_string: str) -> tuple[str, str, int]:
    """(start date, policy name, seed) from a query string; fails fast on anything the data cannot cover."""
    query = parse_qs(query_string)
    if "start" not in query:
        raise ValueError("a simulation request needs start=YYYY-MM-DD")
    start_text = query["start"][0]
    try:
        start_day = date.fromisoformat(start_text)
    except ValueError as error:
        raise ValueError(f"start must be a date YYYY-MM-DD, got {start_text!r}") from error
    last_day = start_day + timedelta(days=DAYS_PER_RUN - 1)
    if start_day < FIRST_DATA_DAY or last_day > LAST_DATA_DAY:
        raise ValueError(f"the week {start_day}–{last_day} is outside the data ({FIRST_DATA_DAY}–{LAST_DATA_DAY})")
    policy_name = query.get("policy", [DEFAULT_POLICY])[0]
    if policy_name not in POLICIES:
        raise ValueError(f"unknown policy {policy_name!r}; known: {sorted(POLICIES)}")
    seed = int(query.get("seed", [str(DEFAULT_SEED)])[0])
    return start_text, policy_name, seed


def simulate_week(start_date: str, policy_name: str, seed: int) -> dict:
    """Simulate DAYS_PER_RUN days from start_date with the named policy and return the replay."""
    last_day = date.fromisoformat(start_date) + timedelta(days=DAYS_PER_RUN - 1)
    scenario = load_scenario(start_date, last_day.isoformat(), seed)
    settings = Settings(end_minute=DAYS_PER_RUN * MINUTES_PER_DAY)
    result = simulate(scenario, POLICIES[policy_name], settings)
    return build_replay(scenario, result, settings, start_date, policy_name, seed)


def build_replay(scenario, result: Result, settings: Settings, start_date: str, policy_name: str, seed: int) -> dict:
    """Trucks, trips, events, daily and total metrics, with times in minutes since start_date's midnight."""
    equipment_by_load = {load.load_id: load.equipment for load in scenario.loads}
    trips = []
    for trip in result.trips:
        trips.append({
            "load_id": trip.load_id,
            "truck_id": trip.truck_id,
            "from_city": trip.from_city,
            "origin": trip.origin,
            "destination": trip.destination,
            "equipment": equipment_by_load[trip.load_id],
            "decided": trip.decided_minute,
            "pickup_arrival": trip.pickup_arrival_minute,
            "loading_start": trip.loading_start_minute,
            "depart_loaded": trip.depart_loaded_minute,
            "delivery_arrival": trip.delivery_arrival_minute,
            "free": trip.free_minute,
            "empty_miles": trip.empty_miles,
            "loaded_miles": trip.loaded_miles,
            "revenue": trip.revenue,
            "late": trip.is_late_pickup,
        })
    trucks = []
    for truck in scenario.trucks:
        trucks.append({"id": truck.truck_id, "start_city": truck.city, "equipment": truck.equipment})
    return {
        "start_date": start_date,
        "days": int(settings.end_minute // MINUTES_PER_DAY),
        "policy": policy_name,
        "seed": seed,
        "settings": asdict(settings),
        "trucks": trucks,
        "out_of_service": scenario.out_of_service,
        "trips": trips,
        "events": result.events,
        "daily": result.daily,
        "summary": result.summary,
    }
