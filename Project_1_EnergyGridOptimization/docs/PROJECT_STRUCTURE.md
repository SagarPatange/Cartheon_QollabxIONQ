# Project structure

Run all commands from the Project 1 folder. `README.md` is the starting point for the application, classical studies and the bounded quantum experiment. [ASSUMPTIONS.md](ASSUMPTIONS.md) records every interpretation and synthetic input; [MODEL_FIDELITY.md](MODEL_FIDELITY.md) explains what the SPP exports can and cannot establish.

| Folder | Purpose |
| --- | --- |
| `optimizer/` | Five reusable classical engines: auction, network, multihour dispatch, commitment and reserve coupling. Package initialization has no solver side effects. |
| `studies/` | Historical-data runners, diagnostics and saved-artifact auditors. Invoke them with `python -m studies.<module>`. |
| `application/` | Local control cabinet, HTTP API and Node state test. Launch from the root with `start_application.ps1`. |
| `application/market_*` | Default actual-SPP dataset explorer, validated two-file uploads, serialized hour/day auctions and original-curve charts. The synthetic cabinet is separately available at `/test-system`. |
| `quantum/` | Bounded local QAOA benchmark and portable Qollab upload builder. |
| `tests/` | All 156 Python regression tests; root discovery uses `python -m unittest discover -s tests -t . -v`. |
| `requirements/` | Project-local classical and quantum dependency lists and locks. |
| `data/` | Original SPP CSVs, declared synthetic test cases and source/license provenance in `data/reference/provenance.json`. SPP data retain their separate rights. |
| `data/uploads/` | Ignored local uploaded day/subday inputs with immutable IDs, original filename metadata and hashes. Never part of the MIT Qollab export. |
| `docs/` | Current assumptions, model/data explanations, study/application/quantum results, and Qollab research. |
| `docs/archive/` | Completed designs, plans and ledgers. These retain original decisions and historical paths as provenance. |
| `docs/superpowers/plans/` | Active cleanup design and plan until its review is finished. |
| `results/` | Local generated artifacts, certificates and implementation/review evidence. `results/cleanup-development/` contains baseline hashes and source snapshots for the migration. |

The first classical read is [the full-day result](FULL_DAY_RESULTS.md), followed by [the network result](NETWORK_RESULTS.md) and [the later study result](EXECUTION_RESULTS.md). For the cabinet, read [APPLICATION_RESULTS.md](APPLICATION_RESULTS.md). For the quantum experiment and completed owner-reported Qollab simulator trial, read [QUANTUM_RESULTS.md](QUANTUM_RESULTS.md) and [QOLLAB_RESEARCH.md](QOLLAB_RESEARCH.md). The exact current upload path remains `results/quantum-export/qollab-upload.zip`.

From the project root, the main checks and entry points are:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -t . -v
node --test application/test_state.mjs
.\.venv\Scripts\python.exe -m optimizer.energy_auction --help
.\.venv\Scripts\python.exe -m studies.audit_network_artifacts results/network-20261011T000056Z-c2a2627e
.\.venv\Scripts\python.exe -m quantum.benchmark --shots 1024 --repeats 5 --seed 2026
.\.venv\Scripts\python.exe -m quantum.qollab_export
```

The saved network manifest names its original flat source files and SHA-256 digests. The auditor verifies those historical bytes from `results/cleanup-development/baseline-source-snapshot/`; new runs record the new paths. This keeps the old study's source provenance intact while using the current modules to rebuild certificates. The complete move and retention inventory is in [the cleanup report](../results/cleanup-development/task-1-report.md).
