# Bounded QAOA commitment candidate experiment

Local run: October 11, 2026, `python -m quantum.benchmark --shots 1024 --repeats 5 --seed 2026`. Full machine-readable scenarios, source hashes, fixed schedules, all 16 oracle entries per case, original pricing certificates, complete counts, optimizer statuses, seeds and timings are retained in ignored `results/quantum-benchmark/benchmark.json`. The local environment was Python 3.12. Qiskit 2.5.2, NumPy 2.5.3 and SciPy 1.18.1. All measured circuits used Qiskit's local BasicSimulator.

## Equal-problem result

| Case | Certified minimum | Feasible / 16 | QAOA mean optimal-hit rate | Uniform | One-bit | Enumeration | Best feasible gap, all methods |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Synthetic, $10 startup | $410.00 | 9 | 73.12% | 25.10% | 38.77% | 25.00% | $0 in all five repeats |
| Synthetic, $1000 startup | $1,000.00 | 9 | 19.71% | 6.72% | 3.96% | 6.25% | $0 in all five repeats |
| Certified 24-hour neighborhood | $82,039.27575489 | 9 | 24.77% | 6.72% | 12.05% | 6.25% | $0 in all five repeats |

Each repeat gave each method 1,024 candidate occurrences. Enumeration has only 16 distinct schedules and cycles them to that occurrence budget; this makes its exact coverage and duplicate count explicit. The one-bit method counts every visited/probed candidate, including duplicate visits. Uniform and QAOA counts came from independent measured BasicSimulator runs. All methods used the same finite oracle and actual full-objective dollars. A sampled infeasible schedule receives no repair; a run with no feasible samples reports a null best result. The selected best feasible schedule in each local run was independently repriced through the original fixed-commitment LP, and its fresh certificate passed. The full-day optimum equals the certified energy-only MILP incumbent, so no improvement beneath it is possible in this neighborhood.

QAOA increased optimal-hit frequency in these local simulator samples, but produced **no best-objective advantage** at the measured budget. These three small cases do not show end-to-end speedup, SPP savings, IonQ performance or scalable optimization. The cost table is prepared with 16 classical original-model LPs for every case; growing the selected bit count makes that preparation exponential.

## Selection and overhead

The 24-hour case retains the certified MILP on/off matrix for every decision except `test_peak` and `test_local` at zero-based intervals 16 and 17, the consecutive highest-load intervals (200.000 and 199.466494 MW). Its source SHA-256 is `6307e0d3682466a6abbf4e8635192cb0696421721d577d03c686f4a14e646b6d`. The incumbent objective and bound both equal $82,039.27575489, with zero reported MILP gap and a passing original certificate. The $10 and $1000 synthetic case hashes are `dc6bba722a9babc73519fdd89506224037808fc0dc09b64f9c37450041ec491b` and `8fedd3f20da204b8e32e9e1b5162befccc5d82fc058ce12f0b3070c2c92e66b7`.

The following timing table belongs to the original reviewed local run, preserved in [its benchmark JSON](../results/cleanup-development/precleanup-quantum/benchmark.json). Fresh post-cleanup timings are recorded in the [cleanup report](../results/cleanup-development/task-1-report.md).

| Case | Certified incumbent solve | Oracle preparation, 16 LPs | Local QAOA tuning, 240 statevector evaluations | Five QAOA circuit executions | Five QAOA fresh certificate checks |
| --- | ---: | ---: | ---: | ---: | ---: |
| $10 startup | n/a | 0.225 s | 3.476 s | 0.036 s | 0.124 s |
| $1000 startup | n/a | 0.215 s | 2.372 s | 0.035 s | 0.155 s |
| 24-hour neighborhood | 0.281 s | 3.918 s | 3.306 s | 0.043 s | 2.442 s |

Execution, decode/selection and original-model verification timings for every run of every method are separate in the JSON. Shared oracle preparation applies to **all** four methods. QAOA alone incurs statevector tuning before its five measured evaluations. COBYLA reported its stopping status rather than a convergence certificate. Wall-clock figures are local observations, not backend performance estimates.

