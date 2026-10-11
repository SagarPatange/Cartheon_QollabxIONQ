# Discrete-event dispatch simulator (Powell framework)

Date: 2026-10-10. Decisions marked **(user)** were made in chat; the rest are defaults, each a setting that can
change without touching the code.

## Goal

Replay the Kaggle carrier's loads as if in real time: loads are tendered over time, dispatchers decide during
working hours which loads to accept and which truck hauls each, and the simulator plays out the consequences
(empty miles, late pickups, declined revenue). Any dispatch policy plugs in through one function, so greedy,
MILP and QAOA policies later face exactly the same events.

## Powell's five elements

| Element | Here |
|---|---|
| State Sₜ | time; every truck (city, free-from time, trailer type, current load); every visible open load (lane, equipment, revenue, appointments, tender time) |
| Decision xₜ | for each visible open load: **accept with truck k**, **decline**, or **hold** (decide at a later epoch) |
| Exogenous information Wₜ₊₁ | load tenders arriving between epochs |
| Transition Sᴹ | event queue: truck drives empty to pickup → waits for appointment → loads → drives loaded (with rest breaks) → unloads → free at destination |
| Objective | profit = revenue of accepted loads − cost per mile × (loaded + empty miles) − late penalties |

## Time and decisions

- **Decision epochs (user):** dispatchers work 9:00–17:00 and decide every hour on the hour (9 epochs a day,
  every day of the week). Loads tendered outside those hours wait for the next epoch.
- **Tender time (user):** tender = scheduled pickup − lead time, lead time drawn from a mixture of two log-normals:

  | | Share | Median | 10th–90th percentile |
  |---|---|---|---|
  | Short notice | 40% | 6 h | 2–18 h |
  | Planned | 60% | 48 h | 24–96 h |

  σ = ln(p90 / p10) / (2 × 1.2816). Seeded, so every policy sees the same tenders.
- **Expiry:** a load not accepted by 24 h after its scheduled pickup is declined automatically.

## Fleet and movement (defaults)

- **Trucks:** the 92 trucks with status Active. Each starts at its home terminal; 14 trucks based in cities without
  lanes (Omaha, Salt Lake City, Nashville, Milwaukee, Oklahoma City) start at the nearest lane city.
- **Trailer type:** each truck gets dry van or reefer with the trailer table's mix (94 : 86), seeded. A load needs
  the matching trailer type.
- **Distances:** road miles from `data/osm_routes/city_matrix.json` (OSRM, all 20 × 20 pairs).
- **Driving time:** miles ÷ 50 mph average truck speed, plus a 10-hour rest after every 11 hours of driving
  (simplified hours of service).
- **Stops:** 2 h to load and 2 h to unload. A truck that arrives before the pickup appointment waits.
- **Which trucks a policy may use:** only trucks with no current load at the epoch.

## Money (defaults)

- Revenue: the load's `revenue` from the data.
- Cost: $1.50 per mile, loaded or empty (variable operating cost).
- Lateness: pickup more than 2 h after its appointment is late; each late pickup costs $250.

## First policy

**Greedy nearest truck:** loads in order of pickup appointment; for each, the free truck with the right trailer
type and the fewest empty miles that can reach pickup by appointment + 2 h; if none, hold; if the appointment
has passed by more than 2 h, decline.

## Outputs

Per run: loads tendered / accepted / declined, revenue, loaded and empty miles, cost, profit, on-time pickup rate,
truck utilisation, and the time each decision took. An event log (JSON) for replay on the map later.

## Layout

`freight_sim/` (Python, namespace package): `lead_time.py`, `clock.py`, `network.py`, `scenario.py`, `state.py`,
`simulator.py`, `policies/greedy.py`, `metrics.py`; `tools/run_simulation.py`; tests in `tests/freight_sim/`,
written first.

## Out of scope for now

MILP and QAOA policies; travel-time noise; driver identities; multi-load trips; replay of simulator output on the map.
