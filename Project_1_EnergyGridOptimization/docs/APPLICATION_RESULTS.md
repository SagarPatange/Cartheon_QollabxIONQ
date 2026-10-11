# Local optimizer application evidence

Tasks 1-4 are implemented and reviewed. Task 5 verification below was performed on October 11, 2026; the controller's fresh final whole-application review is **pending**. This document does not mark the application milestone or goal complete.

The cabinet calls the existing exact block-offer HiGHS commitment MILP and continuous pricing LP with commitment fixed. Accepted outputs require complete finite exports, original-parameter commitment/pricing certificates, an optimal MILP status, gap at most 1e-9 and objective/bound agreement within $0.01 for these cases. No benchmark values substitute for a solve.

## Retained runs independently reloaded

Task 5 reused saved runs without starting additional solves. It reloaded each scenario through `load_operating_case`, `load_commitment_specs` and `load_reserve_case`, then reran `verify_commitment`, `verify_fixed_pricing` and, for the reserve case, `verify_reserve`. Each report's embedded scenario exactly matched the disk snapshot and an independently constructed transformation of the original case, including all unchanged fields.

| Run | ID | Commitment objective and bound, USD | MILP gap | Pricing objective difference, USD |
| --- | --- | ---: | ---: | ---: |
| Default, energy-only | `9291edd275574986aaa3ada9d3be1548` | 82,039.2757548886 | 0 | 0 |
| Edited, reserves enabled | `0c78fc676b1b4ce985466d938e9396b8` | 74,604.96997779509 | 0 | 2.91e-11 |
| LOCAL disabled, load 90%, energy-only | `cf2965e4cbc2454ca1d26d94b4877f15` | 67,242.5595649452 | 0 | 1.46e-11 |

All rebuilt commitment and pricing certificates passed. Fixed `on`, `starts` and `stops` matched exactly between MILP and pricing in every case. Maximum absolute pricing primal/dual gap was $2.91e-11; maximum rebuilt network residual was 8.53e-14 MW. Reserve headroom, availability, response and zonal requirements passed for both edited commitment and pricing; reserve residual was zero. All 24 LOCAL availability, on/off and generation entries were false/zero in the disabled run. Default mathematical inputs exactly reproduced `data/operating_case.json` and its declared objective.

Exact inputs and outputs are in `results/application-runs/<ID>/scenario.json` and `report.json`. The independent [reload summary](../results/application-development/task-5-reload-result.json) records certificates, bounds, gaps, controls and IDs; [reload script](../results/application-development/task-5-reload.py) reproduces the audit.

## Every supported control

The edited successful run supplies the first ten rows below; the separate disabled run supplies ENABLE. Isolated transformations, finite bounds, rejected contradictions, default equivalence and preservation of unrelated inputs are also covered by the 22 scenario tests in the fresh complete suite.

| Control | Actual retained input evidence |
| --- | --- |
| LOAD | 95% of every original hourly nodal demand, with original shares/profile |
| LINES | 110% of each original rating except named overrides |
| Selected line MW | `4-5` = 65 MW, replacing its global scaling; inspector shows solved 65.0 MW |
| RESERVE | 120%: north 6 MW, south 12 MW in every interval |
| Reserve mode | Edited solve includes reserve awards; default/disabled solves omit reserve awards |
| Unit CAP | BASE 110%: maximum 90 -> 99 MW; all matching offer MW endpoints scaled |
| Unit RAMP | BASE 90%: normal up/down rates 15 -> 13.5 MW/h |
| Unit OFFER | BASE 105%: matching offer prices and block metadata 10 -> 10.5 $/MWh |
| Unit START | BASE startup 600 -> 700 USD/start |
| Unit IDLE | BASE no-load 100 -> 110 USD/h |
| Unit ENABLE | LOCAL unavailable for all 24 intervals; zero commitment/energy in both exported solutions |
| HOUR | Task 4 traversed all 24 hours: 96/96 displayed bus-load checks matched the report, with input revision unchanged |

Capacity changes preserve fixed minima, initial dispatch/state, startup/shutdown caps, minimum times and reserve eligibility/prices. Contradictions are rejected, and zero normal ramp means zero normal change. The edited run combines controls, so its cost difference cannot be attributed to one individual control.

The PEAK-disabled version of the edited request (`04fb0d9f25eb4d7787a41c8c923f90c9`) was actually infeasible. Task 5 confirmed its exact input snapshot and absence of a completed report. Task 4's browser evidence shows FAULT plus the previous result explicitly stale; the solver did not repair inputs. RUN, RESET, late completion, duplicate submission, wrong ID/revision and nested snapshot isolation are covered by seven fresh Node state tests and Task 4's actual transition runs.

## Runtime and rendered evidence

Latest full Python suite after the final server fixes: **136 tests, OK, exit 0**, 35.869 seconds. It ran once on the final source, with output captured directly by a Python subprocess: [complete log](../results/application-development/final-fix-full-suite.txt). Focused jobs/server verification passed **19 tests**, including four new regressions; [final fix report](../results/application-development/final-fix-report.md) records RED/GREEN commands and the initial failing focused run. The unchanged Node state suite retains its Task 5 evidence: **7 passed, 0 failed, exit 0**; it was not repeated because JavaScript and CSS semantics did not change. Earlier Task 5 evidence remains in the [132-test Python log](../results/application-development/task-5-python-tests.txt), [Node log](../results/application-development/task-5-state-tests.txt) and [Task 5 report](../results/application-development/task-5-report.md).

