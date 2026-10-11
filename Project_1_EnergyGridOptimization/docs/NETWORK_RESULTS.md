# Continuous network dispatch results

Completed local classical simulation: July 1, 2026, all 24 operating-day hours. The report uses UTC run timestamp October 11 (October 10 in Chicago).

## What changed

The network solver minimizes the same integrated offer costs minus responsive bid value as the single-node baseline. It adds explicit node assignments, DC Kirchhoff-consistent flows, branch MW limits and optional supplied affine loss sensitivities. It supports explicitly supplied tighter submission bounds/availability, without inferring physical resource identities or limits. Clarabel solves constrained convex QPs; HiGHS solves linear cases. Constrained failures stop the study rather than falling back to a single-node auction.

Nodal prices are reconstructed from the balance and branch-limit duals as MEC + MCC + MLC. With unconstrained transmission and zero losses they reproduce the original uniform price. Binding transmission limits can require more expensive local supply and separate prices across nodes.

## Scope and assumptions

The public MATPOWER case9 topology/load shares are a test network. Masked SPP codes are assigned to its nine buses by a deterministic SHA256 mapping with two preselected seeds. BaseMVA and ratings are scaled once by the maximum historical SPP fixed demand / 315 MW. Ratings use a preselected 0.25 multiplier for constrained cases and 10.0 for the control. The affine loss coefficients are fixed synthetic inputs; loss withdrawal is assigned to the reference bus. No geography, rating or loss parameter was chosen by historical price fit.

These inputs demonstrate constrained model mechanics. They do not recover SPP resource locations, transmission constraints or historical nodal LMPs. See [ASSUMPTIONS.md](ASSUMPTIONS.md), N01-N05, and [data/network_case9.json](../data/network_case9.json) for every supplied value and third-party attribution. Ramps, reserve co-optimization, commitment, storage state, contingency security, AC voltage/reactive limits and verified ISO boundary geography remain pending their required inputs.

## Full-day comparisons

Each hour runs the unchanged SPP-fixed single-node baseline plus four network cases, giving 24 baseline solves and 96 network studies. All source submissions are retained. Historical prices enter comparisons after solving.

| Case | MEC MAE vs historical SPP MEC ($/MWh) | Hours with a binding branch | Maximum within-hour nodal price spread ($/MWh) |
| --- | ---: | ---: | ---: |
| Single-node baseline | 20.5646 | N/A | 0 |
| Unconstrained network control, seed 0 | 20.5646 | 0 | <0.000001 |
| Constrained, lossless, seed 0 | 20.5830 | 5 | 1.9032 |
| Constrained, lossless, seed 1 | 20.5646 | 0 | <0.000001 |
| Constrained, affine losses, seed 0 | 20.3804 | 4 | 2.0954 |

The synthetic loss model's load-weighted nodal price has MAE $20.1845/MWh against historical reference MEC. That compares different price concepts and is a diagnostic, not evidence of accurate historical nodal pricing. All modeled reference MECs remain below historical SPP MEC for the day. Introducing these hypothetical constraints has not resolved the missing-input gap.

At the 17:00 CPT hour ending, historical SPP fixed demand is 49,221.568 MW. Historical MEC is $67.7087/MWh; the original baseline is $21.5732/MWh. The synthetic loss/congestion case yields reference MEC $21.6024/MWh and nodal prices ranging from $21.0913 to $22.1767/MWh. These are hypothetical nodes, not matched SPP settlement locations.

## Verification and artifacts

All 40 tests pass, including congestion, loss decomposition, signed consumption, slope integration, restricted domains, meshed flows, infeasibility, nodal cost derivatives and report-serialization regressions. A fresh read-only review independently passed the suite and found no blocking issues.

Each of the 96 network solutions passes independently evaluated original-curve cost and dual-bound certificates, bounds, loss-adjusted balance, line limits, Kirchhoff reconstruction and price decomposition. The unconstrained controls match the baseline objective within $0.000173 across all hours. Eight objective-perturbation checks at the first and maximum-demand hours verify nodal marginal prices; the largest difference is $0.000049/MWh.

The completed exported-artifact audit rebuilt all 505,572 award rows and 1,728 node/branch records across all 96 cases, verified source/configuration hashes and independently recomputed historical metrics. Maximum balance/Kirchhoff residual was 5.55e-10 MW; no bound or branch-limit violations were found; the largest original-curve primal/dual gap was $0.00000972. A separate negative check confirmed the auditor rejects an altered exported nodal price.

The full simulation took 334.46 seconds locally, including baseline solves, all four network scenarios, perturbation checks and CSV/report output. This is whole-study wall time, not a solver benchmark or quantum speedup.

Artifacts remain local and ignored by git:

- [Manifest](../results/network-20261011T000056Z-c2a2627e/manifest.json): exact input/source hashes, versions, configuration, scale and assumptions.
- [Full report](../results/network-20261011T000056Z-c2a2627e/network_report.json): hourly results, certificates, price comparisons and finite-difference checks.
- [Awards](../results/network-20261011T000056Z-c2a2627e/awards.csv): every submission's quantity, source row, side and synthetic node.
- [Prices and flows](../results/network-20261011T000056Z-c2a2627e/prices_and_flows.csv): nodal MEC/MCC/MLC and branch flows/limits.
- [Rebuilt audit](../results/network-20261011T000056Z-c2a2627e/artifact_audit.json): complete award/price/flow coverage and maximum residuals.

Two earlier attempts are explicitly failed manifests: the first encountered a NumPy binding-count serialization error, and the second solved all hours but encountered a NumPy Boolean in final report export. Both issues were reproduced, covered by tests and fixed before this completed rerun. Failed directories are not completed studies.

## Reproduce

From this project folder in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m unittest test_energy_auction test_fidelity_regression test_network_dispatch -v
.\.venv\Scripts\python.exe -m studies.network_simulation
.\.venv\Scripts\python.exe -m studies.audit_network_artifacts results/network-20261011T000056Z-c2a2627e
```

For a new run, replace the audit path with the printed folder. The most useful next input for historical fidelity remains a legitimate masked-code-to-physical-type/BAA/node crosswalk and matching operational network/resource parameters. Lower modeled prices alone do not demonstrate lower real operating cost or quantum improvement.
