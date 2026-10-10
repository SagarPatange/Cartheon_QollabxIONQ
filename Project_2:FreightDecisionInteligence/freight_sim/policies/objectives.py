"""What the assignment optimizer (milp.py) maximises: five objectives a dispatcher can choose between.

Each objective scores one load–truck pair from the same facts (revenue, margin, empty miles, how early or late
against the pickup appointment the truck would arrive, and how long the truck would be tied up). The optimizer
then picks the assignment with the largest total score. A score of None means the objective will not use that
pair at all; the load is held, and `refusal` says why in the timeline ("every free dry van that can reach Dallas
in time …").

    profit    revenue − cost, money-making pairs only (the original objective)
    service   customer satisfaction: cover as many loads as possible over the week, even at a loss
    cost      low cost: profit with empty miles counted three times, so only nearby trucks are sent
    revenue   top-line revenue: every reachable load, the biggest first, profitable or not
    balanced  profit, a bonus per load covered, empty miles and lateness weighed together
"""

from collections.abc import Callable
from dataclasses import dataclass

# Customer satisfaction: a covered load is worth far more than any money or distance, so the optimizer first
# covers as many loads as it can now. Among equal counts it prefers trucks that are free again soon (short trips,
# little waiting at the pickup), so more trucks are left for the customers who tender later in the week. Without
# that, it covered fewer loads per week than greedy (213 against 243, week of 2022-03-07); with it, more (checked
# 2026-10-10 against greedy on three weeks: 266/243, 261/249, 269/259).
SERVICE_VALUE_PER_LOAD = 10_000.0
SERVICE_PENALTY_PER_BUSY_HOUR = 20.0
SERVICE_PENALTY_PER_IDLE_HOUR = 20.0
SERVICE_PENALTY_PER_LATE_HOUR = 100.0
# Low cost: each empty mile counts this many times its real cost.
EMPTY_MILE_WEIGHT = 3.0
# Balanced: a covered load is worth this bonus on top of its margin; lateness against the appointment costs this
# much per hour.
BALANCED_SERVICE_BONUS = 400.0
BALANCED_PENALTY_PER_LATE_HOUR = 150.0
MINUTES_PER_HOUR = 60


@dataclass(frozen=True)
class PairFacts:
    """What every objective may look at for one load–truck pair that can reach the pickup within the grace period."""

    revenue: float
    margin: float
    empty_miles: float
    empty_mile_cost: float
    minutes_after_appointment: float  # negative or zero when the truck is there before the appointment
    busy_hours: float  # from now until the truck reaches the delivery: driving empty, waiting, driving loaded

    @property
    def late_hours(self) -> float:
        return max(0.0, self.minutes_after_appointment) / MINUTES_PER_HOUR

    @property
    def idle_hours(self) -> float:
        """Hours the truck would wait at the pickup for the appointment."""
        return max(0.0, -self.minutes_after_appointment) / MINUTES_PER_HOUR


@dataclass(frozen=True)
class Objective:
    key: str
    label: str
    description: str  # what the optimizer does under this objective, one sentence for the page
    score: Callable[[PairFacts], float | None]
    refusal: str  # how a held load's reachable trucks fall short, after "every free <trailer> that can reach <city>"


def score_profit(pair: PairFacts) -> float | None:
    if pair.margin <= 0:
        return None
    return pair.margin


def score_service(pair: PairFacts) -> float:
    busy_cost = SERVICE_PENALTY_PER_BUSY_HOUR * pair.busy_hours
    idle_cost = SERVICE_PENALTY_PER_IDLE_HOUR * pair.idle_hours
    late_cost = SERVICE_PENALTY_PER_LATE_HOUR * pair.late_hours
    return SERVICE_VALUE_PER_LOAD - busy_cost - idle_cost - late_cost - pair.empty_mile_cost


def score_low_cost(pair: PairFacts) -> float | None:
    extra_empty_cost = (EMPTY_MILE_WEIGHT - 1) * pair.empty_mile_cost
    score = pair.margin - extra_empty_cost
    if score <= 0:
        return None
    return score


def score_revenue(pair: PairFacts) -> float:
    return pair.revenue


def score_balanced(pair: PairFacts) -> float | None:
    lateness_cost = BALANCED_PENALTY_PER_LATE_HOUR * pair.late_hours
    score = pair.margin + BALANCED_SERVICE_BONUS - pair.empty_mile_cost - lateness_cost
    if score <= 0:
        return None
    return score


OBJECTIVES = {
    "profit": Objective(
        "profit", "Max profit",
        "Assigns trucks to make the most total margin, and holds any load only money-losing trucks can reach.",
        score_profit, "would lose money"),
    "service": Objective(
        "service", "Customer satisfaction",
        "Covers as many loads as it can, even at a loss, preferring trucks that are free again soon.",
        score_service, "cannot serve it"),
    "cost": Objective(
        "cost", "Low cost",
        "Counts every empty mile three times, so it only sends trucks that are already close to the pickup.",
        score_low_cost, "would drive too far empty for what it pays"),
    "revenue": Objective(
        "revenue", "Max revenue",
        "Takes the biggest loads it can reach, whether or not they make money.",
        score_revenue, "cannot serve it"),
    "balanced": Objective(
        "balanced", "Balanced",
        "Weighs profit, a bonus for each load covered, empty miles and lateness together.",
        score_balanced, "scores too low on profit, service and empty miles together"),
}
DEFAULT_OBJECTIVE = "profit"
