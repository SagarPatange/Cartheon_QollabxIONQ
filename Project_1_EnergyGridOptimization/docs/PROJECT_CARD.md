# Energy Grid Optimization: SPP Dispatch and QAOA

> Your write-up answers: what is it, why it matters, how the quantum part works, how to run it


**Theme:** Quantum Impact

**Qollab project:** https://qollab.xyz/u/ytazoui/energy-grid-optimization-quant

**Source:** https://github.com/SagarPatange/Cartheon_QollabxIONQ/tree/energy-grid-plan/Project_1_EnergyGridOptimization

**Demo video:** [ADD YOUR PUBLIC 2-3 MINUTE VIDEO LINK HERE; no sign-in required]

**Short description (under 240 characters):** A hybrid energy-market experiment using public SPP offers: classical dispatch and QAOA explore the same bounded subproblem, with visible marginal prices, feasibility checks and comparisons to classical search.

## Why it matters

Day-ahead energy markets must balance electricity supply and demand while controlling cost. This project explores whether quantum candidate generation can concentrate useful dispatch choices more often than classical sampling or local search. The problem is motivated by the author's previous work at Southwest Power Pool (SPP).

## What is it?

The full application loads public SPP DA Energy Offers and DA Market Clearing data for July 1, 2026, or another uploaded operating day. It solves an energy-only, single-node auction using actual signed offer/purchase-bid curves and historical cleared fixed demand. Independent checks verify balance, bounds, original-curve costs and a dual lower bound.

## How the quantum part works

A separate QAOA action builds a small neighborhood from the selected SPP hour. Up to four submissions have two declared quantity levels each; one real submission balances those changes, while all other awards stay fixed. Exact enumeration, classical random sampling, one-bit local search and QAOA use the same candidate table. Each bit selects one of two actual-resource dispatch levels. Original curve costs become an exact diagonal cost operator; alternating cost-phase and mixing layers create a distribution over those choices. SciPy tunes the angles by expected cost using local statevectors, and Qiskit samples the circuit. Infeasible choices receive a disclosed tuning penalty and cannot become valid results. The app compares feasible costs, optimal-hit frequency, trial success, conditional prices and compute overhead. A separately labeled synthetic network cabinet studies network and commitment sensitivities.

## Where each version runs

**Updated Qollab upload:** `results/quantum-export/qollab-upload.zip` now contains an actual-SPP four-decision visual replay: recorded full-auction model price, live QAOA/random/one-bit comparison, selectable resources and an inspector. It runs one injected-backend job on eight qubits using a precomputed 16-state table. Upload/unpack with root index.html/main.js/main.py, press Run and choose the free local BasicSimulator. The package and interface are locally verified; the platform bridge still needs one owner-run check before publication. The earlier synthetic demo is preserved separately as legacy-synthetic-upload.zip.

**Full actual-SPP interface:** the complete CSV-upload/Run Hour/Run Day optimizer still runs locally. Those native dependencies and the local HTTP server are not included in the Qollab replay. The replay uses computed experimental outputs and source hashes, not raw SPP datasets; it does not solve another uploaded operating day. Do not present a localhost URL as a public website.

## How to run it: full application

Use Python 3.12. On Windows, a sparse clone avoids unrelated repository paths that are not Windows-compatible:

```powershell
git clone --no-checkout https://github.com/SagarPatange/Cartheon_QollabxIONQ.git Cartheon_QollabxIONQ
cd Cartheon_QollabxIONQ
git sparse-checkout init --cone
git sparse-checkout set Project_1_EnergyGridOptimization
git checkout energy-grid-plan
cd Project_1_EnergyGridOptimization
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements\requirements-local-lock.txt -r requirements\requirements-quantum.txt
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_application.ps1 -Port 8766
```

The browser opens http://127.0.0.1:8766/ . Keep the launcher running; stop with Ctrl+C. Choose another port if occupied. Existing users can skip clone/install and launch their project-local environment.

## Use the interface

