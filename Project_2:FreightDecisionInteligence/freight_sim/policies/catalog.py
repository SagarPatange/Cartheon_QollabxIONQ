"""Every dispatch policy the page can choose, by name. A new policy is added here and nowhere else.

The MILP policy also takes an objective (objectives.py); greedy is a fixed rule and ignores it.
"""

from freight_sim.policies.greedy import greedy_nearest_truck
from freight_sim.policies.milp import make_milp_policy
from freight_sim.policies.objectives import OBJECTIVES

POLICY_NAMES = ["greedy", "milp"]
GREEDY_LABEL = "Greedy"
GREEDY_DESCRIPTION = (
    "Gives each load, in pickup order, the nearest free truck with the right trailer, without weighing loads "
    "against each other."
)


def describe_rule(policy_name: str, objective_key: str) -> dict[str, str]:
    """The run's rule for the page: {"label": "Optimizer · Max profit", "description": one sentence}."""
    if policy_name == "greedy":
        return {"label": GREEDY_LABEL, "description": GREEDY_DESCRIPTION}
    objective = OBJECTIVES[objective_key]
    return {"label": f"Optimizer · {objective.label}", "description": objective.description}


def build_policy(policy_name: str, objective_key: str):
    """The policy function for a policy name and objective key; fails fast on unknown names."""
    if policy_name not in POLICY_NAMES:
        raise ValueError(f"unknown policy {policy_name!r}; known: {POLICY_NAMES}")
    if objective_key not in OBJECTIVES:
        raise ValueError(f"unknown objective {objective_key!r}; known: {sorted(OBJECTIVES)}")
    if policy_name == "greedy":
        return greedy_nearest_truck
    return make_milp_policy(objective_key)
