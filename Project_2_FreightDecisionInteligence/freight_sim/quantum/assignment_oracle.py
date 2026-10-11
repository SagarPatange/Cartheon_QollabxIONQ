"""Classically prepare an exact cost table for a small, contested piece of one dispatch decision.

At a decision epoch the MILP policy (freight_sim/policies/milp.py) scores every load–truck pair that can be on time
and picks the best assignment. Here we take a contested cluster of that epoch: a few loads that compete for the same
trucks, at most MAX_PAIRS candidate pairs. Each pair is one bit (1 = assign this truck to this load). Every one of
the 2**n bitstrings is evaluated exactly:

    feasible    no truck and no load used twice; value = the objective's total score of the chosen pairs
    infeasible  a truck or a load used twice; it gets a penalty cost worse than every feasible choice

The table's best choice is checked against the MILP solver run on the same pairs. Preparing the table takes 2**n
classical evaluations, so it is not a scalable quantum oracle; it gives QAOA and the classical baselines one shared,
exactly known problem. Pure Python (no Qiskit), so the table can be built and tested anywhere.
"""

from dataclasses import dataclass

from freight_sim.policies.greedy import past_grace_reason
from freight_sim.policies.milp import CandidatePair, find_candidate_pairs, solve_assignment
from freight_sim.policies.objectives import Objective
from freight_sim.state import DecisionState

# At most this many pairs (qubits): 2**8 table rows, and 2 × 8 = 16 qubits for the joint uniform + QAOA circuit, well
# inside the 24-qubit limit of Qollab's free simulators.
MAX_PAIRS = 8
# Of each competing load, keep this many of its best trucks.
TRUCKS_PER_LOAD = 2
# At most this many loads compete in one cluster.
MAX_LOADS = 4
# Scores within this of the best are all optimal.
OPTIMUM_TOLERANCE = 1e-7


@dataclass(frozen=True)
class ClusterPair:
    """One candidate pair of the cluster, one qubit."""

    load_id: str
    truck_id: str
    origin: str
    destination: str
    truck_city: str
    empty_miles: float
    margin: float
    score: float


def find_contested_cluster(state: DecisionState, objective: Objective) -> list[ClusterPair]:
    """The pairs of the epoch's most contested truck: the loads that want it, each with its best few trucks.

    Returns an empty list when no truck is wanted by two or more loads (nothing to decide jointly).
    """
    open_loads = [load for load in state.open_loads if past_grace_reason(state, load) is None]
    candidates, _ = find_candidate_pairs(state, open_loads, objective)
    pairs_by_truck: dict[int, list[CandidatePair]] = {}
    for pair in candidates:
        pairs_by_truck.setdefault(pair.truck_index, []).append(pair)
    contested_trucks = [truck for truck, pairs in pairs_by_truck.items() if len(pairs) >= 2]
    if not contested_trucks:
        return []
    most_wanted_truck = max(contested_trucks, key=lambda truck: (len(pairs_by_truck[truck]), -truck))
    competing_pairs = sorted(pairs_by_truck[most_wanted_truck], key=lambda pair: -pair.score)[:MAX_LOADS]
    competing_loads = {pair.load_index for pair in competing_pairs}

    chosen_pairs = []
    for load_index in sorted(competing_loads):
        load_pairs = sorted((pair for pair in candidates if pair.load_index == load_index), key=lambda p: -p.score)
        best_pairs = load_pairs[:TRUCKS_PER_LOAD]
        chosen_pairs.extend(best_pairs)
        has_contested_truck = any(pair.truck_index == most_wanted_truck for pair in best_pairs)
        if not has_contested_truck:
            chosen_pairs.append(next(pair for pair in load_pairs if pair.truck_index == most_wanted_truck))
    chosen_pairs = sorted(set(chosen_pairs), key=lambda pair: (pair.load_index, -pair.score))[:MAX_PAIRS]
    return [describe_pair(state, open_loads, pair) for pair in chosen_pairs]


