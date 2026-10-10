"""How long before its pickup appointment a load is tendered to the carrier.

The data has no tender times, so the simulator draws a lead time per load and sets tender = pickup − lead time.
Lead times follow a mixture of two log-normal "humps" (two peaks on a log scale), the shape seen in real customer
data: short-notice loads tendered hours before pickup, and planned loads tendered days ahead.
"""

import math
import random
from dataclasses import dataclass, field

# A normal distribution's 90th percentile is 1.2816 standard deviations above its median.
Z_AT_90TH_PERCENTILE = 1.2816


@dataclass(frozen=True)
class LeadTimeHump:
    """One log-normal hump, set by its share of loads, its median and its 10th–90th percentile range (hours)."""

    share: float
    median_hours: float
    p10_hours: float
    p90_hours: float
    mu: float = field(init=False)
    sigma: float = field(init=False)

    def __post_init__(self) -> None:
        if not 0 < self.p10_hours < self.median_hours < self.p90_hours:
            raise ValueError("a hump needs 0 < p10 < median < p90")
        object.__setattr__(self, "mu", math.log(self.median_hours))
        spread = math.log(self.p90_hours / self.p10_hours) / (2 * Z_AT_90TH_PERCENTILE)
        object.__setattr__(self, "sigma", spread)


class LeadTimeMixture:
    """A weighted mix of humps; each draw picks a hump by its share, then a log-normal lead time from it."""

    def __init__(self, humps: list[LeadTimeHump]) -> None:
        total_share = sum(hump.share for hump in humps)
        if not math.isclose(total_share, 1.0):
            raise ValueError(f"hump shares must add up to 1, got {total_share}")
        self.humps = humps

    def sample_hours(self, rng: random.Random) -> float:
        """One lead time in hours."""
        pick = rng.random()
        cumulative_share = 0.0
        chosen_hump = self.humps[-1]
        for hump in self.humps:
            cumulative_share += hump.share
            if pick < cumulative_share:
                chosen_hump = hump
                break
        return rng.lognormvariate(chosen_hump.mu, chosen_hump.sigma)


# Placeholder shape agreed in chat (2026-10-10), to be replaced with figures from customer data.
DEFAULT_LEAD_TIME = LeadTimeMixture([
    LeadTimeHump(share=0.4, median_hours=6, p10_hours=2, p90_hours=18),  # short notice
    LeadTimeHump(share=0.6, median_hours=48, p10_hours=24, p90_hours=96),  # planned
])
