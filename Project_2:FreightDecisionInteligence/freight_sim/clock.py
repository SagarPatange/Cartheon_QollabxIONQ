"""Simulation time and the dispatchers' decision schedule.

Time is minutes since midnight of the first simulated day. Dispatchers decide every hour on the hour from
first_hour to last_hour (9:00–17:00 by default, both included), every day.
"""

MINUTES_PER_HOUR = 60
MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
FIRST_DECISION_HOUR = 9
LAST_DECISION_HOUR = 17


def next_decision_minute(
    minute: float, first_hour: int = FIRST_DECISION_HOUR, last_hour: int = LAST_DECISION_HOUR
) -> int:
    """The first decision time at or after `minute`."""
    day = int(minute // MINUTES_PER_DAY)
    minute_of_day = minute - day * MINUTES_PER_DAY
    next_full_hour = -(-minute_of_day // MINUTES_PER_HOUR)  # round up to a whole hour
    if next_full_hour < first_hour:
        return day * MINUTES_PER_DAY + first_hour * MINUTES_PER_HOUR
    if next_full_hour <= last_hour:
        return int(day * MINUTES_PER_DAY + next_full_hour * MINUTES_PER_HOUR)
    return (day + 1) * MINUTES_PER_DAY + first_hour * MINUTES_PER_HOUR
