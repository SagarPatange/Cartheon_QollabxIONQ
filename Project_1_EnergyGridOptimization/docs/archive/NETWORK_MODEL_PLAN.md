# Energy grid optimization implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the next ready task in this session. Track work with checkboxes and verify each deliverable before proceeding. Tasks 1-4 have been implemented; final verification is recorded in EXECUTION_LEDGER.md. Pause before Task 5 at the user's request.

**Updated:** October 10, 2026 (America/Chicago).

**Goal:** Establish a defensible classical day-ahead market model and evaluate whether a bounded quantum subroutine improves solution quality or time on the same constrained problem.

**Architecture:** Preserve the exact submitted-curve auction and its network controls as references. Resolve data interpretation and geography where evidence permits, then build a small explicitly parameterized multi-hour physical scheduling model. Keep historical price fidelity and algorithm performance as separate evaluations.

**Tech stack:** Windows PowerShell, Python 3.12, NumPy/SciPy, OSQP and Clarabel for the existing continuous models. Select the commitment solver and quantum SDK only after verifying their objective support, licensing and runtime access.

**Spec:** [MODEL_FIDELITY.md](../MODEL_FIDELITY.md), [ASSUMPTIONS.md](../ASSUMPTIONS.md), and the completed [NETWORK_RESULTS.md](../NETWORK_RESULTS.md).

## Global constraints

- All code, data, environments, plans and results remain inside `Project_1_EnergyGridOptimization`.
- Record each inferred interpretation and synthetic parameter in ASSUMPTIONS.md before using it. User explicitly approved documented test-network assumptions on October 10.
- Preserve submitted row identities and existing baseline results. Masked codes and OR overlap do not establish physical-unit identity.
- Historical prices are comparison outputs; do not tune demand, constraints or offers to match them.
- Separate actual SPP inputs, synthetic sensitivities and publicly sourced test-system inputs in every report.
- Respect separate dataset/reference licenses; do not extend MIT to third-party data.
- Keep generated results/environments/caches ignored. This plan update does not request a commit or push.

## Current checkpoint

- [x] Audit energy and OR offers; retain provenance and an accessible assumption register.
- [x] Solve and certify the full-day continuous auction using historical fixed demand.
- [x] Add DC network constraints, nodal prices and optional affine losses.
- [x] Run 24 baseline solves and 96 network cases; pass 40 tests and reconstruct all 505,572 exported awards.
- [x] Obtain the user's explicit confirmation of documented test-network assumptions.

The baseline MEC MAE is $20.56/MWh; the synthetic loss/congestion case is $20.38/MWh. The network extension works numerically but does not establish accurate historical SPP pricing. The completed network implementation ledger is retained below.

## Review focus

1. Fixed-load overlap and geographic scope: diagnose separately; report unresolved joins instead of silently pooling BAAs or counting demand twice (Task 1).
2. Repeated masked codes, signed consumption and virtual bids: preserve submissions; attach physical constraints only to explicitly declared physical units (Tasks 1-2).
3. Time boundaries and unavailable resources: enforce initial state, ramp limits and availability without inventing a feasible starting point (Tasks 2-3).
4. Discrete objectives and prices: disclose any cost approximation and reprice a fixed commitment with a continuous model; do not report a MILP as having ordinary dispatch duals (Task 3).
5. Quantum feasibility and benchmark fairness: decode and independently validate candidates, include overhead, and compare equal inputs/objectives/tolerances (Task 5).

## Next tasks, in order

### Task 1: Diagnose the historical price gap and document input access — complete

**Files:** Create `fidelity_diagnostics.py` and `test_fidelity_diagnostics.py`; update MODEL_FIDELITY.md and ASSUMPTIONS.md. Write generated diagnostics under `results/`, and source metadata under `data/reference/provenance.json`.

**Interface:** `diagnose_hour(curves, quantities, fixed_demand_mw, modeled_price, historical_mec) -> dict`. Consume existing `Curve` objects and certified baseline awards; return supply, signed consumption, responsive purchases, balance residual, price error and source-row IDs of marginal submissions. This function diagnoses an accepted solve and does not alter it.

