# Submission readiness

## Implemented

- Full visual Qollab package with root index.html/main.js/main.css and Python bridge.
- All 2022–2024 selectable weeks, compact monthly simulator inputs, bundled geographic map and road paths.
- Fresh greedy/MILP weekly simulation, five classical objective comparisons and decision explanations.
- One live Qiskit backend job comparing QAOA and uniform sampling; matching-budget classical one-bit search.
- Selected-week contested assignment, exact candidate table, MILP cross-check and visible scope/timing disclosures.
- MIT code license, synthetic Kaggle attribution and separate ODbL road-data notice.

## Local verification

104 Python tests passed, including unpacked-package execution of the real freight oracle and three-method quantum
comparison on BasicSimulator. 32 JavaScript tests passed. The package contains 83 text files, largest 730,280 bytes;
all meet Qollab's 100-file and 2 MB per-file limits. No remote compute or paid hardware was used.

The unpacked-package browser harness rendered 53 geographic freight lanes, moving trucks, six classical objective
comparison rows and all three live quantum cards. At 256 candidates each, this run produced QAOA 5.078125% optimal
hits, random 1.5625% and one-bit search 0.78125%; every method found the exact $6,992.30 profit-objective score with
zero gap. This is one descriptive run, not a general superiority claim. Evidence remains locally in ignored
build/validation-result.json and build/qollab-preview.png. The harness substitutes only Qollab's runtime bridge
with local HTTP calls into the same packaged Python functions.

## Qollab verification

On October 11, 2026, the owner uploaded the package to https://qollab.xyz/u/ytazoui/trucking and answered
**“Yes—map and all three cards appear”** after the requested free built-in BasicSimulator run. This establishes
owner-reported successful platform execution; it is not an independently retrieved backend/job record.

## Owner-side submission steps

1. Upload and free-simulator preview check: completed and confirmed by the owner.
2. Keep index.html/main.js/main.css at the root and use the verified free built-in BasicSimulator configuration.
3. Add the public 2–3 minute video link to the project card/page, review the description and disclosures.
4. Publish the Qollab default version, select Quantum Impact and submit from registration before the deadline.

Publication, video and formal submission remain owner-side actions; local tests and a successful Run do not establish them.