def describe_pair(state: DecisionState, loads: list, pair: CandidatePair) -> ClusterPair:
    load = loads[pair.load_index]
    truck = state.free_trucks[pair.truck_index]
    return ClusterPair(
        load_id=load.load_id, truck_id=truck.truck_id, origin=load.origin, destination=load.destination,
        truck_city=truck.city, empty_miles=pair.empty_miles, margin=pair.margin, score=pair.score,
    )


def build_assignment_oracle(pairs: list[ClusterPair], objective_key: str) -> dict:
    """Every bitstring's assignment, feasibility and value, and the cost table QAOA minimises.

    Bit i (qubit i, the rightmost character of a Qiskit bitstring) is pairs[i]. Cost is minus the total score, so the
    best assignment has the lowest cost; infeasible bitstrings cost more than every feasible one.
    """
    pair_count = len(pairs)
    if not 1 <= pair_count <= MAX_PAIRS:
        raise ValueError(f"a cluster needs 1 to {MAX_PAIRS} pairs, got {pair_count}")
    entries = []
    for index in range(1 << pair_count):
        chosen = [bit for bit in range(pair_count) if (index >> bit) & 1]
        entries.append(evaluate_choice(pairs, index, chosen))

    feasible_costs = [entry["cost"] for entry in entries if entry["feasible"]]
    lowest_cost = min(feasible_costs)
    highest_cost = max(feasible_costs)
    penalty = highest_cost + max(1.0, highest_cost - lowest_cost)
    costs = []
    for entry in entries:
        costs.append(entry["cost"] if entry["feasible"] else penalty)
    optimal_indices = [
        entry["index"] for entry in entries
        if entry["feasible"] and abs(entry["cost"] - lowest_cost) <= OPTIMUM_TOLERANCE
    ]
    milp_index = solve_cluster_with_milp(pairs)
    if milp_index not in optimal_indices:
        raise RuntimeError("the MILP and the exact table disagree on the cluster's optimum")
    return {
        "n_bits": pair_count,
        "bit_order": "qubit i is pairs[i]; it is the rightmost character of a Qiskit bitstring",
        "objective": objective_key,
        "pairs": [pair.__dict__ for pair in pairs],
        "entries": entries,
        "costs": costs,
        "penalty_cost": penalty,
        "best_cost": lowest_cost,
        "best_value": -lowest_cost,
        "optimal_indices": optimal_indices,
        "milp_index": milp_index,
    }


def evaluate_choice(pairs: list[ClusterPair], index: int, chosen: list[int]) -> dict:
    """One bitstring: the pairs it picks, whether any truck or load is used twice, and its value."""
    used_loads = [pairs[bit].load_id for bit in chosen]
    used_trucks = [pairs[bit].truck_id for bit in chosen]
    is_feasible = len(set(used_loads)) == len(used_loads) and len(set(used_trucks)) == len(used_trucks)
    total_score = sum(pairs[bit].score for bit in chosen)
    return {
        "index": index,
        "bitstring": format(index, f"0{len(pairs)}b"),
        "assignment": {pairs[bit].load_id: pairs[bit].truck_id for bit in chosen} if is_feasible else None,
        "feasible": is_feasible,
        "value": total_score if is_feasible else None,
        "cost": -total_score if is_feasible else None,
    }


def solve_cluster_with_milp(pairs: list[ClusterPair]) -> int:
    """The bitstring index the MILP policy's own solver picks for just these pairs (the classical reference)."""
    load_ids = sorted({pair.load_id for pair in pairs})
    truck_ids = sorted({pair.truck_id for pair in pairs})
    candidates = []
    for pair in pairs:
        candidates.append(CandidatePair(
            load_index=load_ids.index(pair.load_id), truck_index=truck_ids.index(pair.truck_id),
            empty_miles=pair.empty_miles, margin=pair.margin, score=pair.score,
        ))
    chosen = solve_assignment(candidates, len(load_ids), len(truck_ids))
    index = 0
    for bit, candidate in enumerate(candidates):
        if candidate in chosen:
            index |= 1 << bit
    return index
