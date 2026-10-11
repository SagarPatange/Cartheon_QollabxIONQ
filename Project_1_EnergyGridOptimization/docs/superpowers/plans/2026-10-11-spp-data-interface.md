# SPP Data Interface Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the owner selects separate implementers. Track steps below. Preserve the existing project checkout; do not create a second copy of the data/environment.

**Goal:** Show actual SPP offer data and verified hourly auction results, with validated two-file uploads for other operating days, in the widescreen local application.

**Architecture:** Add a dataset registry and serialized market-run adapter beside the existing synthetic network application. Reuse the auction's curve parser, solver and certificate functions. The default page is a market explorer; the existing cabinet remains at `/test-system`.

**Tech Stack:** Existing Python standard library, NumPy/SciPy solver, native JavaScript/SVG and cabinet CSS; no new dependencies.

**Spec:** [Approved SPP data interface design](../../SPP_DATA_INTERFACE_DESIGN.md).

## Global constraints

- Project1 only. No commit/push, external hosting, paid compute or dependency upgrade.
- Uploads stay in `data/uploads/<server-generated-id>/`; run artifacts stay in ignored project-local results. Original datasets are never overwritten. Ignore uploads in Git.
- Reuse `optimizer.energy_auction` for signed block/sloped curves, awards, integrated offer cost minus bid value, fixed-demand balance and original verification.
- Default fixed demand is the SPP **Cleared Fixed Demand Bid**. Historical SMP is comparison data only; it never enters the objective or constraints.
- Single-node, continuous, energy-only hourly auctions. Label the model price explicitly; do not imply nodal LMP, SPP operational reconstruction or a quantum solve of uploaded files.
- Retain distinct submissions and UTC identity. No invented substation mapping. Record new assumptions in `docs/ASSUMPTIONS.md` before use.
- Reject invalid/mismatched inputs without dropping rows or inventing demand. Preserve loopback/origin protections and the existing test-system API.
- Main desktop dashboard fits 1920×1080 and 1366×768. Large award lists are paginated; detailed guides/dialogs may scroll. Smaller screens retain usable scrolling controls.
- No duplicated agent reviews or repeated full-day benchmarks. Run focused covering checks, one certified baseline comparison and a real browser upload/run; broaden only for a concrete failure or changed shared contract.

## Files and interfaces

- `optimizer/energy_auction.py`: extract `curve_from_row(row: dict, row_id: str) -> Curve`; `load_curves()` delegates to it with identical legacy semantics. No solve-equation changes.
- `application/market_data.py`: `DatasetStore(upload_root=None)`; `register(energy: dict, clearing: dict) -> dict`, `describe(dataset_id: str) -> dict`, `hour(dataset_id: str, hour_index: int) -> dict`, `curves(dataset_id: str, hour_index: int) -> list[Curve]`. File objects are `{name: str, text: str}`. Default dataset loads from the existing July 1 paths without copying/overwriting them.
- `application/market_jobs.py`: `MarketRunManager(store, output_root=None)`; `submit(dataset_id: str, hour_indices: list[int]) -> dict`, `get(run_id: str) -> dict`, `close()`. One worker; immutable dataset ID/hour IDs in every job/result; progress and per-interval success/error records. `solve_hour(curves, fixed_demand_mw) -> dict` calls existing `solve()` and `verify()`.
- `application/server.py`: serve `/` as the market explorer and `/test-system` as the existing cabinet; retain `/api/config` and `/api/runs` for the cabinet. New routes: `GET /api/market/config`; `POST /api/market/datasets`; `GET /api/market/datasets/<id>/hours/<index>`; `POST /api/market/runs`; `GET /api/market/runs/<id>`. Market assets added to the explicit static allowlist.
- `application/market.html`, `market.js`, `market_charts.js`, `market.css`: data-driven screen, upload dialog, input/run state, source-row/award pagination, charts and widescreen arrangement. Reuse palette/typography; avoid importing cabinet `app.js` into the market page.
- `tests/test_market_data.py`, `test_market_jobs.py`, `test_market_server.py`: focused behavioral checks. Update existing server expectations only where the default page deliberately changes.
- `README.md`, `docs/ASSUMPTIONS.md`, `docs/PROJECT_STRUCTURE.md`: current launch/workflow/model limits. Implementation evidence in `results/spp-interface-development/`.

Dataset metadata includes `dataset_id`, `operating_day`, original filenames, SHA-256 hashes, and ordered hours `{index, utc_end, cpt_end, fixed_demand_mw, historical_smp, submission_count}`. Hour details include submissions `{row_id, rcode, side, slope, points, lower_mw, upper_mw}`. Results include the same dataset/hour identity, original quantities keyed by row ID, objective dollars, model price, net injection/withdrawals and certificate. Do not label unsupported physical/virtual classifications.

Upload JSON contains the two file objects. Limit raw CSVs to **24 MiB energy / 4 MiB market clearing**, and upload request bodies to **32 MiB** (existing energy file is 12,004,097 bytes). Apply the larger limit only to the upload route; preserve existing small-request limits. Reject unsupported content type, malformed JSON, oversized files and malformed CSV. Use server-generated directories and fixed internal filenames; original filenames are metadata, not paths.

