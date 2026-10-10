"""Tests for freight_sim/clock.py: when dispatchers make decisions (every hour from 9:00 to 17:00)."""

from freight_sim.clock import MINUTES_PER_DAY, next_decision_minute


def at(day, hour, minute=0):
    return day * MINUTES_PER_DAY + hour * 60 + minute


def test_before_the_shift_the_next_decision_is_at_nine():
    assert next_decision_minute(at(0, 8, 30)) == at(0, 9)


def test_a_time_exactly_on_a_decision_hour_is_that_decision():
    assert next_decision_minute(at(0, 9)) == at(0, 9)


def test_during_the_shift_the_next_decision_is_the_next_full_hour():
    assert next_decision_minute(at(2, 12, 15)) == at(2, 13)


def test_the_last_decision_of_the_day_is_at_seventeen():
    assert next_decision_minute(at(0, 16, 1)) == at(0, 17)


def test_after_the_shift_the_next_decision_is_nine_the_next_morning():
    assert next_decision_minute(at(0, 17, 30)) == at(1, 9)


def test_the_shift_hours_can_be_changed():
    assert next_decision_minute(at(0, 7), first_hour=6, last_hour=14) == at(0, 7)
    assert next_decision_minute(at(0, 14, 5), first_hour=6, last_hour=14) == at(1, 6)
