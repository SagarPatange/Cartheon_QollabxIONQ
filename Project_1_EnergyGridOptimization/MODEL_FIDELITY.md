# Model fidelity and the current information limit

This project solves a submitted-curve, single-node, energy-only convex auction. It preserves the available offer/bid curves and adds explicitly labeled historical fixed-demand obligations. It is a historical-conditioned economic reference, not a reconstruction of SPP day-ahead unit commitment, operational dispatch, or settlement pricing.

The completed [full-day study](FULL_DAY_RESULTS.md) validates 48 scenarios, but SPP-only modeled prices have $20.56/MWh mean absolute error against historical SPP MEC. Numerical accuracy does not close the missing-input gap.

## What has been made faithful

- All source submissions are retained, including duplicate masked codes, signed offer quantities, negative prices, and slope/block curves. Source-row IDs remain recoverable in awards.
- Integrated marginal offer costs minus bid value are minimized. Curve mechanics agree with SPP protocol 118.1 sections 4.2.2.1(6) and 4.2.3.1. The Boolean export flag remains provisional (A01).
- Fixed demand is mandatory in the model balance, in addition to cleared responsive purchases. Partial overlap with exported bids is unresolved; the current public guide records a 2020 addition of fixed-demand bid data. Capacity evidence rules out full representation, not partial representation (A07).
- Imported/exported transactions are already in the energy export. Historical NSI is not added again (A10).
- Every accepted solution passes balance, bounds, original-curve objective, and primal/dual optimality checks. An analytical marginal-price clearing method provides a separate matrix-free reference.
- Numerical convergence is assessed separately from economic fidelity. A rejected QP result is retained as diagnostic metadata; certified marginal clearing solves exactly the same model. Such a fallback is not counted as an independent optimizer comparison.

## Capability matrix

| SPP component | Evidence available | Implemented treatment | Missing information / consequence |
| --- | --- | --- | --- |
| Energy offer and responsive bid curves | 126,393 July 1 submissions, ten MW/price pairs, slope flag | Full continuous curves; integrated costs/value | Exact flag encoding still requires confirmation |
| Fixed demand | Historical aggregate cleared fixed-demand MW by BAA | Historical-conditioned SPP-only and combined-demand sensitivities | Submitted fixed-demand mapping and overlap unresolved; not an ex-ante load reconstruction |
| Geography / interconnection | Clearing and LMP outcomes have SPP and SWPW; offer rows do not | Compare references separately; do not assign masked rows to regions | Reliable masked RCode-to-BAA/bus mapping absent; a combined case is not an interconnected-grid simulation |
| Physical versus virtual submissions | Mixed exports; overlapping OR codes and repeated energy rows | Preserve each submission; no resource classification or deduplication | Cannot treat all offers as physical units or impose shared unit constraints |
| Physical energy limits | Submitted curve endpoints | Disclosed study bounds, zero-to-endpoint except signed curves | Protocol allows constant endpoint pricing beyond curve endpoints; physical min/max limits are separate and unavailable |
| Unit commitment | No startup/no-load, minimum up/down time, commitment status or initial state | Independent continuous hours | Cannot construct defensible commitment binaries, multihour starts, or actual SCUC production costs |
| Ramps and storage | Signed curves; no ramp limits, efficiency, energy capacity or state of charge | Signed power balance only | Cannot reproduce temporal feasibility or identify asset type from sign |
| Reserves and energy coupling | OR offer prices/factors; aggregate cleared quantities | Audit only; energy-only scope retained | No per-resource eligible MW, dispatch status, shared capability, reserve-zone/physical mapping or full requirements |
| Transmission congestion | 705 historical binding rows with names/shadow prices, all Interconnect E | Diagnose omitted constraints | No matching PTDFs, monitored limits/flows, contingencies or bus injection mapping; cannot impose SCED flow constraints |
| Marginal losses | Historical nodal MLC | Compare outcomes only | No network loss model; historical balance residual is not an identified loss function |
| Settlement pricing / fast-start / mitigation | Protocol describes a distinct pricing SCED | Auction dual labeled simplified marginal price | Missing fast-start classification, commitment details, composite startup/no-load additions and mitigation decisions; raw offers alone cannot reproduce MEC |
| Historical LMP | Location prices decomposed into MEC, MCC and MLC | Compare uniform modeled price to BAA MEC and separately published SMP | No single uniform price can reproduce nodal congestion/loss variation; SMP and MEC are retained separately |
| Actual cost / savings | Aggregated historical clearing quantities and prices | Welfare objective and numerical quality reported | Objective is not realized production cost, settlement expenditure, or a demonstrated operational saving |

## Source evidence

The current [public-data guide and samples v36](https://spp.org/Documents/75871/SPP%20Markets%20Public%20Data%20Guide%20and%20Samples%20v36%201.zip) was published September 24, 2026; its internal specification is dated September 17. It confirms that energy exports mix resource/virtual/import offers and demand/virtual/export bids. Public named settlement-location, participant and interchange mappings in its samples do not contain the masked RCode key needed by these submissions. Aggregate headroom/floorroom and generation capacity are not individual operating limits.

[Integrated Marketplace protocol 118.1](https://spp.org/Documents/76745/Integrated%20Marketplace%20Protocols%20118.1%20-%20Active%20Version.zip) was published June 1, 2026, before the study day, and carries an internal May 13 version date. Its exact effective revision on July 1 is not independently confirmed. Sections 3.1.1, 4.2.2.1(6), 4.2.3.1, and 4.5.3.1 establish separate dispatch/pricing solutions, curve construction, bid bounds, and nodal price components. This is stronger source evidence than the older version initially consulted; it does not resolve all export fields.

Archives, extracted specifications, URLs, hashes and publication dates are in `data/reference/provenance.json`. Binding data source: [July 1 day-ahead binding constraints](https://portal.spp.org/file-browser-api/download/da-binding-constraints?path=/2026/07/By_Day/DA-BC-202607010100.csv). All modeling inferences are recorded in [ASSUMPTIONS.md](ASSUMPTIONS.md), especially A01-A14, S01-S04 and H01-H02.

## How to improve fidelity further

The next useful input is a legitimate crosswalk from masked submissions to physical/virtual type, BAA and network nodes. With it, obtain matching physical operating limits, startup/no-load offers, commitment/initial state and minimum run/down times, ramp/storage parameters, reserve capabilities/requirements/zones, and the applicable network/PTDF/contingency/loss model. Pricing reproduction also needs fast-start and mitigation inputs. These are dependencies, not facts assumed to be publicly available.

Additional public downloads such as reserve MCP, fuel-on-margin, aggregate headroom/floorroom or generation by fuel can improve diagnostics, but cannot supply those missing joins or reconstruct unit/network constraints. Changing data solely to fit historical prices would conceal the information gap. A quantum subroutine should target a supported discrete or constrained problem once those inputs exist; this continuous auction by itself does not justify a quantum advantage claim.

## Reproduce

From this project folder in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m unittest test_energy_auction test_fidelity_regression -v
.\.venv\Scripts\python.exe fidelity_validation.py
```

The full-day study runs 24 hours with both fixed-demand scenarios and records every accepted award. Historical prices never enter an optimizer. Reports distinguish independent QP comparisons from analytical fallbacks; validity is established against the original curves and dual bound, not from a solver status alone. Run directories remain separate, and failed studies must not be interpreted as completed reports.
