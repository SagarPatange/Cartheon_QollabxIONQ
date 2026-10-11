# Energy Grid Optimization

A Quantum Impact project investigating quantum subroutines for day-ahead energy market optimization using SPP historical market offers.

Start with [the project structure](docs/PROJECT_STRUCTURE.md), [assumptions](docs/ASSUMPTIONS.md), and [model fidelity limits](docs/MODEL_FIDELITY.md). Reusable solvers live in `optimizer/`, study and audit commands in `studies/`, and Python tests in `tests/`. Run commands below from this project folder.

The classical baseline is a continuous, energy-only, single-node auction. It retains signed offers and purchase bids and integrates block/sloped marginal-price curves. A network extension adds DC transmission flows, line limits, explicit submission bounds and optional affine loss sensitivities, with nodal prices decomposed into MEC, MCC and MLC. Its public case9 network and masked-code mapping are documented synthetic sensitivities. Neither model reconstructs SPP operational SCUC/SCED: the baseline SPP-fixed price MAE against historical SPP MEC is $20.56/MWh.

Every inferred data interpretation or modeling assumption must be recorded in [ASSUMPTIONS.md](docs/ASSUMPTIONS.md) before use.

## Local optimizer application

The default browser page is now the **SPP day-ahead market explorer**. It loads the original July 1 DA Energy Offers and DA Market Clearing files. Select an hour, filter signed offers or purchase bids, and select a resource node to inspect its source quantity range and optimized award. **RUN HOUR** solves that interval; **RUN DAY** solves all available intervals independently. Instruments show historical fixed demand, the model system price, net offer cost, net injection and original-curve verification. Net offer cost subtracts responsive purchase bid value and may be negative. These are single-node model prices, not nodal SPP LMP.

After a certified hour, **RUN QAOA COMPARISON** runs five local trials on a bounded dispatch neighborhood built from actual SPP submissions. It compares QAOA, random sampling and one-bit search against the identical finite-table optimum, showing optimal-hit rates, trial success, conditional prices and preparation/tuning overhead. This is a local BasicSimulator action, separate from the earlier synthetic Qollab demo. See [PROJECT_CARD.md](docs/PROJECT_CARD.md) for the beginner write-up, video placeholder, run instructions and result guide.

Use **UPLOAD DAY** to select matching DA Energy Offers and DA Market Clearing CSVs. The files are validated together by UTC interval, CPT label and operating day. Maximum file sizes are 24 MiB and 4 MiB respectively. Consecutive same-day subsets are supported and visibly labeled; missing fixed demand is rejected. Uploads stay under ignored `data/uploads/`, and certified runs under `results/market-runs/`. Original input files are preserved. Re-select uploaded files after restarting the application. Source/award lists use 25-row pages with internal scrolling, and **CSV** downloads the selected hour's full awards.

The explorer uses larger text and a scrolling layout. Its resource graph shows actual submissions around a schematic single-node market; it groups remaining resources explicitly and makes no transmission/location claim. The **SYNTHETIC NETWORK CABINET** link opens the existing application described below at `/test-system`. A geographic substation view needs a verified resource-to-location mapping; masked SPP codes are not assigned invented coordinates. The market upload workflow is local and separate from the portable Qollab quantum demo.

The analog control cabinet runs the declared four-unit, 24-hour case through the exact commitment optimizer and fixed-commitment pricing. It displays certified costs, awards, network flows and conditional model prices on a case9 schematic. This is a synthetic test system with a scaled historical load profile, not SPP infrastructure or an operational SPP market reconstruction. The bounded quantum candidate experiment is a separate command-line study; it does not change cabinet results.

From this project folder, use the existing project-local environment described under **Run**, then launch:

```powershell
.\start_application.ps1
```

The launcher opens `http://127.0.0.1:8765/` after its server is ready. Keep the launcher running; stop it with Ctrl+C. Choose an unused port with `-Port 8766`, or add `-NoBrowser` and open the printed URL yourself. An occupied port produces an explicit error.