- [x] Write tests using known awards: a +10 MW offer and -2 MW signed offer plus a 3 MW purchase bid serve 5 MW fixed demand; reported supply/consumption/purchases must be 10/2/3 MW and the residual zero. Preserve two submissions with the same masked code; separate offer-side and purchase-side roles. Missing physical/BAA/node classification must remain explicitly unknown, and the diagnostic must not silently pool demand from another BAA.
- [x] Run `.\.venv\Scripts\python.exe -m unittest test_fidelity_diagnostics -v` and observe the expected failure before implementation.
- [x] Implement the diagnostic and a CLI consuming a completed fidelity result folder. For each marginal row, retain its source ID, original curve, side, domain and location/classification status; do not identify a marginal row as a physical generator without evidence. Report ties and quantity endpoints separately from interior marginal curves.
- [x] Produce a 24-hour diagnostic table ranked by absolute MEC error. Reconcile quantities and compare reference MEC with MEC; keep SMP and weighted synthetic nodal prices separate.
- [x] Build an input-access checklist in MODEL_FIDELITY.md: slope encoding; fixed-demand overlap; physical/virtual and BAA/node crosswalk; actual physical limits; startup/no-load and initial state; ramps; reserve capability/requirements; network/PTDF/loss/contingency data; pricing/fast-start rules. Record each as available, requested, or not established, with source evidence.
- [x] Verify diagnostics reproduce the existing $20.56/MWh baseline MAE and balance certificates. State what the evidence explains and what remains unidentified. Request confirmation through the user if needed; do not send external messages.

**Exit gate:** Reproducible diagnostics plus an explicit data-access decision. Real SPP physical scheduling requires a verified unit mapping and associated parameters. If unavailable, proceed with declared test units under P01 rather than attaching invented unit attributes to all masked rows.

### Task 2: Link hours with supplied ramp and availability constraints

**Files:** Create `data/operating_case.json`, `multihour_dispatch.py`, `test_multihour_dispatch.py`; reuse network_dispatch.py and original curve mechanics where applicable. Record new parameters in ASSUMPTIONS.md before solving.

**Input contract:** Explicit physical unit IDs, unit-to-curve/node mapping by UTC interval, per-hour availability/min/max MW, initial dispatch, ramp-up/down MW per hour, interval duration and nodal demand. Require these fields rather than defaulting unknown values to zero or infinite capability. Virtual bids remain separate financial submissions. A signed curve alone does not identify a storage unit.

- [x] Test a two-hour case with 10 MW fixed demand each hour: a cheap unit at initial 0 MW with a 5 MW/hour upward ramp can supply only 5 MW in the first hour and 10 MW in the second; unrestricted expensive local supply must fill 5 MW and 0 MW respectively.
- [x] Test unavailable units, missing/ambiguous mapping and infeasible initial conditions; reject rather than silently repair. Verify duplicate submissions do not create duplicate physical capacity.
- [x] Implement continuous multi-hour dispatch with explicit ramp/availability constraints and independently rebuilt per-hour network and cross-hour certificates.
- [x] Verify removing the temporal restrictions reproduces independent-hour controls on the same declared test units and demands.
- [x] Run a small case first, then the 24-hour case. Report cost, feasibility, prices and binding temporal/network constraints with full input provenance.

**Exit gate:** A certified multi-hour continuous reference. Storage is a conditional extension requiring verified efficiency, energy capacity, state of charge and terminal conditions; add its tests and schema before implementation if those inputs exist.

### Task 3: Add a small unit-commitment benchmark

**Files:** Extend `data/operating_case.json`; create `unit_commitment.py` and `test_unit_commitment.py`; update MODEL_FIDELITY.md and ASSUMPTIONS.md.

**Input contract:** Task 2 inputs plus startup/no-load costs, minimum up/down times, initial on/off status and its duration, and startup/shutdown ramp capabilities for each declared physical unit. Initially use a small declared test case with block offers so a linear MILP has an exact objective. Do not silently replace sloped offers with blocks; any later piecewise-linear approximation needs an explicit error bound and refinement study, or a suitable convex MIQP solver.

- [x] Verify the classical solver supports the selected formulation and local environment; start with an available open solver and compare a commercial solver only when legitimately accessible.
- [x] Write tiny cases with enumerated feasible commitments: an expensive startup must alter the least-cost schedule; minimum up/down time and initial status must rule out otherwise attractive switches.
- [x] Implement on/off, startup/shutdown, dispatch, availability, ramp and minimum-time constraints. Report incumbent objective, bound, gap, status and solve time.
- [x] Independently validate each commitment/dispatch against original parameters; confirm optimality on enumerated cases.
- [x] Hold a solved commitment fixed and solve a continuous pricing dispatch. Verify nodal demand derivatives away from active-set changes. Label these conditional model prices; they do not reconstruct SPP's separate fast-start/mitigated pricing process.
- [x] Retain the smallest case with a meaningful commitment decision as the candidate quantum benchmark; scale classically before selecting a subproblem.

