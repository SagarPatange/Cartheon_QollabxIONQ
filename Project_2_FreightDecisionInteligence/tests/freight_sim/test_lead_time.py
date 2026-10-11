"""Tests for freight_sim/lead_time.py: how long before pickup a load is tendered (two log-normal humps)."""

import math
import random

from freight_sim.lead_time import DEFAULT_LEAD_TIME, LeadTimeHump, LeadTimeMixture

SAMPLE_COUNT = 20_000


def percentile(sorted_values, fraction):
    return sorted_values[int(fraction * (len(sorted_values) - 1))]


def test_a_hump_is_set_by_its_median_and_its_10th_to_90th_percentile_range():
    hump = LeadTimeHump(share=1.0, median_hours=6, p10_hours=2, p90_hours=18)
    assert math.isclose(hump.mu, math.log(6))
    assert math.isclose(hump.sigma, math.log(9) / (2 * 1.2816), rel_tol=1e-6)


def test_samples_from_one_hump_have_the_requested_median_and_percentiles():
    mixture = LeadTimeMixture([LeadTimeHump(share=1.0, median_hours=6, p10_hours=2, p90_hours=18)])
    rng = random.Random(1)
    samples = sorted(mixture.sample_hours(rng) for _ in range(SAMPLE_COUNT))
    assert abs(percentile(samples, 0.5) - 6) < 0.3
    assert abs(percentile(samples, 0.1) - 2) < 0.15
    assert abs(percentile(samples, 0.9) - 18) < 1.0


def test_the_default_mixture_puts_about_40_percent_of_tenders_under_20_hours_ahead():
    # Short-notice hump (40%) is almost entirely under 20 h; the planned hump (median 48 h) almost never is.
    rng = random.Random(2)
    samples = [DEFAULT_LEAD_TIME.sample_hours(rng) for _ in range(SAMPLE_COUNT)]
    share_under_20_hours = sum(sample < 20 for sample in samples) / SAMPLE_COUNT
    assert abs(share_under_20_hours - 0.40) < 0.015


def test_the_same_seed_gives_the_same_lead_times():
    first = [DEFAULT_LEAD_TIME.sample_hours(random.Random(7)) for _ in range(3)]
    second = [DEFAULT_LEAD_TIME.sample_hours(random.Random(7)) for _ in range(3)]
    assert first == second


def test_shares_must_add_up_to_one():
    try:
        LeadTimeMixture([LeadTimeHump(share=0.5, median_hours=6, p10_hours=2, p90_hours=18)])
    except ValueError as error:
        assert "add up to 1" in str(error)
    else:
        raise AssertionError("expected a ValueError")