On this Windows host, script execution policy blocks direct `.ps1` execution. This tested command changes policy only for that PowerShell process:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_application.ps1 -Port 8766
```

Select a unit, bus or line from the schematic or **SELECT ASSET**. Change LOAD, LINES, RESERVE, reserve mode, unit availability/CAP/RAMP/OFFER/START/IDLE, or a selected line's MW rating, then press **RUN 24H**. A line override replaces global scaling for that line; **USE GLOBAL LINE SCALE** removes it. HOUR changes only the view of the solved day. Edits and RESET mark prior results stale; RESET needs another run. Infeasible inputs show FAULT with stale prior results. RUN is disabled during a solve. The **MODEL / RUN RECORD** drawer explains scope and certificates. On narrow screens, the schematic scrolls inside its panel; the asset selector and keyboard remain available.

Each accepted run saves exact `scenario.json` and verified `report.json` under ignored `results/application-runs/<run_id>/`. A failed solve retains its scenario without a completed report. API run history and the browser's current selection last for the current process/page; saved artifacts remain on disk but are not automatically restored into a new session.

Application reading order:

1. [APPLICATION_RESULTS.md](docs/APPLICATION_RESULTS.md), [APPLICATION_DESIGN.md](docs/archive/APPLICATION_DESIGN.md), then assumptions APP01-APP04 in [ASSUMPTIONS.md](docs/ASSUMPTIONS.md): evidence, control contract and test-system limits.
2. [application/scenarios.py](application/scenarios.py), then [application/solver.py](application/solver.py): strict input transformations, existing solver calls, certificates and snapshots.
3. [application/jobs.py](application/jobs.py), [application/server.py](application/server.py), then [start_application.ps1](start_application.ps1): serialized runs, loopback API and launch.
4. [application/state.js](application/state.js), [application/diagram.js](application/diagram.js), [application/app.js](application/app.js), then [application/index.html](application/index.html) and [application/cabinet.css](application/cabinet.css): revisions, solved overlays and controls.
5. `tests/test_*.py` and [application/test_state.mjs](application/test_state.mjs): behavioral coverage. Run `.\.venv\Scripts\python.exe -m unittest discover -s tests -t . -v` and `node --test application/test_state.mjs` (Node is needed only for the JavaScript tests).

## Bounded quantum experiment

The separate four-bit QAOA experiment builds an exact classical table of full fixed-commitment objectives, tunes a circuit locally, and compares measured candidates with uniform sampling, one-bit search and enumeration. It runs two synthetic two-interval startup-cost cases and a four-decision neighborhood of the certified 24-hour energy-only solution. Its exponential oracle preparation and local tuning are included in the record. The portable Qollab comparison places one four-bit uniform sample and one four-bit QAOA sample on separate halves of an eight-qubit circuit to meet the selected IonQ simulator's single-circuit job type. The local BasicSimulator results do not establish quantum speedup or successful remote IonQ execution. Read [QUANTUM_RESULTS.md](docs/QUANTUM_RESULTS.md) for measured results, limitations and Qollab upload status.

Install the additional project-local dependency and run the reproducible benchmark and portable upload builder:

```powershell
.\.venv\Scripts\python.exe -m pip install --cache-dir results/quantum-development/pip-cache -r requirements/requirements-quantum.txt
.\.venv\Scripts\python.exe -m quantum.benchmark --shots 1024 --repeats 5 --seed 2026
.\.venv\Scripts\python.exe -m quantum.qollab_export
```

The benchmark retains full scenarios, oracles, certificates, counts, tuning records and timings in ignored `results/quantum-benchmark/benchmark.json`. The export builder writes `results/quantum-export/qollab-upload.zip` with only synthetic cases and browser-compatible quantum code. In an existing Qollab project, use **Code → Files → Browse** to select that ZIP, choose **Unpack**, then **Keep and add**. Confirm `main.py` and `requirements.txt` are at the project root beside `data/` and `quantum/`; a wrapping folder hides the runnable entry. Existing-project ZIP uploads skip `README.md`, so paste its text into the project write-up separately. Qollab supplies the `backend` global and auto-calls the top-level `main`; select a free simulator when running it there. The original 24-hour data and local optimization packages are outside that upload. Run `python -m unittest tests.test_subproblem tests.test_qaoa tests.test_benchmark tests.test_qollab_export` for focused checks.

Expected project root after **Unpack**:

```text
main.py
requirements.txt
data/
quantum/
```

Quantum reading order: [QUANTUM_DESIGN.md](docs/archive/QUANTUM_DESIGN.md) and [QOLLAB_RESEARCH.md](docs/QOLLAB_RESEARCH.md) establish the model and runtime constraints; [quantum/subproblem.py](quantum/subproblem.py) creates the certified oracle; [quantum/qaoa.py](quantum/qaoa.py) implements the exact diagonal circuit and count scoring; [quantum/benchmark.py](quantum/benchmark.py) runs equal candidate budgets and fresh original-model verification; [quantum/qollab_export.py](quantum/qollab_export.py) builds the portable package. The quantum tests cover each boundary.

## Current documentation

- [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md): current folders, commands, and retained provenance.
- [EXECUTION_RESULTS.md](docs/EXECUTION_RESULTS.md): completed diagnostics, temporal and commitment outcomes.
- [ASSUMPTIONS.md](docs/ASSUMPTIONS.md): interpretations, scope, source evidence and pending confirmation.
- [MODEL_FIDELITY.md](docs/MODEL_FIDELITY.md): supported mechanics, missing inputs and requirements for further realism.
- [FULL_DAY_RESULTS.md](docs/FULL_DAY_RESULTS.md): results, price errors, numerical verification and retained artifact links.
- [NETWORK_RESULTS.md](docs/NETWORK_RESULTS.md): network sensitivities, nodal prices and verification results.
- [DATA_AUDIT_20260701.md](docs/DATA_AUDIT_20260701.md): structure and limitations of the original offer files.

Completed designs, plans and execution ledgers remain in [docs/archive/](docs/archive/). The active cleanup plan and ledger remain under `docs/superpowers/plans/` and `docs/` during review.

## Data and licensing

Datasets come from **[SPP.org](https://www.spp.org/)** and are publicly accessible through the [SPP portal](https://portal.spp.org/pages/historical-offers).

| File in `data/` | Contents |
| --- | --- |
| `DA-ENERGY-OFFERS-202607010100.csv` | Energy offer/bid MW and price curves |
| `DA-OR-OFFERS-202607010100.csv` | Operating reserve offer prices and regulation fields; audited, not optimized |
| `DA-MC-202607010100.csv` | Historical clearing quantities, fixed demand and SMP by BAA |
| `DA-LMP-SL-202607010100.csv` | Historical settlement-location LMP and its energy/congestion/loss components |
| `DA-BC-202607010100.csv` | Historical binding constraints; diagnostics, not a network input model |
| `network_case9.json` | Public test topology/load shares and explicit synthetic mapping, ratings and loss inputs |

The files cover 24 operating-day hours. Official specifications and provenance are in `data/reference/`; [provenance.json](data/reference/provenance.json) retains reference and historical-result download URLs and hashes.

Git includes the five input CSVs and source provenance. Generated `results/`, environments, caches, logs, and downloaded reference archives/extractions stay local through `.gitignore`. Result links in the findings refer to local artifacts, which can be regenerated by running the study.

Original code and documentation are covered by the repository's [MIT license](../LICENSE). **SPP datasets, reference documents and archives are excluded from MIT and cannot be relicensed under MIT by this project.** Public accessibility does not grant relicensing or redistribution rights; SPP's applicable terms and original rights holders' rights remain applicable.

The case9 topology/load-share data are adapted from [MATPOWER's public case9 file](https://github.com/MATPOWER/matpower/blob/master/data/case9.m), with original Chow and EPRI attribution recorded in the JSON and provenance. MATPOWER's [license](https://github.com/MATPOWER/matpower/blob/master/LICENSE) explicitly excludes case data from its BSD code license; the adapted data are separately attributed and are also excluded from this project's MIT license.

## Python reading order

1. [offer_audit.py](studies/offer_audit.py): optional introduction to the input columns, curves, signed MW, repeated codes and reserve-data limitations. It inspects data and does not optimize.
2. [fidelity_validation.py](studies/fidelity_validation.py), `main()`: follow one hour from historical fixed-demand selection through curve loading, solving, verification, price comparison and award export. Historical prices are comparison outputs and never enter a solve.
3. [energy_auction.py](optimizer/energy_auction.py): the optimization engine. Read `load_curves()` and `Curve` first; then `solve()` and `_solve_numerical()`; then `clearing_oracle()` and `verify()`. `run()` and the CLI provide a separate single-hour entry point.
4. [audit_fidelity_artifacts.py](studies/audit_fidelity_artifacts.py): reloads published awards and source files to rebuild certificates, verify provenance and recompute metrics.
5. [test_energy_auction.py](tests/test_energy_auction.py) and [test_fidelity_regression.py](tests/test_fidelity_regression.py): hand-solvable examples, signed consumption, fixed demand, fallback handling and the numerical convergence regression.

The physical interpretation is: mandatory fixed demand stays fixed, while the solver chooses supply and responsive purchase quantities to minimize integrated offer cost minus bid value. Signed net supply must equal fixed demand. The balance constraint's dual gives the simplified marginal price.

Use [fidelity_diagnostics.py](studies/fidelity_diagnostics.py) to inspect the original baseline's cleared quantities and marginal submissions without changing the solve. It reads a completed fidelity folder:

```powershell
.\.venv\Scripts\python.exe -m studies.fidelity_diagnostics results/fidelity-20261010T202700Z-faa1a381
```

For the network extension, continue in this order:

1. [network_simulation.py](studies/network_simulation.py): selects the same historical fixed demand, distributes it by test-case shares, assigns submissions to synthetic nodes and runs controls and sensitivities.
2. [network_dispatch.py](optimizer/network_dispatch.py): read `Network.matrices()` for incidence, susceptance and PTDF; `_inputs()` for supplied operating bounds; `solve_network()` for the constrained LP/QP and dual price decomposition; `verify_network()` for independently rebuilt physics and original-curve primal/dual certificates.
3. [audit_network_artifacts.py](studies/audit_network_artifacts.py): reloads every exported award and price/flow record, rebuilds certificates and checks configuration, source hashes and historical comparisons.
4. [test_network_dispatch.py](tests/test_network_dispatch.py): small examples demonstrate cheaper remote supply becoming limited, more expensive local supply clearing, nodal price separation and loss pricing.

The unconstrained control reproduces the single-node result. With binding lines, awards minimize cost subject to deliverability; the last selected system-wide offer alone cannot determine every node's price. Each node's dual price measures the cost of serving an additional MW at that node.

## Run

From this project folder in PowerShell, create the local environment if needed:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --cache-dir .pip-cache -r requirements/requirements-local-lock.txt
```