**Exit gate:** A feasible classical discrete benchmark with a known objective and defensible gap. This creates a candidate quantum target; it does not demonstrate quantum advantage.

### Task 4: Add operating reserve coupling when MW capability inputs are available

**Files:** Extend operating_case.json and unit_commitment.py; create `reserve_coupling.py` and `test_reserve_coupling.py`.

The gate is satisfied only for explicitly declared test-unit capabilities under P07; the SPP OR price export still lacks the real unit-level inputs.

- [x] Require eligible reserve MW, reserve requirements/zones, response capability and physical-unit identity. The downloaded OR price file alone does not satisfy this gate.
- [x] Test a unit with 10 MW shared capability and a 3 MW reserve obligation: its energy award cannot exceed 7 MW. Test reserve shortfall and unavailable/ineligible units explicitly.
- [x] Add an initially limited set of documented reserve products, their cost and energy/capacity coupling; do not assume all product capability can be stacked independently.
- [x] Compare energy-only and energy-plus-reserve results on identical declared units and demand, with independent reserve feasibility checks.

**Exit gate:** A certified reserve-coupled benchmark, or a recorded deferral if inputs remain absent. This task need not delay a small energy-only quantum experiment after Task 3.

### Task 5: Verify Qollab access and test a bounded quantum subroutine - paused before starting

User instruction: finish the classical steps, then pause here because other work comes first. No quantum experiment or Qollab execution has started.

**Files:** After capability verification, create `quantum_subproblem.py`, `test_quantum_subproblem.py` and a runner inside this project. Keep credentials outside source code and follow existing environment permissions.

- [ ] Verify current official Qollab simulator/SDK access, supported circuits, limits and hackathon requirements. Run the smallest supported circuit and record exact environment, seed/shots and execution mode. Access verification can proceed alongside Tasks 1-3.
- [ ] Select a small commitment neighborhood from Task 3. Keep continuous dispatch/network feasibility in the classical solver; define explicitly which binary decisions the quantum routine proposes.
- [ ] Test encoding/decoding on a tiny enumerated case, including infeasible bitstrings, penalty behavior and repair. Independently validate repaired schedules and charge repair time to the method.
- [ ] Establish classical enumeration and a classical neighborhood heuristic on the same subproblem before choosing a compatible quantum algorithm. Record the chosen design and penalty parameters before benchmark runs.
- [ ] Compare repeated runs at equal feasibility tolerances and objective definitions. Report feasible objective, optimality gap where available, feasible-candidate rate and total wall time including encoding, circuit execution, communication, decoding, repair and classical dispatch.
- [ ] Keep tuning and evaluation cases separate. Report simulator evidence as simulator evidence; claim improvement only for a measured equal-problem quality/time tradeoff. A cheaper result from changed constraints is not an algorithmic improvement.

**Exit gate:** A reproducible bounded experiment, whether the result is positive, negative or inconclusive. Circuit size and execution success alone do not establish impact.

## Later extensions

Actual resource-to-node mapping, verified SPP transmission/contingency/interchange models and pricing inputs replace synthetic components only when available. AC voltage/reactive feasibility, N-1 contingencies and neighboring-ISO boundaries are later scoped milestones with their own data and verification requirements. Keep the RTBM speed-optimization idea as a separate follow-up after the day-ahead benchmark is reproducible.

## Completed network milestone: implementation details and ledger

User authorization: implement the proposed next milestone, double-check it, rerun the local simulator and report results. All artifacts stay in this project. No new push requested.

## Scope and acceptance

Build continuous nodal DC dispatch on a public test-network topology, preserving all SPP submitted curves and historical fixed-demand baseline. Unknown geography and loss coefficients are explicit synthetic sensitivities, never claimed to reproduce SPP. This is the previously proposed network milestone; unit commitment, temporal ramps, reserve capability/co-optimization and actual physical resource classification remain pending their required inputs.

