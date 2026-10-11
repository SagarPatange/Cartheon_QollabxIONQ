# Analog optimizer application implementation plan

> **For agentic workers:** Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses delegated execution. Follow the selected method; check each step only after verification.

**Goal:** Deliver a working local analog control cabinet that changes physical/economic inputs and displays actual verified optimizer outputs.

**Architecture:** A Python loopback HTTP server serves project-local HTML/CSS/SVG/JavaScript. A scenario adapter validates explicit controls and runs the existing commitment and conditional-pricing solvers in one serialized worker. The browser renders the current result revision as a network schematic, instruments and hourly trace.

**Tech stack:** Existing project Python environment, standard-library HTTP/concurrency/JSON, existing NumPy/SciPy solvers, native browser HTML/CSS/SVG/JavaScript; no framework or external assets required.

**Spec:** [APPLICATION_DESIGN.md](APPLICATION_DESIGN.md), approved October 10, 2026.

## Global constraints

- Everything stays inside Project_1_EnergyGridOptimization, including environments, screenshots and results. Preserve existing work.
- Square corners on every box/panel, substation-inspired analog styling, minimal visible text. Labels and units remain legible.
- Use existing exact block-offer MILP and fixed-commitment continuous pricing; require original-parameter certificates. No simulated awards or hardcoded result values.
- All new synthetic/display/control assumptions go into ASSUMPTIONS.md before use. Case9 schematic is not geographic SPP infrastructure.
- Qollab/quantum stays paused. No cloud deployment, external message, commit or push.
- Keep scenario/result artifacts under ignored results/application-*. Use the current branch and project folder to preserve the user's scope restriction; record this isolation tradeoff in the application ledger.

## Files and responsibilities

- application/__init__.py: local package/discovery.
- application/scenarios.py: control contract, deep-copy transformation and explicit solver-input snapshot.
- application/solver.py: existing solver calls, certificates and saved scenario/output.
- application/jobs.py: single-worker lifecycle and revision-tagged results.
- application/server.py: loopback routes, bounded input parsing, static assets.
- application/index.html, cabinet.css: accessible instruments and analog panel layout.
- application/state.js: input revisions, run/poll/reset and stale-result handling.
- application/diagram.js: fixed-coordinate SVG network, selection, real flows/prices and trace.
- application/app.js: connect controls and render state; no solver logic.
- application/test_scenarios.py, test_solver.py, test_jobs.py, test_server.py: behavioral tests.
- start_application.ps1: launch using this project's .venv and open the local application.
- APPLICATION_LEDGER.md, APPLICATION_RESULTS.md: evidence, rulings, final limitations.
- README.md and ASSUMPTIONS.md: launch/reading order and registered display/scenario assumptions.

## Review focus

1. Low capacity must not silently rewrite fixed minimum output, initial state or reserve eligibility (Task 1).
2. A valid but infeasible edited case must report a fault and preserve stale prior results, never fabricated feasibility (Tasks 2-4).
3. Editing while a solve finishes must not make old output look current; hour changes must not trigger solves (Tasks 3-4).
4. Partial/nonfinite solver exports and failed pricing certificates cannot be displayed as accepted output (Task 2).
5. Diagram/input controls must remain usable on a narrower screen and by keyboard, without relying on color or mouse-only hit targets (Task 4).

## Task 1: Explicit scenario controls

**Interfaces:** scenarios.default_controls(base: dict) -> dict; scenarios.build_scenario(base: dict, controls: dict) -> dict; scenarios.configuration(base: dict) -> dict.

Control object fields: load_percent, line_percent, reserve_percent, reserves_enabled, units keyed by the four exact unit IDs, line_limits_mw keyed by existing branch names. Unit fields: enabled, capacity_percent, ramp_percent, offer_percent, startup_dollars, no_load_dollars_per_hour. All fields required; reject unknown IDs/keys, booleans as numeric values, nonfinite numbers and out-of-domain values. Defaults use 100% and original costs/availability.

- [x] Register proposed UI display coordinates and transformation assumptions; record baseline test count and existing git state in APPLICATION_LEDGER.md.
- [x] Write tests that default controls produce unchanged mathematical inputs; load 125% multiplies all nodal demands by 1.25; offer 150% changes only selected unit price values; ramp 50% changes both normal rates; startup/no-load modify only named costs; availability changes every interval for one unit.
- [x] Write tests for capacity scaling of both unit maximum and offer MW endpoints; minimum output/initial state/eligible reserve contradictions reject; line override wins over global multiplier; reserve requirements scale without altering reserve eligibility/prices.
- [x] Write input-contract tests for unknown IDs, missing fields, NaN/infinity, strings, Boolean numeric values and stated domain endpoints.
- [x] Run `.\.venv\Scripts\python.exe -m unittest application.test_scenarios -v`; observe failure before implementation.
- [x] Implement the interfaces and validate transformed scenarios using existing loaders through project-local scenario snapshots. Enforce the precise domains in the approved spec, avoiding implicit defaults for missing request values.
- [x] Run the tests to green; verify the input base object is unchanged after building edited cases.

## Task 2: Real solver execution and saved certificates

**Interface:** solver.solve_scenario(scenario: dict, output_dir: Path) -> dict. Produces exact scenario, commitment, conditional_pricing, certificates, elapsed_seconds and reserves_enabled. Save scenario.json and report.json with strict JSON (no NaN) under the run folder.

