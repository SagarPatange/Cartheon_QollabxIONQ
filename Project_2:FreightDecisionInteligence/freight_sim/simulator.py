"""The discrete-event simulator: Powell's transition function Sₜ₊₁ = Sᴹ(Sₜ, xₜ, Wₜ₊₁).

Three kinds of event drive the clock, in time order: a load is tendered (Wₜ₊₁), dispatchers decide (the policy is
called), a truck becomes free at its delivery city. Travel has no randomness yet, so when a load is accepted its
whole trip (empty drive, wait, loading, loaded drive with rests, unloading) is computed at once and the truck's
"free" event is scheduled.

Besides the totals, a run records an event log (what happened, when, and the dispatcher's reason for each
decision) and money and miles per day.
"""

import heapq
import time
from dataclasses import dataclass, field

from freight_sim.clock import MINUTES_PER_DAY, MINUTES_PER_HOUR, next_decision_minute
from freight_sim.scenario import Load, Scenario
from freight_sim.state import Decision, DecisionState, TruckView

TENDER = "tender"
DECIDE = "decide"
TRUCK_FREE = "truck_free"
# At the same minute: tenders first (so a load tendered at 10:00 is seen at the 10:00 decision), then trucks
# becoming free, then the decision.
EVENT_ORDER = {TENDER: 0, TRUCK_FREE: 1, DECIDE: 2}


@dataclass(frozen=True)
class Settings:
    """Everything about a run that is not data. Times in minutes, money in dollars."""

    end_minute: float
    cost_per_mile: float = 1.50
    late_pickup_penalty: float = 250.0
    pickup_grace_minutes: float = 2 * MINUTES_PER_HOUR
    load_minutes: float = 2 * MINUTES_PER_HOUR
    unload_minutes: float = 2 * MINUTES_PER_HOUR
    expire_after_minutes: float = MINUTES_PER_DAY
    first_decision_hour: int = 9
    last_decision_hour: int = 17


@dataclass(frozen=True)
class Trip:
    """One accepted load, from the decision to the truck being free again."""

    load_id: str
    truck_id: str
    decided_minute: float
    from_city: str
    origin: str
    destination: str
    empty_miles: float
    loaded_miles: float
    pickup_arrival_minute: float
    loading_start_minute: float
    depart_loaded_minute: float
    delivery_arrival_minute: float
    free_minute: float
    is_late_pickup: bool
    revenue: float


@dataclass
class Result:
    trips: list[Trip] = field(default_factory=list)
    declined_load_ids: list[str] = field(default_factory=list)
    expired_load_ids: list[str] = field(default_factory=list)
    decision_seconds: list[float] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    daily: list[dict] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


@dataclass
class TruckStatus:
    truck_id: str
    city: str
    equipment: str
    is_free: bool = True


def simulate(scenario: Scenario, policy, settings: Settings) -> Result:
    """Run the policy on the scenario until settings.end_minute and return trips, events, daily and total metrics."""
    trucks = {truck.truck_id: TruckStatus(truck.truck_id, truck.city, truck.equipment) for truck in scenario.trucks}
    open_loads: dict[str, Load] = {}
    last_hold_reason: dict[str, str] = {}
    result = Result()
    queue = []
    sequence = 0
    for load in scenario.loads:
        queue.append((load.tender_minute, EVENT_ORDER[TENDER], sequence, TENDER, load))
        sequence += 1
    first_decision = next_decision_minute(0, settings.first_decision_hour, settings.last_decision_hour)
    queue.append((first_decision, EVENT_ORDER[DECIDE], sequence, DECIDE, None))
    heapq.heapify(queue)

    while queue:
        minute, _, _, kind, payload = heapq.heappop(queue)
        if minute > settings.end_minute:
            break
        if kind == TENDER:
            open_loads[payload.load_id] = payload
            result.events.append(tender_event(payload))
        elif kind == TRUCK_FREE:
            trucks[payload].is_free = True
        else:
            new_trips = decide(minute, open_loads, trucks, last_hold_reason, scenario, policy, settings, result)
            for trip in new_trips:
                sequence += 1
                heapq.heappush(queue, (trip.free_minute, EVENT_ORDER[TRUCK_FREE], sequence, TRUCK_FREE, trip.truck_id))
            next_minute = next_decision_minute(minute + 1, settings.first_decision_hour, settings.last_decision_hour)
            sequence += 1
            heapq.heappush(queue, (next_minute, EVENT_ORDER[DECIDE], sequence, DECIDE, None))

    # Python's sort is stable, so events at the same minute keep the order they happened in.
    result.events.sort(key=lambda event: event["minute"])
    result.daily = summarize_by_day(result, settings)
    result.summary = summarize(scenario, result, settings)
    return result


