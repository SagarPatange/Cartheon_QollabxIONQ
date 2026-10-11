# Execution ledger - NETWORK_MODEL_PLAN.md

Started October 10, 2026 (America/Chicago). Scope: all five planned tasks and their explicit input/access gates. No commit or push requested.

## Setup and rulings

- Current checkout inspected; pre-existing network code/documentation changes retained. Baseline: `python -m unittest discover -q`, 40 tests passed.
- Working branch: `energy-grid-plan`, created from main with existing changes preserved.
- Ruling: work in the user's existing project folder rather than create a separate worktree or repo-root skill workspace - the user requires all project artifacts in this folder and the authorized plan names this location. Cost if wrong: no second working-directory isolation; a dedicated branch, narrow file edits and retained baselines limit the risk.
- Ruling: retain this project-local ledger instead of the skill's shell-specific scripts/commit-based ledger - Windows PowerShell, uncommitted authorized work and the user's no-push scope require an auditable file/test record without moving or committing unrelated work. Cost if wrong: verification must include the actual working files rather than relying on commit ranges.
- Pre-flight: Task 1 consumes existing curves and award artifacts; Tasks 2-3 consume a newly explicit operating-case schema, not inferred masked resource identities. Task 4 requires eligible MW/requirements; Task 5 requires a classical discrete benchmark and verified execution access. Real SPP identity/network inputs remain unverified; the plan explicitly permits separately declared test units.

## Task status

- Task 1: complete - six diagnostic tests RED (missing module) -> GREEN; full suite 46/46. CLI rebuilt 126,393 awards across 24 hours, original dual certificates and raw SPP references; MAE reproduced at 20.564602162932932. Output `results/diagnostics-20261011T022834Z-d4848ac3`. MODEL_FIDELITY input-access checklist records observed/pending/unestablished inputs; no price calibration or external messages.
- Task 2: complete - 13 temporal tests RED -> GREEN; complete suite 59/59. Declared P05/data/operating_case.json before its first solve. 24-hour linked and unrestricted-ramp control solves certified; exported snapshot and both solutions reloaded and independently verified. Outputs `results/temporal-20261011T025244Z-38771304`; objectives 84132.68339602672 / 73618.23305588315.
- Task 3: complete, including the retained two-unit/two-hour classical benchmark and all 16 schedules at startup costs 10 and 1000 (objectives 410 and 1000). Twelve commitment tests RED -> GREEN; complete suite 71/71. Full 24-hour MILP and fixed-commitment pricing independently rebuilt from saved artifacts. Exact objective/bound 82039.2757548886, gap 0, five startups. Latest output `results/commitment-20261011T024301Z-645b0d5f`; prior successful report predates the exported-pricing verifier and is not the final reference.
- Task 4: complete - seven reserve tests and all 78 project tests passed. P07 declares unit capabilities, zones, response and requirements; actual SPP reserve MW remains unavailable. Saved reserve/control artifacts independently rebuilt in results/commitment-20261011T025245Z-b389f850.
- Task 5: paused before starting at the user's explicit request. No quantum implementation, circuit or Qollab execution. Classical review/verification is the final action before pausing the goal.

## Sources checked

- SciPy official `milp` documentation: https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html - linear objective, integer variables, bounds/linear constraints, HiGHS wrapper, objective bound/gap/status. Solver choice will be tested locally before commitment implementation.
- Qollab terms URL https://qollab.xyz/programs/hackathon/terms was inaccessible through the web tool on this attempt. This is not evidence that account/runtime access is unavailable; verify through another supported route before deciding the Task 5 gate.

## Temporal interfaces

- Unit and DispatchCase specify every physical mapping and interval; loader validates timezone-aware contiguous durations, explicit availability, limits, ramps and initial dispatch. Shared source rows consume aggregate unit capacity. The existing SPP award model remains unchanged.
- Ruling: generate a self-contained operating-case snapshot in each result folder - later commitment metadata must not make earlier continuous study inputs unrecoverable. Cost if wrong: extra local JSON storage, all inside ignored results.

## Commitment / runtime evidence

- SciPy HiGHS exact linear MILP verified locally; sloped marginal curves with nonzero quadratic cost are rejected rather than silently approximated. P06 records synthetic startup/initial/minimum-time data and strict terminal switching policy before the full solve.
- Tiny schedule enumeration and demand-derivative checks passed. Full MILP incumbent equals its solver bound; independent primal checks validate state transitions, initial durations, minimum times, startup/shutdown ramps, physics and original costs. Exported pricing duals separately rebuild nodal prices and a bounded-segment lower bound.
- Qollab terms successfully downloaded after a network sandbox escalation. Official rules require Qiskit and a runnable Qollab free-simulator project. Archived HTML/text in ignored data/reference. Browser inventory failed twice with a trusted-node kernel failure; no authenticated workspace was inspected. User answered the workspace question by requesting a pause before Task 5; this is not a claim that the platform itself is unavailable.

## Reserve and retained reference evidence

- Same-case energy-only commitment cost 82039.2757548886; reserve-coupled cost 84723.66483083188, solver bound 84723.6648308319 and gap 0. Added reserve feasibility cost 2684.3890759432834; four startups. Independent original-parameter primal and fixed-pricing dual audits passed; this is a synthetic study, not SPP cost or quantum savings.
- Retained data/commitment_benchmark.json and results/commitment-reference-20261011T024813Z-d67804c2/reference_report.json contain both startup-cost controls, all 16 schedules each and matching exact MILP objectives. Retaining this classical reference does not start Task 5.

## Final review and rulings

- Fresh read-only review found one important verifier issue: NaN exports could be masked by max reductions. Reproduced with failing corruption regressions, added explicit finite/shape validation, and passed 80 tests. Fresh temporal/reserve studies and saved-artifact reconstruction pass after the fix; numerical objectives remain unchanged.
- Minor binding-report gap addressed with results/temporal-20261011T025244Z-38771304/binding_constraints.json: 10 named binding ramp constraints with intervals, assets, slack and duals, reconstructed from saved inputs and awards.
- Reviewer scope exclusions accepted: actual SPP operating reconstruction lacks required inputs; AC/N-1/storage/multi-product/deployment security are separate milestones; quantum work is user-paused; full MILP global bound relies on HiGHS while tiny cases are independently enumerated; production-scale performance is not claimed. Cost: these benchmark certificates establish only the explicitly modeled small test cases.

Final reviewer follow-up independently passed all 80 tests, rejected the original NaN corruption reproduction, and reloaded both new full-day studies and their certificates. No remaining important findings; readiness confirmed after fixes. No deferred minor findings. Git diff whitespace check passed; all changed/untracked project files remain inside this project. No commit or push performed.
