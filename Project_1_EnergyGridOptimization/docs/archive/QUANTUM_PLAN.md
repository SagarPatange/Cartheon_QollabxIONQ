# Quantum subroutine implementation plan

> For agentic workers: use superpowers:subagent-driven-development, separate implementation and read-only review agents. No commits/push; current project folder and branch preserved.

**Goal:** A reproducible QAOA commitment-candidate experiment and portable Qollab entry point, followed by the separately requested project reorganization.

**Architecture:** Exact classical cost oracle over a small selected commitment neighborhood; Qiskit QAOA proposes candidates, existing classical certificates validate them. Local SciPy tuning precedes one single-circuit backend submission in the portable Qollab upload. The original multi-circuit list was rejected by the selected IonQ simulator; see `QUANTUM_RESULTS.md`.

**Tech stack:** Python3.12 locally, Qiskit2.x, existing NumPy/SciPy, Qollab Pyodide/injected backend.

**Spec:** QUANTUM_DESIGN.md; platform contract in QOLLAB_RESEARCH.md.

## Global constraints

- All source/data/environments/plans/results stay in Project1; preserve prior work, no Git commits/push or paid hardware.
- Register assumptions before use. Same objective/constraints, finite original-parameter certificates, no fake infeasibility or simulated remote-success claims.
- At most8 bits, initial4-bit experiments; exact cost table and preprocessing overhead disclosed.
- Qollab one-job rule, literal data paths, top-level supported main signature, files below2MB, no SPP datasets/credentials in portable package.

## Review focus

Bit-order/phase errors; unexpected solver failures classified as infeasibility; malformed counts or absent feasible samples; understated preprocessing/tuning cost; second backend submission or incompatible Qollab entry point. Each is pinned by behavioral tests below.

## Task1: Exact oracle and QAOA

Create quantum/__init__.py, subproblem.py, qaoa.py and test_subproblem.py/test_qaoa.py. Own compatible pinned quantum dependency files and assumptions.

- [x] Before code, register Q01â€“Q03 for bounded oracle/penalty, QAOA parameters/seeds and simulator-only interpretation. Install compatible Qiskit2.x only in project .venv, with temporary/cache paths inside project; capture exact version and preserve existing packages.
- [x] RED tests: all16 tiny schedules decode correctly; optimum410/1000 equals exact MILP; nonselected entries unchanged; no-feasible oracle rejected; unexpected solver error propagated; exported certificates checked.
- [x] Implement `build_subproblem(case_path, fixed_on, decisions, *, reserve_enabled=False) -> dict` with explicit scenario/mapping/entries/certificates/penalty/timing. Decisions are `(interval_index, unit_id)` pairs; fixed_on has complete horizonÃ—unit shape. Reject duplicate/out-of-range/unknown decisions and more than8.
- [x] RED circuit tests independently compare Walsh reconstruction and every basis phase; normalize finite costs, remove only global phase, check sampled decode/count validation and zero-feasible result.
- [x] Implement `build_qaoa(oracle, parameters, *, measured=True)` and `tune_qaoa(oracle, *, depth=2, seed=101, restarts=3, maxiter=80) -> dict`; use only H/RX/RZ/CX plus measurements. Expose `score_counts(oracle, counts, *, shots) -> dict`.
- [x] GREEN focused unittest commands, actual tiny oracle/circuit run, report results/quantum-development/task-1-report.md and prepare task-scoped review. Do not run full suite until Task2 integration.

## Task2: Benchmarks and Qollab upload

Create quantum/benchmark.py, qollab_export.py, test_benchmark.py/test_qollab_export.py and QUANTUM_RESULTS.md. Update README launch/reading order and dependency documentation.

- [x] RED benchmark tests pin equal objective/budget interpretation, explicit no-feasible outcome, count validation, one-job guard and literal-path supported Qollab main auto-call behavior.
- [x] CLI `python -m quantum.benchmark --shots 1024 --repeats 5 --seed 2026` runs both tiny cases plus4-bit24h neighborhood selected from the certified energy-only incumbent. Select two named units and two consecutive peak-load intervals explicitly and record IDs, not hidden randomized selection. Keep tiny tuning and repeated measured evaluation independent; enumerate and one-bit heuristic use the same oracle.
- [x] Save complete metadata and certificates with overhead timings; report no advantage when no measured equal-problem benefit exists. Validate chosen schedules through original pricing certificate, not table lookup alone in local benchmark.
- [x] Export portable synthetic tiny benchmark only: standalone main.py uses injected backend, optional int/float parameters on one-line signature, local tuning and exactly one run for uniform/QAOA circuits. Provide README, requirements, MIT code license, disclosure/attribution and plain JSON output. Runtime package must not import local native optimization dependencies or HTTP server.
- [x] Exercise exported entry point using injected BasicSimulator/one-job guard, verify counts/objectives/feasibility and archive file limits. Run full Python and Node suites once after final source, fresh real benchmark, inspect outputs. Record remote execution honestly as pending if no authenticated access exists.
- [x] Separate fresh task review and final whole-subroutine review; fix consequential findings with reproducing tests and scoped re-review. Update plan status only from evidence.

Project reorganization is a subsequent scoped plan; do not move source during these tasks.