1. Select a dataset and hour ending. The default is July 1. UTC interval ends identify records; CPT is the displayed source label.
2. Press **RUN HOUR**. The large **OPTIMIZED MODEL PRICE** readout shows the classical marginal energy price in $/MWh. **RUN DAY** solves available hours independently, not a coupled 24-hour commitment problem.
3. Inspect the resource graph. Before solving it previews capacity; afterward arrows show awarded injections/withdrawals. Click a node for quantity bounds and award details on the right. Connections are schematic, not actual substations/transmission routes. Largest active resources are shown; other active resources are explicitly grouped.
4. Search/filter the submission list for any masked resource code. Repeated codes remain separate source rows. The right arrow advances pages; **CSV** downloads all awards for the selected hour.
5. Press **RUN QAOA COMPARISON** after a certified hour. It uses the free local simulator, five trials of 256 candidate occurrences per method, seed2026, depth1, one restart and a 40-evaluation tuning cap. It does not submit a remote or hardware job. Identical repeated requests reuse the local result.
6. Read the method cards and expand **TRIALS, SETTINGS & DISPATCH CHANGES** for individual trials, parameters and changed quantities. The full-auction reference is distinct from the matched small-problem optimum.
7. To use another day, press **UPLOAD DAY** and supply matching **DA Energy Offers** and **DA Market Clearing** CSVs. DA OR Offers are not used in this energy-only workflow. Consecutive same-day subsets are supported and labeled. Limits: 24 MiB offers, 4 MiB clearing. Invalid/mismatched files are rejected. Uploaded files and results remain local; re-select files after a server restart.

## Interpret the results

- **Optimized model price:** the full continuous auction's marginal energy price. It is not nodal SPP LMP: this view does not reconstruct transmission congestion or losses.
- **Net offer cost:** integrated offer cost minus responsive purchase-bid value, in dollars for the hour. It can be negative; it is not total SPP settlement expenditure.
- **Verification PASSED:** the classical result satisfies original-model checks. It does not validate omitted physical constraints or establish correspondence with real SPP dispatch.
- **Optimal hits:** percentage of candidate occurrences equal to the exact small-problem minimum. **Trials finding optimum:** how many trials found at least one such candidate. These are different measures; repeating a candidate counts as another occurrence.
- **Cost gap:** selected feasible cost minus the exact small-problem minimum. Zero means a match. No feasible sample is reported explicitly. Exact enumeration always identifies this table's optimum.
- **Conditional price:** the balancing submission's marginal price with discrete choices and other awards fixed. A kink can give a price range; a quantity bound may have no unique price. This is not an LMP calculated by QAOA or the marginal value of the full discrete optimization.
- **Historical SMP:** context only; it is not used as a solve input and is not an interchangeable nodal LMP target.
- **Timing:** candidate preparation and classical tuning are additional costs. The small candidate table is already enumerated classically; improved hit frequency is not proof of speedup, cost savings or scalable quantum advantage. Five seeded simulator trials are descriptive evidence, not a general superiority claim.

Latest bounded SPP trial: QAOA 53.047% optimal hits, classical one-bit 19.922%, random 5.625%; all found the optimum in 5/5 trials. This is one small problem and not general proof.

See docs/QUANTUM_RESULTS.md for the latest measured results and docs/ASSUMPTIONS.md for every declared modeling choice. The current model omits operational unit commitment, reserves, inter-hour ramps and actual SPP transmission topology; lower LMP alone is not the optimization goal.

## Sources, originality and license

SPP data are publicly accessible from SPP.org, including https://portal.spp.org/pages/historical-offers . Original SPP datasets/reference materials retain their own rights and are not relicensed under MIT. Project-authored code is MIT; source data are separately identified. The portable Qollab demo uses synthetic inputs and does not include the original SPP files.

The project builds on the Energy Grid Optimization code in the linked repository. Development used AI assistance through OpenAI Codex for implementation, documentation and review. Dependencies include Qiskit, NumPy, SciPy, OSQP and Clarabel. The earlier test network uses a documented public case9 sensitivity; it is not a mapped SPP grid. Exact assumptions and source provenance are included in the repository. Identify pre-existing code and hackathon contributions accurately when publishing.

**This effort is supported by Qollab and IonQ.**

## Suggested 2-3 minute demo

Introduce the energy-market problem; show Run Hour and the prominent model price; select a resource; run/show the actual-SPP QAOA comparison and explain optimal-hit rate versus trial success; show the free Qollab synthetic demo separately; finish with honest limitations and next steps. Add the public recording link above before publishing/submitting.