Verify and run the full-day study:

On a fresh clone, download the public guide archive used for report provenance first (downloaded copies remain ignored):

```powershell
Invoke-WebRequest -Uri 'https://spp.org/Documents/75871/SPP%20Markets%20Public%20Data%20Guide%20and%20Samples%20v36%201.zip' -OutFile 'data/reference/SPP_Public_Data_Guide_v36.zip'
```

```powershell
.\.venv\Scripts\python.exe -m unittest tests.test_energy_auction tests.test_fidelity_regression -v
.\.venv\Scripts\python.exe -m studies.fidelity_validation
```

Audit the retained completed study:

```powershell
.\.venv\Scripts\python.exe -m studies.audit_fidelity_artifacts results/fidelity-20261010T202700Z-faa1a381
```

New studies create separate folders in `results/`; pass the printed folder to the audit. The retained result set contains its manifest, full report, hourly prices, all submission awards and rebuilt artifact audit.

Run the network study and audit its printed result folder:

```powershell
.\.venv\Scripts\python.exe -m unittest tests.test_energy_auction tests.test_fidelity_regression tests.test_network_dispatch -v
.\.venv\Scripts\python.exe -m studies.network_simulation
.\.venv\Scripts\python.exe -m studies.audit_network_artifacts results/<printed-network-folder>
```

