"""A bounded quantum experiment on the dispatch problem, following Project 1's QAOA study.

assignment_oracle.py finds a small contested piece of one real decision epoch (a few loads competing for the same
trucks) and tabulates every way to assign it, exactly and classically. qaoa.py tunes a QAOA circuit on that table,
and comparison.py samples it next to uniform sampling and one-bit search with the same budget. No quantum speedup is
claimed: preparing the table is exponential in its size and done classically.
"""
