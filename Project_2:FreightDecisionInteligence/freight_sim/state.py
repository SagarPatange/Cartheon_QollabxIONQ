"""What a dispatch policy sees and what it returns: Powell's state Sₜ and decision xₜ.

A policy is any function `policy(state: DecisionState) -> Decision`. The simulator calls it at every decision
epoch and checks the decision before applying it.
"""

from dataclasses import dataclass, field

from freight_sim.network import RoadNetwork
from freight_sim.scenario import Load


@dataclass(frozen=True)
class TruckView:
    """A free truck as a policy sees it: where it is and which trailer it pulls."""

    truck_id: str
    city: str
    equipment: str


@dataclass(frozen=True)
class DecisionState:
    """Sₜ: the time, every load tendered and still open (sorted by pickup appointment), every free truck, and the
    road network for distances."""

    minute: float
    open_loads: list[Load]
    free_trucks: list[TruckView]
    network: RoadNetwork


@dataclass(frozen=True)
class Decision:
    """xₜ: loads to accept (load ID → truck ID) and loads to decline. Open loads in neither are held. `reasons` holds
    a short sentence per load explaining the choice, shown to the user in the event timeline."""

    accept: dict[str, str]
    decline: set[str]
    reasons: dict[str, str] = field(default_factory=dict)