- [x] Write an integration test that default energy-only objective matches $82,039.2757548886 within $0.01, with zero reported gap and passing primal/pricing certificates. Default reserves match $84,723.66483083188 within $0.01.
- [x] Write tests that changed load alters actual dispatch/objective, reduced branch limit changes flow or yields declared infeasibility, and disabled capacity cannot receive awards. Rebuild changed outputs against the changed scenario.
- [x] Write a reserve-headroom test and an infeasible high-load/disabled-units case: raise a typed infeasible/error outcome, with no completed report. Test that rejected/nonfinite exports or certificate failure cannot return accepted data.
- [x] Observe failing tests, then implement using load_operating_case(), load_commitment_specs(), load_reserve_case(), solve_commitment(), price_fixed_commitment(), verify_commitment() and verify_fixed_pricing(). No alternative optimizer or shell-input execution.
- [x] Compare MILP and fixed pricing objective within max($0.01, 1e-8 times absolute objective). Preserve solver errors; distinguish infeasible status from unexpected failures without masking either.
- [x] Run `.\.venv\Scripts\python.exe -m unittest application.test_solver -v`; require green and saved snapshot re-verification.

## Task 3: Local asynchronous application server

**Interfaces:** jobs.RunManager.submit(controls: dict, revision: int) -> dict; get(run_id: str) -> dict; close() -> None. Public result fields: run_id, revision, status (queued/running/complete/infeasible/error), data only on complete, compact error otherwise. server.make_server(port: int, manager: RunManager) -> HTTPServer.

- [x] Write lifecycle tests: exactly one active job, duplicate active submission rejected, complete data tagged with input revision, failure/infeasibility retained, and unknown IDs return not-found. Use a bounded controllable worker in lifecycle tests; use the actual solver in an integration test.
- [x] Write HTTP tests for GET /api/config, POST /api/runs and GET /api/runs/{id}, static HTML/assets, malformed JSON, finite/body-size validation, unknown routes and path traversal. Browser-supplied paths/code are never accepted. Bind only 127.0.0.1; reject foreign-origin write requests.
- [x] Observe test failure; implement one executor worker and lock-protected state with atomic run snapshots. Static routes serve only allowlisted application files. Return bounded JSON errors rather than Python tracebacks.
- [x] Implement python -m application.server --port 8765 entry point and start_application.ps1 with project-local .venv, path-independent invocation and local browser opening. Report a busy port clearly; never kill unrelated processes.
- [x] Run `.\.venv\Scripts\python.exe -m unittest application.test_jobs application.test_server -v`; require green. Start a real local server, submit/default-poll through HTTP and confirm a passing real solution.

## Task 4: Analog control cabinet and physical network overlay

**Interfaces:** state.js manages controls/input_revision/result_revision/selected_hour/selected_asset; diagram.js renders configuration + complete result + selection. Browser modules use named exports so state behavior can be exercised independently when a local JavaScript runner is available.

- [x] Build the cabinet header, run/reset switches, status lamps, compact total cost/bound/gap/time instruments, main network panel, unit/line inspector, global controls and 24-hour trace. All rectangular shapes have zero corner radius.
- [x] Apply warm cream/gray panels, dark seams/rules, monospace numerals, muted green displays and restrained red/amber/green lamps. Use the reference photograph's industrial appearance. Keep visible prose in the optional information drawer.
- [x] Draw all nine buses, nine named lines and four units using registered schematic coordinates. Encode actual solved flow direction/utilization; show selected node load/conditional model price and unit on/off/energy/reserve. Display TEST SYSTEM scope plate.
- [x] Connect every spec control to validated request fields. Run submits a 24-hour case; hour scrubber only changes the view. Selection exposes the correct unit or branch. Reserve mode changes the actual solver case.
- [x] Implement input revision changes, explicit stale/busy/fault states, disabled duplicate RUN, stale-response protection and reset-to-default requiring re-solve. Never display preset cost numbers before a run; initial instruments use dashes.
- [x] Verify state behavior with input edits during polling, hour-only edits, reset during/after completion and fault after a valid result. Add a focused state regression if a runnable browser/JavaScript harness is available; otherwise prove these paths through live browser interaction.
- [x] Check keyboard access, accessible control names, non-color status, input units, reduced motion and readable narrow-screen stacking. At desktop width the schematic remains the dominant panel.
- [x] Launch and visually inspect the rendered application; capture screenshots inside ignored project results. Verify default and edited load/unit/line/reserve cases, displayed figures against API/saved reports, and screenshot corner/style/text requirements. Fix observed defects and recheck.

## Task 5: Whole-application verification and handoff

- [x] Run `.\.venv\Scripts\python.exe -m unittest discover -v`; all existing and new behavioral tests must pass.
- [x] Independently reload retained default and edited application run snapshots and verify commitment, reserve and conditional-pricing outputs. Require complete coverage for each supported control, not just a successful default solve.
- [x] Obtain the selected execution workflow's final fresh read-only review of the application and tests; resolve consequential findings with reproducing tests and re-verification.
- [x] Update README launch instructions and APPLICATION_RESULTS.md with actual run evidence, UI screenshots, controls, scope and limitations. Mark plan steps only from their authoritative checks. Run git diff --check and verify artifacts outside project have not been created.
- [x] Audit every approved design requirement against code, real runtime and rendered evidence. Leave goal active if anything required remains unverified; otherwise mark complete. No quantum work or push.

## Plan self-review and handoff

Every design section maps to Tasks 1-5, and each review-focus condition has a matching test/runtime check. Function names, input fields and job states are consistent across task boundaries. The interface is a new subsystem, with four tightly related implementation tasks and one final integration check. Recommendation: native execution in this session, then one fresh final reviewer; this minimizes repeated context transfer while testing interfaces as they are built.

Approved by the user on October 10, 2026 with separate implementation and review agents. Execution is tracked in APPLICATION_LEDGER.md.