- Network input: connected buses, oriented branches, reactances, MW limits, reference bus, nodal demand, explicit curve-to-node mapping, optional per-submission tighter bounds/availability, optional supplied linear loss sensitivities/offset. Reject incomplete mappings, disconnected networks, invalid parameters and infeasibility.
- Construct PTDF from DC susceptance and incidence; reconstruct angles to check Kirchhoff laws independently of optimizer constraints.
- Optimize original integrated curves subject to weighted system balance, PTDF flow limits and submission bounds. No inferred unit identities and no historical shadow prices inserted as constraints.
- Extract MEC, MCC and MLC from solver duals; check their sum equals nodal prices and finite-difference objective derivatives in analytic and real-data cases.
- Validate primal feasibility, dual sign/price decomposition and an independently evaluated original-curve dual lower bound; require a small primal/dual gap. These provide an optimality certificate without exporting each stationarity/complementarity residual. No clipping infeasible awards or scalar single-node fallback for constrained cases.
- Public MATPOWER case9 topology/load shares provide a small test network. Fixed network scaling chosen from maximum historical fixed demand, not price fit. SHA256 masked-code assignments are synthetic and varied across two predetermined seeds. All loss sensitivities are fixed, explicitly synthetic inputs; this is not AC or resistance-derived transmission losses.
- Rerun all 24 SPP-fixed hours with the original baseline, an unconstrained network control, constrained lossless network (two mapping seeds), and constrained fixed-loss-sensitivity network. Compare outputs with raw historical references only after solving. Preserve every curve/award and serialize solver certificates, price decompositions, flow residuals, finite-difference checks, hashes, input configuration and error metrics.

## Tasks

1. Record N01-N05 assumptions; write analytic network tests before implementing. Include cheap-local/remote congestion, unconstrained equivalence, slope integration, negative consumption, meshed Kirchhoff laws, linear losses, limits/availability, invalid mapping and infeasible/disconnected cases.
2. Implement network_dispatch.py with PTDF construction, sparse convex QP, explicit row bounds and original-curve/network/dual certificates. Use Clarabel as a general constrained convex solver; retain HiGHS for linear cases. Existing single-node code remains unchanged.
3. Add network_simulation.py, obtain the official case9 source/provenance, run all-hour controls/sensitivities and finite-difference price checks. Never substitute a simplified result when constrained solve fails.
4. Inspect all exported awards/flows and input hashes; run all tests and a fresh read-only final review (executing-plans requirement). Update README, assumptions and NETWORK_RESULTS.md with actual outcomes and limitations.

## Ledger

Plan recorded before implementation. Existing code/git status clean at start; baseline already independently reviewed. Architectural design was proposed in chat and user authorized execution; no additional approval loop. Optional preference question is pending, but testable general solver construction does not depend on synthetic SPP assignment.

Task 1/2 complete: 13 analytic network tests passed, including responsive bids, restricted slope domains, congestion and loss price decomposition and finite differences. General solver built before assigning any SPP rows to synthetic nodes. Network rating multiplier fixed at 0.25 before data solves; unconstrained control 10.0. Case9 official source and licensing notice archived; case data is excluded from MATPOWER BSD license, so preserve separate third-party attribution.

Review identified runner configuration handling for mapping seeds and the loss offset. Both now flow from the JSON rather than hardcoded values. Serialization regressions for NumPy binding counts and finite-difference checks were reproduced and covered by tests. The final suite passes 40 tests; a fresh full-day run follows those fixes. Full exported-artifact reconstruction is implemented separately from the solver.

Fresh read-only final review found no blocking issues and independently passed all 40 tests. The optional preference question received no response during implementation; the run proceeds under the previously authorized public-network sensitivity design with N01-N05 registered. Ramps, reserves, unit commitment, AC voltage/reactive constraints, contingencies and real ISO boundary geography remain outside this milestone.

Subsequent user confirmation on October 10 explicitly approved documented test-network assumptions. This confirms the completed run's scope; it does not establish actual SPP geography or operating parameters.

Tasks 3/4 complete: final run `results/network-20261011T000056Z-c2a2627e` exited successfully after 24 baseline solves and 96 certified network cases. The exported-artifact audit rebuilt 505,572 awards and 1,728 price/flow records, all certificates, source/configuration hashes and metrics; passed. A deliberately altered exported price was rejected in a temporary project-local copy. Actual outcomes and limits are recorded in NETWORK_RESULTS.md; README and MODEL_FIDELITY describe the implemented scope. The historical MEC gap remains large, and no real SPP nodal accuracy, production-cost saving or quantum advantage is claimed.
