# SPP-derived QAOA comparison implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Owner previously selected native execution to conserve cost.

**Goal:** Compare QAOA and classical stochastic methods on a common actual-SPP dispatch neighborhood, with exact optimum, conditional prices, success frequencies and overhead visible.

**Architecture:** A deterministic SPP-to-oracle adapter creates at most four binary dispatch decisions with one continuous balancing submission, preserving actual curves, fixed demand and frozen awards. A local benchmark reuses existing QAOA and classical search routines. Comparison jobs share the market worker and immutable provenance; the dashboard shows matched methods separately from the full continuous-auction reference.

**Tech stack:** Installed Python, NumPy/SciPy/Qiskit, local BasicSimulator, existing loopback HTTP server and browser JS/CSS. No new dependency.

**Spec:** docs/SPP_QAOA_COMPARISON_DESIGN.md (approved, including owner success-frequency clarification).

## Global constraints

- Actual selected-hour SPP curves and fixed demand only; no invented commitment parameters or geographic mappings.
- At most four binary dispatch choices (16 candidates), with original source bounds, signed balance and integrated costs.
- Full continuous auction is a separate reference/lower bound; matching stochastic competitors use the same finite candidate table.
- Free local simulation only; explicit comparison action after a certified Run Hour, never automatically on Run Day.
- Cache immutable provenance/settings; record assumptions in docs/ASSUMPTIONS.md. All artifacts stay inside the project.
- Show all outcomes, no guaranteed QAOA improvement; conditional price is not nodal LMP or a QAOA dual.
- Owner authorizes commit/push after verification, message `final draft, debugging`; exclude unrelated changes, ignored uploads/results/cache, secrets.

## Review focus

- No interior balancing resource/no meaningful alternative: unavailable, no synthetic substitution (Task1).
- Negative signed offers/purchase bids and negative residual demand: balance and costs remain signed; do not pass negative residual demand to the legacy verifier that rejects it (Task1).
- Balancer at a kink/bound: price range or unavailable scalar, never an arbitrary unique price (Task1).
- Stale dataset/hour/baseline and repeated requests: results/cache cannot attach to a different input; repeated identical request reuses computation (Task2/3).
- No feasible QAOA sample or inferior heuristic outcome: null best/price or actual worse score; no silent replacement with classical optimum (Task2/3).

### Task1: Actual-SPP finite dispatch adapter

**Files:** Create quantum/spp_dispatch.py and tests/test_spp_dispatch.py; modify docs/ASSUMPTIONS.md.

**Interfaces:** `build_spp_oracle(curves, baseline, *, max_bits=4, step_mw=1.0) -> dict` consumes Curve objects and the certified market-hour result (awards/verification/fixed demand/model price). Produces existing qaoa.py-compatible n_bits/costs/entries/optimal_indices/best_objective_dollars plus selected levels, balancing ID, frozen awards/cost/injection, candidate feasibility/quantities/conditional price and original-curve checks. Returns status unavailable and reason when there is no meaningful neighborhood.

- [x] Write tests for a hand-verifiable signed-offer/purchase-bid case: every candidate's original net injection equals fixed demand within 1e-5 MW, quantity bounds within 1e-6 MW, summed original cost matches objective, and all-zero candidate reproduces baseline. Also test no adjustable balancer and negative residual demand.
- [x] Run `.\.venv\Scripts\python.exe -m unittest tests.test_spp_dispatch -v`; observe absent-adapter failure.
- [x] Implement deterministic selection: validate baseline row correspondence and original quantities/balance/cost; choose balancing resource with largest interior slack `min(q-lower, upper-q)`, ties by row_id, requiring slack >1e-6 MW. Rank remaining adjustable curves by distance of baseline marginal-price interval to full-auction price, ties by row_id; take up to four with nonzero available step. Level0 is original award; level1 moves toward the larger quantity headroom (up on tie), by `min(1 MW, 10% of full quantity range, directional headroom)`. Record rule/settings exactly. Freeze all remaining awards. No claim that these dispatch choices are commitment decisions.
- [x] For each state derive the balancing quantity algebraically from signed equality, allowing negative residual demand. Check bounds; infeasible states get disclosed penalty `max_feasible_cost + max(1, feasible_cost_span, abs(max_feasible_cost)*0.01)`. Evaluate original signed integrals including frozen constant. Check baseline reproduction, original feasibility and no feasible candidate below the certified full optimum beyond its dollar tolerance. Require a distinct feasible alternative with differing cost; otherwise unavailable. One balancer makes residual pricing exact without repeatedly solving thousands of frozen resources.
- [x] Derive conditional price from the balancer's one-sided marginal limits: strictly interior smooth segment gives scalar, kink gives sorted price interval, quantity bound gives unavailable scalar (scope note). Add a kink/bound test; distinguish full-model optimality certification from candidate feasibility.
- [x] Run adapter tests GREEN; record assumptions/selection/balancing/price conventions. Preserve evidence in ignored results/spp-qaoa-development; no intermediate commit of unrelated dirty work.

### Task2: Local matched benchmark and serialized jobs/API

**Files:** Create quantum/spp_comparison.py, tests/test_spp_comparison.py, tests/test_market_comparison.py; modify application/market_jobs.py and application/server.py.