The project reorganization reran the same settings. All three cases retained the same method hit rates and zero best gaps; fresh local preparation and tuning times are in the [cleanup report](../results/cleanup-development/task-1-report.md). The original reviewed run's full JSON is preserved there separately.

## Portable Qollab upload

`python -m quantum.qollab_export` produces `results/quantum-export/qollab-upload.zip` (13,468 bytes after the folder migration; SHA-256 `6d311f87e4b58b120361b2806063d34a400d20ec689066908813286a14160264`). Its ten files are top-level `main.py`, `README.md`, `requirements.txt`, `LICENSE`; synthetic `data/case_low.json`, `case_high.json`, `oracle_low.json`, `oracle_high.json`; and `quantum/__init__.py`, `quantum/qaoa.py`. The largest uncompressed file is 44,678 bytes, under Qollab's 2 MB per-file limit. No SPP CSV, native local optimizer, cabinet server, credentials or development logs are bundled. The code is MIT licensed; the original separate SPP data rights are unchanged. The upload README discloses the source and classical oracle preparation and includes “This effort is supported by Qollab & IonQ.”

The earlier 13,461-byte [ZIP](../results/cleanup-development/precleanup-quantum/qollab-upload.zip) (SHA-256 `49e2eb50b991367b6c4c249d2b37d887635898d94483b79ef7d833a2150014fd`) and its original [benchmark JSON](../results/cleanup-development/precleanup-quantum/benchmark.json) are preserved. All ten ZIP members remain identical except for local elapsed/preparation seconds in the oracle JSON. The [cleanup invariant check](../results/cleanup-development/verify_invariants.py) compared objectives, schedules, certificates, source hashes and evaluation counts.

The upload's top-level, single-line `main` signature accepts optional `shots: int = 1024`, `seed: int = 2026`, `startup_cost: float = 10.0`, `depth: int = 2`, `restarts: int = 3`, `maxiter: int = 80`. Only startup costs 10.0 and 1000.0 are packaged. It reads the two oracle files through literal relative `open('data/oracle_...json')` paths for Qollab preload, tunes locally, and submits one eight-qubit circuit in exactly one injected-backend job. Its low four qubits carry uniform candidates and high four carry QAOA candidates. It validates complete eight-bit joint counts, derives each four-bit marginal and scores both with the same original cost table and shot count. The ideal blocks are independent; physical noise may correlate them. It prints plain JSON with joint counts, marginal counts, scores and timing. It does not call `main` itself because Qollab auto-calls it.

The upload entry was executed locally with an injected BasicSimulator and a wrapper that accepts only one `QuantumCircuit` and rejects a second job; both four-bit marginals returned valid 32-shot counts and a $410 best oracle objective. A second isolated Python process imported the **bundled** `quantum/qaoa.py`, ran the entry at 16 shots and recorded one backend job. A statevector check verified every joint basis probability against the expected QAOA probability divided by 16, and asymmetric test counts pinned the low/high bit interpretation. This verifies local package behavior only.

The user then tried the earlier two-circuit upload on a free Qollab IonQ simulator. The platform's IonQ submission route returned HTTP 400 before circuit execution: “Only job type ionq.circuit.v1 is supported.” The [official qiskit-ionq serializer](https://qiskit-community.github.io/qiskit-ionq/_modules/qiskit_ionq/helpers.html) maps a list of circuits to `ionq.multi-circuit.v1` and one `QuantumCircuit` to `ionq.circuit.v1`; this explains the request-type rejection. The trace does not establish whether Qollab's proxy or IonQ's API enforced the restriction. The user subsequently reported that the replacement single-circuit upload ran. The owner supplied a [result excerpt](../results/qollab-research/owner-trial-002.json). The controller [validated both method scores](../results/qollab-research/owner-trial-002-validation.json) against the preserved original four-bit oracle: each method has 1,024 marginal shots; uniform found 259 optimal and 576 feasible samples, while QAOA found 480 optimal and 740 feasible samples. Both selected the same certified $410 minimum with a $0 gap. QAOA tuning used 240 evaluations and stopped at its declared cap without convergence; the excerpt reports 6.4986 s tuning and 11.8672 s execution. This is a higher optimal-hit frequency in this one owner-reported trial, with no best-objective advantage or end-to-end speedup claim. The owner identified the selected backend as the Forte-1 simulator (29-qubit advertised capacity); the uploaded circuit used eight qubits. This backend label is owner-reported, with no independently retrieved backend/job record. Joint eight-bit counts were not supplied, and there is no evidence of physical-hardware execution. The trial shows no best-objective advantage or end-to-end speedup. The supplied project URL is <https://qollab.xyz/u/ytazoui/energy-grid-optimization-quant>.