def decide(minute, open_loads, trucks, last_hold_reason, scenario, policy, settings, result) -> list[Trip]:
    """One decision epoch: expire stale loads, ask the policy, check and apply its decision. Returns new trips."""
    expire_stale_loads(minute, open_loads, settings, result)
    visible_loads = sorted(open_loads.values(), key=lambda load: (load.pickup_minute, load.load_id))
    free_trucks = [TruckView(t.truck_id, t.city, t.equipment) for t in trucks.values() if t.is_free]
    state = DecisionState(minute=minute, open_loads=visible_loads, free_trucks=free_trucks, network=scenario.network)
    started = time.perf_counter()
    decision = policy(state)
    result.decision_seconds.append(time.perf_counter() - started)
    check_decision(decision, open_loads, trucks)

    for load_id in sorted(decision.decline):
        load = open_loads.pop(load_id)
        result.declined_load_ids.append(load_id)
        result.events.append(decision_event(minute, "decline", load, None, decision.reasons.get(load_id, "Declined")))
    new_trips = []
    for load_id, truck_id in decision.accept.items():
        load = open_loads.pop(load_id)
        truck = trucks[truck_id]
        trip = plan_trip(load, truck, minute, scenario, settings)
        truck.is_free = False
        truck.city = load.destination
        result.trips.append(trip)
        new_trips.append(trip)
        reason = decision.reasons.get(load_id, "Accepted")
        result.events.append(decision_event(minute, "accept", load, truck_id, reason))
        result.events.extend(trip_events(trip))
    log_holds(minute, open_loads, decision, last_hold_reason, result)
    return new_trips


def expire_stale_loads(minute, open_loads, settings, result) -> None:
    for load_id, load in list(open_loads.items()):
        if minute >= load.pickup_minute + settings.expire_after_minutes:
            del open_loads[load_id]
            result.expired_load_ids.append(load_id)
            text = "Expired: not accepted within 24 h of its pickup appointment"
            result.events.append(decision_event(minute, "expire", load, None, text))


def log_holds(minute, open_loads, decision, last_hold_reason, result) -> None:
    """Log a held load the first time it is held, and again only when the reason changes."""
    for load_id, load in open_loads.items():
        reason = decision.reasons.get(load_id, "Held")
        if last_hold_reason.get(load_id) != reason:
            last_hold_reason[load_id] = reason
            result.events.append(decision_event(minute, "hold", load, None, reason))


def tender_event(load: Load) -> dict:
    equipment_name = "reefer" if load.equipment == "R" else "dry van"
    text = f"Tendered: {equipment_name} {load.origin} → {load.destination}, ${load.revenue:,.0f}"
    return {"minute": load.tender_minute, "kind": "tender", "load_id": load.load_id, "truck_id": None,
            "city": load.origin, "text": text}


def decision_event(minute, kind, load: Load, truck_id, text) -> dict:
    return {"minute": minute, "kind": kind, "load_id": load.load_id, "truck_id": truck_id, "city": load.origin,
            "text": text}


def trip_events(trip: Trip) -> list[dict]:
    """What the truck does after the decision, as timed events."""
    base = {"load_id": trip.load_id, "truck_id": trip.truck_id}
    late_note = " (late)" if trip.is_late_pickup else ""
    return [
        {**base, "minute": trip.decided_minute, "kind": "depart_empty", "city": trip.from_city,
         "text": f"{trip.truck_id} leaves {trip.from_city} empty for {trip.origin} ({trip.empty_miles:,.0f} mi)"},
        {**base, "minute": trip.pickup_arrival_minute, "kind": "arrive_pickup", "city": trip.origin,
         "is_late": trip.is_late_pickup, "text": f"{trip.truck_id} arrives at {trip.origin} for pickup{late_note}"},
        {**base, "minute": trip.depart_loaded_minute, "kind": "depart_loaded", "city": trip.origin,
         "text": f"{trip.truck_id} loaded, leaves {trip.origin} for {trip.destination}"},
        {**base, "minute": trip.delivery_arrival_minute, "kind": "deliver", "city": trip.destination,
         "text": f"{trip.truck_id} delivers at {trip.destination} (${trip.revenue:,.0f})"},
        {**base, "minute": trip.free_minute, "kind": "truck_free", "city": trip.destination,
         "text": f"{trip.truck_id} unloaded and free in {trip.destination}"},
    ]


def check_decision(decision: Decision, open_loads: dict, trucks: dict) -> None:
    """Fail fast on a decision the world does not allow."""
    used_trucks = set()
    for load_id, truck_id in decision.accept.items():
        if load_id not in open_loads:
            raise ValueError(f"load {load_id} is not open")
        if truck_id not in trucks or not trucks[truck_id].is_free:
            raise ValueError(f"truck {truck_id} is not free")
        if truck_id in used_trucks:
            raise ValueError(f"truck {truck_id} was given two loads")
        if trucks[truck_id].equipment != open_loads[load_id].equipment:
            raise ValueError(f"truck {truck_id} has the wrong trailer for load {load_id}")
        used_trucks.add(truck_id)
    for load_id in decision.decline:
        if load_id not in open_loads or load_id in decision.accept:
            raise ValueError(f"load {load_id} cannot be declined")


