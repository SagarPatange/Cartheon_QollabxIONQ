"""Assignment policy (a CFA in Powell's terms: a deterministic optimisation of this epoch's decision).

At each decision epoch, every open load and every free truck form one assignment problem, solved as a mixed-integer
linear program with SciPy's HiGHS solver:

    maximise    Σ score[l, t] · x[l, t]
    subject to  Σ_t x[l, t] ≤ 1   for every load l   (a load gets at most one truck)
                Σ_l x[l, t] ≤ 1   for every truck t  (a truck takes at most one load)
                x[l, t] ∈ {0, 1}

A pair (l, t) exists only when the trailer matches, the truck reaches the pickup within the grace period, and the
chosen objective (objectives.py) gives it a score. With the default objective the score is the margin (revenue
minus fuel, driver and truck cost for empty plus loaded miles), and only money-making pairs exist. Unlike greedy,
the solver weighs every load against every other, so the nearest truck can go to the load where it is worth most.
It is myopic: it does not hold trucks back for loads that have not been tendered yet.
"""

from dataclasses import dataclass

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp

from freight_sim.clock import MINUTES_PER_HOUR
from freight_sim.policies.greedy import EQUIPMENT_NAMES, OPTIONS_SHOWN, PICKUP_GRACE_MINUTES, past_grace_reason
from freight_sim.policies.objectives import OBJECTIVES, Objective, PairFacts
from freight_sim.scenario import Load
from freight_sim.simulator import Settings
from freight_sim.state import Decision, DecisionState, TruckView

COST_PER_MILE = Settings.cost_per_mile
# HiGHS returns binary variables as floats such as 0.9999999; anything above one half was chosen.
CHOSEN_THRESHOLD = 0.5


@dataclass(frozen=True)
class CandidatePair:
    """A load and a free truck that could haul it on time and that the objective gives a score."""

    load_index: int
    truck_index: int
    empty_miles: float
    margin: float
    score: float


def make_milp_policy(objective_key: str):
    """The assignment policy that maximises the named objective (a key of OBJECTIVES)."""
    if objective_key not in OBJECTIVES:
        raise ValueError(f"unknown objective {objective_key!r}; known: {sorted(OBJECTIVES)}")
    objective = OBJECTIVES[objective_key]

    def milp_policy(state: DecisionState) -> Decision:
        return assign_by_objective(state, objective)

    return milp_policy


def milp_max_profit(state: DecisionState) -> Decision:
    """The assignment policy with the default objective: the most total profit."""
    return assign_by_objective(state, OBJECTIVES["profit"])


def assign_by_objective(state: DecisionState, objective: Objective) -> Decision:
    """Decline loads already past the grace period, then give the rest the assignment of free trucks with the
    highest total score under the objective.

    Returns the decision with a reason for every open load: accepted, declined or held."""
    decline = set()
    reasons = {}
    loads_to_assign = []
    for load in state.open_loads:
        decline_reason = past_grace_reason(state, load)
        if decline_reason is None:
            loads_to_assign.append(load)
        else:
            decline.add(load.load_id)
            reasons[load.load_id] = decline_reason

    candidates, reachable_counts = find_candidate_pairs(state, loads_to_assign, objective)
    chosen_pairs = solve_assignment(candidates, len(loads_to_assign), len(state.free_trucks))
    accept = {}
    for pair in chosen_pairs:
        load = loads_to_assign[pair.load_index]
        truck = state.free_trucks[pair.truck_index]
        accept[load.load_id] = truck.truck_id
        reasons[load.load_id] = accept_reason(truck, pair)

    reachable_load_ids = {loads_to_assign[index].load_id for index, count in reachable_counts.items() if count}
    reasons.update(hold_reasons(loads_to_assign, accept, candidates, reachable_load_ids, objective))
    details = describe_options(state, loads_to_assign, candidates, chosen_pairs, reachable_counts)
    return Decision(accept=accept, decline=decline, reasons=reasons, details=details)


def describe_options(state: DecisionState, loads: list[Load], candidates: list[CandidatePair],
                     chosen_pairs: list[CandidatePair], reachable_counts: dict[int, int]) -> dict[str, dict]:
    """The decision details for each load: how many trucks could reach it, and its best-scoring few options. The
    chosen option is always shown; any other option whose truck went to a different load says which one."""
    chosen_load_by_truck = {}
    for pair in chosen_pairs:
        chosen_load_by_truck[pair.truck_index] = pair.load_index
    candidates_by_load: dict[int, list[CandidatePair]] = {}
    for pair in candidates:
        candidates_by_load.setdefault(pair.load_index, []).append(pair)

    details = {}
    for load_index, load in enumerate(loads):
        ranked = sorted(candidates_by_load.get(load_index, []), key=lambda pair: -pair.score)
        shown = ranked[:OPTIONS_SHOWN]
        chosen = [pair for pair in ranked if chosen_load_by_truck.get(pair.truck_index) == load_index]
        if chosen and chosen[0] not in shown:
            shown = shown[:OPTIONS_SHOWN - 1] + chosen
        options = []
        for pair in shown:
            truck = state.free_trucks[pair.truck_index]
            taken_by_index = chosen_load_by_truck.get(pair.truck_index)
            option = {"truck_id": truck.truck_id, "city": truck.city, "empty_miles": pair.empty_miles,
                      "margin": pair.margin, "score": pair.score, "chosen": taken_by_index == load_index}
            if taken_by_index is not None and taken_by_index != load_index:
                option["taken_by"] = loads[taken_by_index].load_id
            options.append(option)
        details[load.load_id] = {"reachable": reachable_counts.get(load_index, 0), "options": options}
    return details


