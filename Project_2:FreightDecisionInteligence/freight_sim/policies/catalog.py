"""Every dispatch policy the page can choose, by name. A new policy is added here and nowhere else."""

from freight_sim.policies.greedy import greedy_nearest_truck

POLICIES = {
    "greedy": greedy_nearest_truck,
}