## Review focus

1. Two files have different days/intervals, duplicate SPP rows or invalid numeric fields: reject before activation/persistence.
2. DST repeats local hour labels: key/solve by UTC; keep distinct submissions without merging repeated CPT intervals.
3. A dataset/hour is changed during a solve: display only matching immutable result identity; do not attach old awards to a new dataset.
4. Signed negative offer MW and responsive purchase bids: retain original convention and distinguish resource quantity from net system injection.
5. A day has an infeasible/error interval: report partial completion honestly, with progress and each affected interval, without declaring all results verified.

## Task 1: Dataset adapter and reusable parsing

- [ ] Add focused fixture tests for valid two-hour inputs, mismatched UTC sets/days, duplicate headers/SPP rows, NaN demand/price, invalid curve/field counts, repeated CPT labels with distinct UTC, same RCode on separate submissions, filename traversal and failed registration leaving originals unchanged.
- [ ] Run new tests and confirm they fail because the adapter/parser does not exist.
- [ ] Extract the shared curve parser; validate/index both CSVs by UTC. Derive the operating day from CPT hour-ending intervals using the existing SPP convention (midnight is the preceding day's final interval). Require consecutive UTC hours and one common operating day; allow 23/24/25 intervals. Validate CPT correspondence against market-clearing `Interval` and offer `CPTHourEnd`. Avoid using CPT alone as a key.
- [ ] Populate the dataset metadata/hour contract above. Keep filenames escaped in the UI; register only completely validated data and save hashes/metadata alongside uploaded inputs. Add `/data/uploads/` to project `.gitignore` and document assumptions.
- [ ] Run `python -m unittest tests.test_market_data tests.test_energy_auction -v` in the project venv, with TEMP/TMP under project results. Record command/results.

## Task 2: Certified runs and local API

- [ ] Add job/API tests: solve a hand-solvable hour, reject unknown dataset/hour and duplicate/out-of-range indices; enforce one active market job; preserve dataset identity/progress; report a mixed successful/infeasible day; reject bad Origin/Host, wrong content type and oversized upload; retain test-system routes and shutdown behavior.
- [ ] Implement the manager and routes above. Do not parallelize hourly solver calls. Save dataset provenance, each interval's inputs/awards/certificate and final run summary under `results/market-runs/<run-id>/`.
- [ ] Use the real existing July 1 first hour once: compare objective/awards verification and fixed demand with the retained SPP-fixed certified baseline, using the same file bytes and interpretation. Do not rerun the 48-scenario study.
- [ ] Run covering market/job/server tests and existing server tests; record exact results. Do not run the unrelated quantum benchmark.

## Task 3: Actual-data dashboard and upload workflow

- [ ] Build the default explorer: dataset/day bar, upload dialog, hour selector, Run hour/Run day and progress, cost/price/demand/balance/certificate instruments, supply/purchase submission filter and paginated rows (25 per page).
- [ ] Plot selected submissions from their exact source points with proper stepped/sloped curves and optimized award markers. Label the resource quantity axis; show fixed system demand separately so it cannot be mistaken for the selected resource's quantity. Provide supply/purchase filters rather than drawing thousands of overlapping curves. Daily demand and prices use separate labeled axes or adjacent plots. Keep full results accessible through pagination/download.
- [ ] Show each source row's masked code, supply/purchase interpretation, `Use_Bid_Slope`, source MW bounds and award. Display price/cost signed values honestly. Keep historical SMP comparison explicitly contextual. Preserve the synthetic cabinet link.
- [ ] Implement dataset/hour state separation and busy/error handling. Results arriving for a different dataset cannot update current instruments. Selecting an hour while a day runs can show only that run's completed matching intervals.
- [ ] Verify real browser default-day selected-hour solve, upload of a small valid second-day fixture and result separation, malformed/mismatched-file error, and viewport bounds at 1920×1080 and 1366×768. Inspect screenshots and adjust only demonstrated layout issues.
- [ ] Update README/structure/design status and save a concise evidence report. Perform one final source review against this plan; no overlapping review passes. Keep work local on the existing branch.

## Plan self-review

Each design requirement is assigned above: actual curves/awards and widescreen screen in Task 3; valid two-file/day ownership, UTC/DST/data rights in Task 1; independent certified hour/day execution and failure progress in Task 2. Interfaces and dataset/run IDs are consistent across tasks. All five review-focus cases have covering checks. Existing network and quantum algorithms are outside the implementation scope.

Pending owner plan review and execution-method selection. Native execution is recommended because dataset, API and UI interfaces are tightly related and the owner asked to conserve credits.


## Owner revision: readable resource dispatch view

Scrolling is allowed. Replace the main submission-curve panel with a selectable resource dispatch schematic and right-hand inspector. Use actual submissions/awards, show the largest active resources plus the selected resource, and disclose aggregate remainder counts and MW. Connections are single-node modeled transfers, not substations or transmission topology. Retain searchable submissions, two-file uploads, hourly/day runs and historical-demand/price context. Larger fonts take priority over fitting one 16:9 screen. Existing QAOA is not connected to the actual SPP offer auction: show its status explicitly; do not present the synthetic $410 trial as a matching comparison.