**Interfaces:** `compare_spp_oracle(oracle, *, shots=256, repeats=5, seed=2026, depth=1, restarts=1, maxiter=40) -> dict`. Returns classical exact optimum, uniform/one_bit/qaoa per-trial counts/scores, aggregate optimal-hit rate, trial success fraction, best feasible cost/gap and conditional price, selected award differences, actual tuning status, and timing split. Market manager `submit_comparison(baseline_run_id, hour_index) -> dict` queues on existing single worker; existing `get(run_id)` returns kind comparison/status/provenance/result. POST `/api/market/comparisons` accepts exactly baseline_run_id/hour_index; GET uses existing `/api/market/runs/<id>`.

- [x] Write failing tests proving identical oracle inputs/scoring and candidate occurrence budgets across methods, exact reference optimum, null selection for no feasible sample, honest inferior method outcome, repeat/cache identity and busy-worker rejection. Inject cheap deterministic sampling into job tests; do not run multiple tuning benchmarks there.
- [x] Run new tests and observe RED.
- [x] Reuse tune_qaoa/build_qaoa/score_counts and benchmark.one_bit_counts. Tune once; five seeded trials each give uniform, one-bit and QAOA 256 candidate occurrences. Use BasicSimulator only. Exact enumeration visits every distinct state once as reference (do not pad into a fictitious stochastic success rate). Record per-trial hit fraction and best-found optimum indicator; aggregate descriptive means, no unsupported significance claims (one-bit samples are dependent). Preserve counts, seed, settings, oracle preparation time, exhaustive-search selection time, tuning and method sampling/search times. Candidate preparation already enumerates the state table: disclose exponential overhead.
- [x] Add immutable comparison job kind to existing worker. Require certified source hour from existing baseline run; validate strict integer index (not bool) and matching dataset. Cache hash includes source SHA values, UTC identity, full baseline awards/price/demand, selection/levels/balancing, encoding version and fixed benchmark settings. In-process cache only, persisted artifacts for audit; failures not reused as completed successes. Cache hit returns completed existing comparison. Reject concurrent work via existing BusyRunError. Persist report before publishing complete status.
- [x] Add strict comparison route with existing Host/Origin/JSON/body protections. Write API tests for missing/unknown baseline, failed baseline, malformed index/body, and result identity; retain legacy routes.
- [x] Run `.\.venv\Scripts\python.exe -m unittest tests.test_spp_comparison tests.test_market_comparison tests.test_market_jobs tests.test_market_server -v` GREEN. No full-day solve.

### Task3: Visible matched comparison, one SPP trial and delivery

**Files:** Modify application/market.html, market.css, market.js, market_state.js; test application/test_market_state.mjs; update README.md, docs/QUANTUM_RESULTS.md, docs/SPP_QAOA_COMPARISON_DESIGN.md and ledger/report.

**Interfaces:** Store source baseline run_id for each certified hour and comparison results keyed by dataset/hour/baseline. `acceptComparison(state, record) -> bool` verifies all three before display. New explicit Run QAOA Comparison button disabled until certified hour, and while either job type active. Existing price instrument remains first/largest.

- [x] Write state tests for stale dataset/hour/baseline rejection and matching acceptance; observe RED.
- [x] Build matched-method panel with exact reference and separate full-auction reference. Columns classical random, classical one-bit, QAOA: optimal-hit frequency, trials finding optimum /5, best feasible cost, cost gap, conditional marginal price or range, selected changes and timing. Label heuristic vs exact correctly; show all per-trial outcomes/settings, preparation/tuning costs, frozen-resource scope, unavailable/error/no-feasible states. Do not call sample hit rate execution speedup. No fabricated QAOA full-market LMP.
- [x] Poll comparison through existing run route; keep kind comparison out of acceptRun's classical-hour ingestion. Clear/hide on dataset switch or replaced baseline; tolerate interval changes during polling without attaching results to wrong hour. Cache results for correct hour. Run Node state tests GREEN.
- [x] Perform actual browser upload/control/selection test on a cheap fixture, including failed/stale result behavior and readability. Run one real July1 first-hour SPP-derived comparison with fixed settings; retain source hashes/oracle/counts/prices/overheads and show outcome even if QAOA loses. No additional full-day or remote simulation trials. Update results documentation honestly.
- [x] One focused fresh final review per preserved native method; fix consequential findings once with scoped verification. No overlapping reviewers/extra full benchmark suite.
- [ ] Inspect Git status/diff/ignore and staged scope; include relevant project changes from the current interface work and comparison, exclude unrelated project edits and ignored artifacts. Preserve SPP data license exclusions and existing tracked raw data (no unnecessary new data). Commit `final draft, debugging`, push the configured branch, verify remote commit and report branch/hash. If Git metadata write/network needs escalation, request it with this explicit owner authorization.

## Plan self-review

Spec coverage: adapter/real curves/frozen recourse/prices Task1; matched algorithms/caching/security/overheads Task2; UI/provenance/real local trial and authorized delivery Task3. All later signatures match earlier interfaces. Every Review Focus has a owning test. One balancing resource satisfies the spec's small continuous set and avoids redundant large solves. No new quantum commitment assumptions or dependency upgrades.


Delivery note: implementation/checks complete; commit/push step completes only after remote verification. Project card added at owner request. Original native method retained.
