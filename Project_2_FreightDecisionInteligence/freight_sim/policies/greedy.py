"""Greedy nearest-truck policy (a PFA in Powell's terms: a direct rule, no optimisation).

Loads are taken in order of pickup appointment. Each goes to the free truck with the right trailer and the fewest
empty miles that can reach the pickup within the grace period. A load no free truck can reach in time is held; a
load whose pickup is already beyond the grace period is declined. Every choice comes with a one-line reason.
"""

from freight_sim.clock import MINUTES_PER_HOUR
from freight_sim.state import Decision, DecisionState

PICKUP_GRACE_MINUTES = 2 * MINUTES_PER_HOUR
EQUIPMENT_NAMES = {"R": "reefer", "D": "dry van"}
# How many of a load's options the decision details keep (the chosen one is always among them).
OPTIONS_SHOWN = 3


def greedy_nearest_truck(state: DecisionState) -> Decision:
    accept = {}
    decline = set()
    reasons = {}
    details = {}
    used_truck_ids = set()
    loads_by_pickup = sorted(state.open_loads, key=lambda load: (load.pickup_minute, load.load_id))
    for load in loads_by_pickup:
        equipment_name = EQUIPMENT_NAMES[load.equipment]
        latest_pickup_minute = load.pickup_minute + PICKUP_GRACE_MINUTES
        decline_reason = past_grace_reason(state, load)
        if decline_reason is not None:
            decline.add(load.load_id)
            reasons[load.load_id] = decline_reason
            continue
        reachable = list_reachable_trucks(state, load, latest_pickup_minute, used_truck_ids)
        details[load.load_id] = describe_options(reachable)
        if not reachable:
            reasons[load.load_id] = f"Held: no free {equipment_name} can reach {load.origin.split(',')[0]} in time"
            continue
        truck, empty_miles = reachable[0]
        accept[load.load_id] = truck.truck_id
        used_truck_ids.add(truck.truck_id)
        reasons[load.load_id] = (
            f"Accepted: {truck.truck_id} is the nearest free {equipment_name} "
            f"(in {truck.city.split(',')[0]}, {empty_miles:,.0f} empty mi)"
        )
    return Decision(accept=accept, decline=decline, reasons=reasons, details=details)


def describe_options(reachable: list) -> dict:
    """The decision details for one load: how many trucks could reach it, and the nearest few (the first is
    chosen). Trucks already given to an earlier load this epoch are not among them."""
    options = []
    for rank, (truck, empty_miles) in enumerate(reachable[:OPTIONS_SHOWN]):
        options.append({"truck_id": truck.truck_id, "city": truck.city, "empty_miles": empty_miles,
                        "chosen": rank == 0})
    return {"reachable": len(reachable), "options": options}


def past_grace_reason(state: DecisionState, load) -> str | None:
    """The reason to decline a load whose pickup is already more than the grace period ago, or None."""
    if state.minute <= load.pickup_minute + PICKUP_GRACE_MINUTES:
        return None
    hours_ago = (state.minute - load.pickup_minute) / MINUTES_PER_HOUR
    return f"Declined: pickup was {hours_ago:.1f} h ago, past the 2 h grace"


def list_reachable_trucks(state: DecisionState, load, latest_pickup_minute: float, used_truck_ids: set) -> list:
    """(truck, empty miles) for every free truck with the right trailer that arrives in time, nearest first (ties
    keep the order of state.free_trucks, so the nearest is the same truck as before)."""
    reachable = []
    for truck in state.free_trucks:
        is_available = truck.truck_id not in used_truck_ids and truck.equipment == load.equipment
        if not is_available:
            continue
        arrival_minute = state.minute + state.network.truck_hours(truck.city, load.origin) * MINUTES_PER_HOUR
        if arrival_minute <= latest_pickup_minute:
            reachable.append((truck, state.network.miles(truck.city, load.origin)))
    reachable.sort(key=lambda option: option[1])
    return reachable
