"""Greedy nearest-truck policy (a PFA in Powell's terms: a direct rule, no optimisation).

Loads are taken in order of pickup appointment. Each goes to the free truck with the right trailer and the fewest
empty miles that can reach the pickup within the grace period. A load no free truck can reach in time is held; a
load whose pickup is already beyond the grace period is declined. Every choice comes with a one-line reason.
"""

from freight_sim.clock import MINUTES_PER_HOUR
from freight_sim.state import Decision, DecisionState

PICKUP_GRACE_MINUTES = 2 * MINUTES_PER_HOUR
EQUIPMENT_NAMES = {"R": "reefer", "D": "dry van"}


def greedy_nearest_truck(state: DecisionState) -> Decision:
    accept = {}
    decline = set()
    reasons = {}
    used_truck_ids = set()
    loads_by_pickup = sorted(state.open_loads, key=lambda load: (load.pickup_minute, load.load_id))
    for load in loads_by_pickup:
        equipment_name = EQUIPMENT_NAMES[load.equipment]
        latest_pickup_minute = load.pickup_minute + PICKUP_GRACE_MINUTES
        if state.minute > latest_pickup_minute:
            hours_ago = (state.minute - load.pickup_minute) / MINUTES_PER_HOUR
            decline.add(load.load_id)
            reasons[load.load_id] = f"Declined: pickup was {hours_ago:.1f} h ago, past the 2 h grace"
            continue
        best_truck = find_nearest_truck(state, load, latest_pickup_minute, used_truck_ids)
        if best_truck is None:
            reasons[load.load_id] = f"Held: no free {equipment_name} can reach {load.origin.split(',')[0]} in time"
            continue
        truck, empty_miles = best_truck
        accept[load.load_id] = truck.truck_id
        used_truck_ids.add(truck.truck_id)
        reasons[load.load_id] = (
            f"Accepted: {truck.truck_id} is the nearest free {equipment_name} "
            f"(in {truck.city.split(',')[0]}, {empty_miles:,.0f} empty mi)"
        )
    return Decision(accept=accept, decline=decline, reasons=reasons)


def find_nearest_truck(state: DecisionState, load, latest_pickup_minute: float, used_truck_ids: set):
    """(truck, empty miles) for the free truck with the right trailer and fewest empty miles that arrives in time,
    or None."""
    best_truck = None
    fewest_empty_miles = float("inf")
    for truck in state.free_trucks:
        is_available = truck.truck_id not in used_truck_ids and truck.equipment == load.equipment
        if not is_available:
            continue
        arrival_minute = state.minute + state.network.truck_hours(truck.city, load.origin) * MINUTES_PER_HOUR
        empty_miles = state.network.miles(truck.city, load.origin)
        if arrival_minute <= latest_pickup_minute and empty_miles < fewest_empty_miles:
            best_truck = truck
            fewest_empty_miles = empty_miles
    if best_truck is None:
        return None
    return best_truck, fewest_empty_miles
