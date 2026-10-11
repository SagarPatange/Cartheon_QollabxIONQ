# Execution results

## Historical price diagnostics - Task 1 complete

The diagnostic rebuilt 126,393 SPP-fixed baseline awards across all 24 hours using the original curves, raw historical fixed demand/MEC and independent balance/bounds/objective/dual certificates. Average MEC error is unchanged at $20.5646/MWh. All modeled prices are below historical MEC; the largest gap is $51.8343/MWh at the 20:00 CPT hour ending.

The report separates positive supply, signed consumption and responsive purchases; preserves repeated codes as source rows; and identifies interior marginal submissions, block kinks and endpoint ties separately. Every physical/BAA/node classification remains explicitly unknown. These results do not identify which missing operational constraints caused the gap and do not adjust prices to fit SPP.

Generated artifacts: [diagnostic report](../results/diagnostics-20261011T022834Z-d4848ac3/diagnostic_report.json), [ranked hours](../results/diagnostics-20261011T022834Z-d4848ac3/ranked_hours.csv). Input-access checklist: [MODEL_FIDELITY.md](MODEL_FIDELITY.md).

Six new diagnostic tests passed after the missing module was observed failing. The complete project suite passed 46 tests. Real SPP temporal/commitment reconstruction remains gated on verified unit identity and operating parameters; execution continues with explicitly declared test units under P01.

## Temporal dispatch - Task 2 complete

The 24-hour case uses four explicitly declared test units on the attributed case9 topology, a 200 MW normalized demand peak and documented synthetic costs/ramps (P05). It preserves source-row/node/unit mappings and aggregates multiple physical submissions under one unit's capacity. Virtual/interchange/bid rows cannot acquire physical-unit ramps. It retains exact block/sloped curve integration and scales costs and price duals for interval duration.

With network limits and availability held constant, unrestricted-ramp control cost is $73,618.23 and ramp-constrained cost is $84,132.68, a $10,514.45 feasibility cost difference in this synthetic case. Both are certified against original costs, per-hour DC equations/limits, aggregate unit bounds, initial dispatch and cross-hour ramps; independent bounded-segment dual lower bounds certify continuous optimality. These figures are not SPP production costs or quantum savings.

The complete suite passed 59 tests, including 13 temporal tests. Both exported solutions were reloaded against the saved input snapshot and their certificates rebuilt successfully. Artifacts: [temporal report](../results/temporal-20261011T025244Z-38771304/temporal_report.json), [snapshot](../results/temporal-20261011T025244Z-38771304/operating_case.json), [rebuilt audit](../results/temporal-20261011T025244Z-38771304/artifact_audit.json).

## Unit commitment and conditional pricing

The exact block-offer HiGHS MILP enforces declared startup/no-load costs, on/off and transition decisions, generation limits, availability, initial status duration, minimum up/down times and separate startup/shutdown ramps. P06 discloses its terminal-time convention. Sloped quadratic costs are rejected by this linear formulation rather than approximated silently.

The 24-hour four-unit test schedule costs $82,039.28, with the same objective bound, zero reported MIP gap and five startups. This total cannot be interpreted as a reduction from the temporal model: startup/shutdown capabilities change its feasible set as well as adding commitment costs. Conditional continuous redispatch returns the same objective and certified model marginal prices; no startup uplift or SPP fast-start pricing claim is made.

Twelve commitment tests pass, including full enumeration of 16 tiny schedules, minimum-time/initial-state cases, expensive startups, ramp infeasibility, marginal-demand derivatives and corrupted exported price detection. Full suite: 71 tests. Exported MILP and pricing artifacts were reloaded and certified against their saved inputs: [report](../results/commitment-20261011T024301Z-645b0d5f/commitment_report.json), [audit](../results/commitment-20261011T024301Z-645b0d5f/artifact_audit.json).

## Reserve coupling - Task 4 complete

The declared test-unit case (P07) adds one upward spinning-reserve product: 5 MW in the north zone and 10 MW in the south zone each hour. Eligibility, reserve price and a 15-minute ramp-response limit are explicit inputs. Energy and reserve share online capacity; no shortage slack or independent capability stacking is introduced.

| Identical-unit, identical-demand comparison | Cost |
| --- | ---: |
| Energy-only commitment | $82,039.28 |
| Energy plus reserve commitment | $84,723.66 |
| Added reserve feasibility cost | $2,684.39 |

The reserve MILP reports zero optimality gap and four startups. Saved inputs and exports were reloaded: original commitment/dispatch/reserve constraints, objective and fixed-commitment pricing dual certificates passed independently. Artifacts: [report](../results/commitment-20261011T025245Z-b389f850/commitment_report.json), [audit](../results/commitment-20261011T025245Z-b389f850/artifact_audit.json). Seven new reserve tests cover shared headroom, shortage, ineligibility, unavailability, response limits, zones and corrupted awards; the complete suite passes 78 tests.

These requirements and capabilities are synthetic. The downloaded SPP OR prices do not establish real eligible MW or operational reserve zones; this is not a historical SPP reserve reconstruction.

## Retained discrete reference and pause

[data/commitment_benchmark.json](../data/commitment_benchmark.json) retains the two-unit/two-hour decision. All 16 on/off schedules were enumerated at each cheap-unit startup cost: $10 yields an optimum of $410, while $1,000 yields $1,000. Both equal the exact MILP result. [Complete classical reference](../results/commitment-reference-20261011T024813Z-d67804c2/reference_report.json).

Tasks 1-4 are implemented. At the user's request, pause before Task 5; no quantum circuit or Qollab experiment has run. The current classical results do not establish quantum advantage or improved historical SPP LMP fidelity.

## Final review verification

The review identified acceptance of nonfinite exported arrays in some certificate checks. Two regression tests reproduced the failure; shape/finiteness checks now reject NaN, infinity and malformed arrays before residual reductions. All 80 tests pass. Fresh 24-hour temporal and reserve studies reproduce the reported objectives, and reloaded original-parameter/dual audits pass with the corrected verifiers.

The temporal study also retains [10 named binding ramp constraints](../results/temporal-20261011T025244Z-38771304/binding_constraints.json), including UTC intervals, branch/unit names, slack and dual values; this supplemental summary was rebuilt from the saved model and solution.