The network runner uses tracked `network_case9.json` and the three energy/clearing/LMP CSVs; it does not require the downloaded reference archives. It runs all 24 hours with one baseline and four network cases per hour. Losses use supplied affine sensitivities and a reference-bus withdrawal, not branch resistance or AC power flow. Invalid or infeasible network solves stop the study and preserve a failed manifest.

For one historical-demand hour:

```powershell
.\.venv\Scripts\python.exe -m optimizer.energy_auction --hour '07/01/2026 01:00:00' --fixed-demand-mw 37492.254 --full-hour-only
```

Calling `python -m optimizer.energy_auction` without fixed demand runs a separate zero-extra-fixed-demand auction, not the historical-demand case. `--full-hour-only` avoids the smaller block-only subset, which cannot supply the main historical obligation.

For the explicitly declared multi-hour test units, read `data/operating_case.json` then `optimizer/multihour_dispatch.py`: `validate_case()`, `build_dispatch_model()`, `solve_multihour()` and `verify_multihour()`. Run its linked/unrestricted-ramp comparison with:

```powershell
.\.venv\Scripts\python.exe -m optimizer.multihour_dispatch
```

The report saves its complete input snapshot and both certified solutions. These test units are separate from the masked SPP submissions.

For commitment, continue with [unit_commitment.py](optimizer/unit_commitment.py): `validate_commitment()`, `build_commitment_model()`, `solve_commitment()`, `verify_commitment()`, then `price_fixed_commitment()` and `verify_fixed_pricing()`. Startup/no-load costs and minimum on/off times make this an exact block-offer MILP. Prices come from continuous redispatch with the on/off schedule held fixed. Read [reserve_coupling.py](optimizer/reserve_coupling.py) next for shared energy/reserve capacity, response limits and zone requirements.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -t . -v
.\.venv\Scripts\python.exe -m optimizer.unit_commitment
.\.venv\Scripts\python.exe -m optimizer.unit_commitment --reserves
.\.venv\Scripts\python.exe -m optimizer.unit_commitment --case data/commitment_benchmark.json
```

[operating_case.json](data/operating_case.json) supplies the full declared test-unit inputs; [commitment_benchmark.json](data/commitment_benchmark.json) is the retained tiny classical reference. Reports save self-contained inputs and certificates inside ignored results folders. These cases do not attach invented physical parameters to masked SPP offers. Tasks 1-4 are implemented. The bounded quantum candidate study is documented above; the exact classical optimizer remains the source of commitment and pricing certificates.

## Disclosures

OpenAI Codex assisted with research, data auditing, implementation and verification. The model uses NumPy/SciPy (BSD licenses), OSQP and Clarabel (Apache-2.0), with their own licenses. Network QPs use Clarabel; block-only network LPs use HiGHS through SciPy. The bounded experiment executes Qiskit circuits on the local BasicSimulator. The owner supplied a corrected Qollab run excerpt; its marginal scores were checked against the preserved oracle, while backend identity and joint counts remain unverified. See [quantum results](docs/QUANTUM_RESULTS.md).

This effort is supported by Qollab & IonQ.