def plan_trip(load: Load, truck: TruckStatus, minute: float, scenario: Scenario, settings: Settings) -> Trip:
    """The whole trip for an accepted load, starting now from the truck's city."""
    network = scenario.network
    empty_minutes = network.truck_hours(truck.city, load.origin) * MINUTES_PER_HOUR
    pickup_arrival = minute + empty_minutes
    loading_start = max(pickup_arrival, load.pickup_minute)
    depart_loaded = loading_start + settings.load_minutes
    loaded_minutes = network.truck_hours(load.origin, load.destination) * MINUTES_PER_HOUR
    delivery_arrival = depart_loaded + loaded_minutes
    return Trip(
        load_id=load.load_id,
        truck_id=truck.truck_id,
        decided_minute=minute,
        from_city=truck.city,
        origin=load.origin,
        destination=load.destination,
        empty_miles=network.miles(truck.city, load.origin),
        loaded_miles=network.miles(load.origin, load.destination),
        pickup_arrival_minute=pickup_arrival,
        loading_start_minute=loading_start,
        depart_loaded_minute=depart_loaded,
        delivery_arrival_minute=delivery_arrival,
        free_minute=delivery_arrival + settings.unload_minutes,
        is_late_pickup=pickup_arrival > load.pickup_minute + settings.pickup_grace_minutes,
        revenue=load.revenue,
    )


def trip_money(trip: Trip, settings: Settings) -> tuple[float, float]:
    """(cost, late penalty) of one trip."""
    cost = settings.cost_per_mile * (trip.empty_miles + trip.loaded_miles)
    penalty = settings.late_pickup_penalty if trip.is_late_pickup else 0.0
    return cost, penalty


def summarize_by_day(result: Result, settings: Settings) -> list[dict]:
    """Money, miles and decisions per simulated day, each trip counted on the day it was accepted."""
    day_count = int(settings.end_minute // MINUTES_PER_DAY) + (1 if settings.end_minute % MINUTES_PER_DAY else 0)
    days = []
    for day in range(day_count):
        days.append({"day": day, "accepted": 0, "declined": 0, "revenue": 0.0, "cost": 0.0, "late_penalties": 0.0,
                     "profit": 0.0, "empty_miles": 0.0, "loaded_miles": 0.0})
    for trip in result.trips:
        day = days[int(trip.decided_minute // MINUTES_PER_DAY)]
        cost, penalty = trip_money(trip, settings)
        day["accepted"] += 1
        day["revenue"] += trip.revenue
        day["cost"] += cost
        day["late_penalties"] += penalty
        day["profit"] += trip.revenue - cost - penalty
        day["empty_miles"] += trip.empty_miles
        day["loaded_miles"] += trip.loaded_miles
    for event in result.events:
        if event["kind"] == "decline":
            days[int(event["minute"] // MINUTES_PER_DAY)]["declined"] += 1
    return days


def summarize(scenario: Scenario, result: Result, settings: Settings) -> dict:
    """The run's totals: volume, money, miles, service, fleet use and speed of decisions."""
    tendered_count = sum(1 for load in scenario.loads if load.tender_minute <= settings.end_minute)
    accepted_count = len(result.trips)
    decided_count = accepted_count + len(result.declined_load_ids) + len(result.expired_load_ids)
    revenue = sum(trip.revenue for trip in result.trips)
    empty_miles = sum(trip.empty_miles for trip in result.trips)
    loaded_miles = sum(trip.loaded_miles for trip in result.trips)
    late_count = sum(1 for trip in result.trips if trip.is_late_pickup)
    cost = settings.cost_per_mile * (empty_miles + loaded_miles)
    penalties = settings.late_pickup_penalty * late_count
    busy_minutes = []
    for trip in result.trips:
        busy_minutes.append(min(trip.free_minute, settings.end_minute) - trip.decided_minute)
    fleet_minutes = len(scenario.trucks) * settings.end_minute
    return {
        "loads_tendered": tendered_count,
        "loads_accepted": accepted_count,
        "loads_declined": len(result.declined_load_ids),
        "loads_expired": len(result.expired_load_ids),
        "acceptance_rate": accepted_count / decided_count if decided_count else 0.0,
        "revenue": revenue,
        "loaded_miles": loaded_miles,
        "empty_miles": empty_miles,
        "empty_mile_share": empty_miles / (empty_miles + loaded_miles) if accepted_count else 0.0,
        "late_pickups": late_count,
        "on_time_pickup_rate": 1 - late_count / accepted_count if accepted_count else 0.0,
        "cost": cost,
        "late_penalties": penalties,
        "profit": revenue - cost - penalties,
        "truck_utilisation": sum(busy_minutes) / fleet_minutes if fleet_minutes else 0.0,
        "decision_epochs": len(result.decision_seconds),
        "mean_decision_ms": 1000 * sum(result.decision_seconds) / max(1, len(result.decision_seconds)),
    }
