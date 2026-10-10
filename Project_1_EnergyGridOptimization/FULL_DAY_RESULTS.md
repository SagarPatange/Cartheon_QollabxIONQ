# Full-day historical-demand validation: July 1, 2026

## Finding

The submitted-curve auction is numerically certified for all 24 operating-day hours under both disclosed fixed-demand scenarios. **It does not closely reproduce SPP historical energy prices.** The SPP-only scenario is below historical SPP MEC in every hour, with mean absolute error **$20.56/MWh**, RMSE **$26.38/MWh** and maximum error **$51.83/MWh**. A lower modeled price is not evidence of a better operating solution.

The current formulation is the strongest defensible continuous energy auction supported by these exports and the documented interpretations; faithfully reconstructing SPP pricing requires additional identified physical, geographic, network, reserve and commitment/pricing inputs. [The capability matrix](MODEL_FIDELITY.md) explains the limits. This is not a claim that all SPP mechanics have been reproduced or that prices are approximately matched.

## Numerical evidence

- 48 accepted studies, 24 hours, both SPP-only and combined-BAA fixed-demand obligations; all curves retained and no fitting to historical prices.
- 47 independently certified OSQP results agree with analytical marginal clearing; maximum objective difference **$0.000182**.
- One sixth-hour combined-demand QP result reported solved but violated the 1e-6 MW award-bound tolerance. It was rejected. The accepted replacement is analytical clearing of exactly the same model, with its own primal/dual certificate; it is excluded from independent optimizer counts. Rejected diagnostics remain in the report.
- 24 analytical/regression tests pass. A fresh read-only reviewer additionally tested 60 deterministic randomized convex cases, finding no consequential mathematical defect (maximum optimizer/reference difference below $0.0000008). Review scope is this continuous model, not operational SPP equivalence.
- The full-day run took about 166 seconds on this local environment, including input reads, certification and award exports. This is an observed execution time, not a Gurobi/CPLEX or quantum speedup comparison.

## Prices

Prices below are dollars/MWh. The uniform modeled price is compared with historical MEC, rather than a selected congested node's LMP. SMP remains a separate published reference. Both geographic assignments remain unresolved because masked offer rows have no verified BAA mapping.

| CPT hour ending | SPP-fixed scenario | Combined-fixed sensitivity | Historical SPP MEC |
| --- | ---: | ---: | ---: |
| 07/01/2026 01:00:00 | 10.6367 | 11.7483 | 17.7990 |
| 07/01/2026 04:00:00 | 5.0100 | 8.9400 | 8.5730 |
| 07/01/2026 12:00:00 | 17.5328 | 18.2000 | 35.6702 |
| 07/01/2026 20:00:00 | 22.3900 | 24.2000 | 74.2243 |
| 07/02/2026 00:00:00 | 14.3300 | 15.6095 | 24.4800 |

| Scenario / reference | MAE | RMSE | Signed bias | Maximum absolute error |
| --- | ---: | ---: | ---: | ---: |
| SPP fixed / SPP_mec | 20.5646 | 26.3846 | -20.5646 | 51.8343 |
| SPP fixed / SPP_smp | 20.5221 | 26.3291 | -20.5221 | 51.8320 |
| SPP fixed / SWPW_mec | 11.7532 | 13.9431 | -11.0570 | 31.0215 |
| SPP fixed / SWPW_smp | 11.6655 | 13.8833 | -10.9639 | 31.0211 |
| Combined fixed / SPP_mec | 19.0921 | 25.3627 | -19.0144 | 50.0243 |
| Combined fixed / SPP_smp | 19.0497 | 25.3073 | -18.9718 | 50.0220 |
| Combined fixed / SWPW_mec | 10.3591 | 12.6425 | -9.5068 | 29.7444 |
| Combined fixed / SWPW_smp | 10.2714 | 12.5854 | -9.4137 | 29.7440 |

The combined-demand case has somewhat smaller SPP price errors, but that does not identify it as the correct scope. Treating potentially distinct interconnections as one unconstrained pool is a sensitivity, not a validated model. No case is selected based on best price error. Historical fixed demand is a cleared outcome; its use conditions this study on history and does not demonstrate a predictive ex-ante replay.

## Why the gap remains

The model permits independent submitted curves over disclosed study bounds. It cannot identify physical resource limits or link duplicate masked codes into units. It omits network flows/losses, shared energy/reserve capability, commitment and temporal constraints, and the distinct pricing solution's fast-start/mitigation adjustments. Public outcome data reveals congestion (19?40 binding records each hour) but supplies no input matrix that could enforce those constraints. Price-error attribution among these omissions is not identified; do not manufacture an uplift or constraint solely to remove the error.

Exported bid capacity is smaller than reported SPP fixed demand in all 24 hours, ruling out complete fixed-demand representation in the bids. The guide's revision history nevertheless says fixed-demand data was added; partial overlap remains unresolved. Assuming all bids are separate, or assuming a geographic assignment, must remain disclosed sensitivities.

## Artifacts and reproduction

Completed run: [fidelity_report.json](results/fidelity-20261010T202700Z-faa1a381/fidelity_report.json), [all hourly prices](results/fidelity-20261010T202700Z-faa1a381/hourly_prices.csv), [252,786 row awards](results/fidelity-20261010T202700Z-faa1a381/hourly_awards.csv), and [artifact audit](results/fidelity-20261010T202700Z-faa1a381/artifact_audit.json).

The audit reloads the source curves, checks each source-row award exactly once per scenario, rebuilds feasibility/objective/dual certificates from exported quantities, verifies input hashes, checks historical demand/MEC/SMP against raw files, and recomputes all metrics. Superseded and interrupted runs were removed during cleanup; this completed full-day study is the retained result set. Rejected numerical diagnostics from this study remain in its report.

```powershell
.\.venv\Scripts\python.exe -m unittest test_energy_auction test_fidelity_regression -v
.\.venv\Scripts\python.exe fidelity_validation.py
.\.venv\Scripts\python.exe audit_fidelity_artifacts.py results/fidelity-20261010T202700Z-faa1a381
```

A new study produces a new folder; pass that folder to the audit. Inputs and reference provenance are described in [model fidelity](MODEL_FIDELITY.md) and [assumptions](ASSUMPTIONS.md). All work remains inside this project folder. No changes have been committed or pushed during this fidelity milestone.