def accept_reason(truck: TruckView, pair: CandidatePair) -> str:
    """The timeline sentence for a load the optimizer assigned to this truck."""
    city = truck.city.split(",")[0]
    return (
        f"Accepted: optimizer assigned {truck.truck_id} (in {city}, "
        f"{pair.empty_miles:,.0f} empty mi, {format_dollars(pair.margin)} margin)"
    )


def format_dollars(dollars: float) -> str:
    """1325.4 → "$1,325"; −500 → "−$500"."""
    whole_dollars = f"${abs(dollars):,.0f}"
    if dollars < 0:
        return f"−{whole_dollars}"
    return whole_dollars


def hold_reasons(loads: list[Load], accept: dict[str, str], candidates: list[CandidatePair],
                 reachable_load_ids: set[str], objective: Objective) -> dict[str, str]:
    """Why each load the optimizer did not accept is held: no truck in reach, only trucks the objective refuses in
    reach (for profit: they would lose money), or every truck in reach went to a better load."""
    load_indices_with_candidate = set()
    for pair in candidates:
        load_indices_with_candidate.add(pair.load_index)
    reasons = {}
    for load_index, load in enumerate(loads):
        if load.load_id in accept:
            continue
        equipment_name = EQUIPMENT_NAMES[load.equipment]
        city = load.origin.split(",")[0]
        if load.load_id not in reachable_load_ids:
            reasons[load.load_id] = f"Held: no free {equipment_name} can reach {city} in time"
        elif load_index not in load_indices_with_candidate:
            reasons[load.load_id] = (
                f"Held: every free {equipment_name} that can reach {city} in time {objective.refusal}"
            )
        else:
            reasons[load.load_id] = f"Held: the optimizer gave every truck that can reach {city} to a better load"
    return reasons


def find_candidate_pairs(state: DecisionState, loads: list[Load],
                         objective: Objective) -> tuple[list[CandidatePair], dict[int, int]]:
    """Every load–truck pair that can be on time and that the objective scores, and for each load (by index) how
    many free trucks can reach it in time (scored or not)."""
    candidates = []
    reachable_counts = {}
    network = state.network
    for load_index, load in enumerate(loads):
        latest_pickup_minute = load.pickup_minute + PICKUP_GRACE_MINUTES
        loaded_miles = network.miles(load.origin, load.destination)
        for truck_index, truck in enumerate(state.free_trucks):
            if truck.equipment != load.equipment:
                continue
            arrival_minute = state.minute + network.truck_hours(truck.city, load.origin) * MINUTES_PER_HOUR
            is_too_late = arrival_minute > latest_pickup_minute
            if is_too_late:
                continue
            reachable_counts[load_index] = reachable_counts.get(load_index, 0) + 1
            empty_miles = network.miles(truck.city, load.origin)
            loading_start_minute = max(arrival_minute, load.pickup_minute)
            loaded_hours = network.truck_hours(load.origin, load.destination)
            facts = PairFacts(
                revenue=load.revenue,
                margin=load.revenue - COST_PER_MILE * (empty_miles + loaded_miles),
                empty_miles=empty_miles,
                empty_mile_cost=COST_PER_MILE * empty_miles,
                minutes_after_appointment=arrival_minute - load.pickup_minute,
                busy_hours=(loading_start_minute - state.minute) / MINUTES_PER_HOUR + loaded_hours,
            )
            score = objective.score(facts)
            if score is not None:
                candidates.append(CandidatePair(load_index, truck_index, empty_miles, facts.margin, score))
    return candidates, reachable_counts


def solve_assignment(candidates: list[CandidatePair], load_count: int, truck_count: int) -> list[CandidatePair]:
    """The candidate pairs the highest-scoring assignment picks, at most one per load and one per truck."""
    if not candidates:
        return []
    # One row per load, then one per truck; a pair's column has a 1 in its load's row and its truck's row. Dense is
    # fine at this size (tens of loads by about a hundred trucks), and SciPy's sparse indices don't suit HiGHS.
    one_per_row = np.zeros((load_count + truck_count, len(candidates)))
    for column, pair in enumerate(candidates):
        one_per_row[pair.load_index, column] = 1
        one_per_row[load_count + pair.truck_index, column] = 1
    scores = np.array([pair.score for pair in candidates])
    solution = milp(
        c=-scores,
        constraints=LinearConstraint(one_per_row, 0, 1),
        integrality=np.ones(len(candidates)),
        bounds=Bounds(0, 1),
    )
    if not solution.success:
        raise RuntimeError(f"assignment MILP failed: {solution.message}")
    chosen_pairs = []
    for pair, value in zip(candidates, solution.x, strict=True):
        if value > CHOSEN_THRESHOLD:
            chosen_pairs.append(pair)
    return chosen_pairs