For a user-run trial in the existing project, use **Code → Files → Browse** to select the verified `qollab-upload.zip`, then choose **Unpack** and **Keep and add**. Confirm the Files pane has `main.py` and `requirements.txt` at the project root, beside `data/` and `quantum/`. A `main.py` nested inside a folder explains the runtime's “nothing in root” message. Existing-project ZIP uploads skip `README.md`; paste the packaged README text into the project write-up separately. Select the free BasicSimulator first, then a free IonQ simulator if desired. Do not select a QPU for this verification.


## Actual-SPP bounded dispatch comparison (final adapter v2)

October 11, 2026: July 1 hour ending 01:00 CPT / 06:00 UTC, actual SPP offers and cleared fixed demand. The full auction price is 10.63673262 $/MWh; demand is 37492.254 MW. The new adapter selects actual dispatch quantities rather than synthetic commitment statuses.

| Method | Mean optimal-hit frequency | Trials finding optimum | Best cost gap |
| --- | ---: | ---: | ---: |
| uniform | 5.625% | 5/5 | $0.00 |
| one_bit | 19.922% | 5/5 | $0.00 |
| qaoa | 53.047% | 5/5 | $0.00 |

Five trials per method, 256 candidate occurrences per trial, seed2026, depth1, one restart, maxiter40, free local Qiskit BasicSimulator. All selected best feasible dispatches match the finite optimum and have conditional price 10.63673262 $/MWh. Exact enumeration always finds this table's optimum; all stochastic methods found it in every trial. Higher QAOA sample hit frequency in this bounded instance is not evidence of improved final cost, trial success, speedup, scalable advantage, or operational nodal LMP. One-bit samples are dependent and these are descriptive trials.

Preparation: 0.4955 s, 16 algebraic candidate-pricing evaluations; QAOA tuning: 0.1419 s, 40 evaluations, converged=False. Preparation already enumerates all candidates; other methods do not pay QAOA tuning cost. Actual counts, source hashes, frozen dispatch, selected levels, costs, conditional prices, settings and timing are retained in ignored results/market-runs/339fb0c2de7247c5be4e7e75d1318c3a/ and results/spp-qaoa-development/spp-trial.json. These development artifacts are not committed.

A first trial with an endpoint-distance selection bug was retained as spp-trial-before-ranking-fix.json; it had 13.828% QAOA hits. The corrected interval-distance rule changes selected rows and the finite table, so the final implementation was rerun once rather than choosing the better outcome from unchanged trials. The earlier synthetic Qollab $410 trial remains a separate experiment; it has not been replaced on the platform.


## Updated actual-SPP visual Qollab package

The latest qollab-upload.zip now contains root index.html/main.js/main.py, a Python runner, QAOA code, a compact actual-SPP cost/price table and visual comparison/resource inspector. No raw CSVs are included. Earlier synthetic package preserved as legacy-synthetic-upload.zip. An isolated package-directory execution verified the bundled QAOA import, one BasicSimulator backend job and all three 64-candidate totals; all selected best costs had zero gap. Real DOM rendering displayed three method cards, five resource nodes, price10.64 and correct inspector selection. No remote job was used. This is local verification only; the actual Qollab JS/Python bridge has not been run by the agent.

Current-run scores are distinct from the separately labeled recorded five-trial benchmark. The full-auction price remains a classical reference, and the graph/conditional prices replay a frozen dispatch neighborhood. Full native uploads and auction solving remain local.