The HTTP server now handles independent requests concurrently while `RunManager` retains its single solver worker. A two-second socket inactivity timeout applies before reading the request line or headers. With both an idle TCP client and an unfinished-header client open, the separate config/static/poll requests returned 200 in 0.032/0.015/0.016 seconds; both unfinished connections expired in 2.0 seconds. Shutdown plus server close completed in 0.5 seconds with both clients still open, and their handlers subsequently expired. See the [live reproduction measurements](../results/application-development/final-fix-repro-result.json). Incomplete POST bodies still return bounded JSON 400 errors. Expected reset/broken-pipe exceptions are quiet at the request boundary; unexpected errors retain standard traceback reporting. The expanded CSS retains identical selectors, declaration values and semantic tokens, verified in [CSS evidence](../results/application-development/final-fix-css-result.json).

Task 4's real browser runs exercised the loopback server, not a mockup. Task 5 visually inspected the final [desktop](../results/application-development/ui-final-desktop.png), [narrow](../results/application-development/ui-narrow.png), [edited success](../results/application-development/ui-edited-success.png) and [fault](../results/application-development/ui-edited.png) images and audited their reports. Desktop cost 82,039.28 matches the default saved objective; edited cost 74,604.97 and hour-18 branch flow 30.5 MW/rating 65.0 MW/utilization 46.9% match the edited report. The narrow screenshot is intentionally stale after a reserve-mode edit.

| Approved design requirement | Evidence and result |
| --- | --- |
| Local Python/HTML/CSS/SVG; existing solver mathematics | `application/server.py`, `solver.py`; actual API runs and fresh full tests |
| Strict declared controls, reproducible defaults, no silent feasibility repair | Independent full-snapshot comparisons, scenario tests, real failed request |
| One serialized solve; input/result revisions; honest empty/busy/stale/fault states | Jobs/server tests, seven state tests; Task 4 initial and transition runs |
| Actual objective, bound, gap, duration, awards, flows and conditional prices | Saved report certificates; renderer uses report mappings/scenario, including edited ratings/capacity |
| Case9 topology and attributed synthetic coordinates; TEST SYSTEM plate | APP01 and `configuration`; rendered desktop/edited schematic and scope drawer |
| Hour cursor updates schematic/trace without solving | All 24 hours checked; keyboard arrow preserves revision and VERIFIED status |
| Square industrial panels, minimal text, legible labels/units; no rounded cards | Viewed final desktop/narrow; zero rounded boxes and desktop text overlaps in Task 4 DOM checks |
| Selection, real flow direction/utilization, bus price/load, unit energy/reserve/on/off | `diagram.js` mappings; desktop and edited screenshots; numeric branch inspector |
| Keyboard and accessible names; status independent of color; reduced motion | Real Tab/Enter/Space/arrow checks; no unnamed inputs; words/lamps; reduced-motion preference checked |
| Narrow screen usability | 390 px viewport, no horizontal page overflow; internal schematic scrolling, stacked controls, native asset selector and readable trace |
| Local launcher readiness, browser open and port errors | Controller successfully launched from outside project on 8766 with process-scoped execution-policy bypass; GET 200 cabinet/config, 4 units/9 buses; occupied/failed startup tested |
| Project-only artifacts, assumptions and no quantum/cloud/commit/push | APP01-APP04, ignored project-local result paths, scoped changes; controller owns final scope/review sign-off |

The controller's live user launch is `http://127.0.0.1:8766/`; the QA server on 8765 remains separate. The successful launcher stdout is in `results/application-launch-0938d63a66c247068baa94bdf0681d81/stdout.log`. On this host direct `.ps1` execution was blocked; `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <absolute-project-path>\start_application.ps1 -Port 8766` successfully opened the browser after readiness. This does not change persistent execution policy. Historical launcher stderr includes client-disconnect `ConnectionResetError` traces; the final fix narrowly handles expected reset/broken-pipe exceptions. This worker did not restart either existing server; controller-owned restart and final live verification remain pending.

## Scope and limits

The four units and physical/economic parameters are declared synthetic inputs; only the load shape is scaled historical SPP data. The case9 drawing is an electrical schematic, with no SPP geographic crosswalk. The model uses DC flows and zero losses. Conditional prices are continuous model duals with commitment fixed, not historical SPP LMPs, SPP pricing SCED or startup uplift. One synthetic spinning-reserve product uses declared zones, headroom and response capability; reserve deployment transmission security and contingencies are not modeled. Availability controls apply across the day. The small local server is intended for one user; API history is in memory and saved files are not automatically restored. Narrow diagrams require internal horizontal scrolling. Quantum/Qollab work remains paused.

The final review fix wave changed only HTTP handling, its regression tests and CSS formatting, plus this evidence document. The full suite and isolated live reproduction passed. The controller's final scoped re-review, existing-server restart/live checks and final milestone sign-off remain **pending**.

## Final acceptance

Fresh final whole-application review identified the idle-connection stall. The fix uses concurrent HTTP handlers, a two-second early socket timeout, bounded shutdown, and narrowly handled expected disconnects; the solver worker remains serialized. Four added regressions reproduced the failures before the fix. All 136 Python tests and the unchanged seven Node state tests pass. Scoped re-review addressed every finding, with no new breakage; CSS formatting preserved exact selectors/declarations.

Controller restarted the normal browser launcher with fixed source on http://127.0.0.1:8766/ (session17581). With idle and partial-header connections open, configuration and cabinet returned200 in0.0916/0.0027 seconds; both clients expired. See [live server check](../results/application-development/final-live-server-result.json). A fresh browser run2d32c7674be34a7c953b85417c24e154 displayed82,039.28 versus certified82039.2757548886, with both certificates passing. [Final fixed-server screenshot](../results/application-development/ui-final-fixed-server.png) was visually inspected. The application milestone is complete; subsequent Qollab research and subroutine implementation are separately authorized by the user.
