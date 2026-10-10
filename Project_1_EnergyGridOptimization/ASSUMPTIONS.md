# Assumptions register

Updated: 2026-10-10. Applies to Project_1_EnergyGridOptimization only.

## Standing project rule

Record every inferred data interpretation or modeling assumption here before using it. Give it a stable ID, status, evidence, impact, and a way to resolve it. Reference the applicable IDs in model documentation and experiment results. Keep superseded entries and record their replacements so earlier results remain interpretable.

The user authorized proceeding with provisional interpretations based on SPP documentation while awaiting a response from an SPP contact. That authorization does not turn an assumption into a confirmed fact.

## Documented facts

- SPP describes `1_` as resource or virtual offers and `0_` as demand or virtual bids. These prefixes do not identify physical versus virtual transactions. Multiple virtual submissions at the same masked settlement location can explain repeated codes in an hour. [SPP historical offers](https://portal.spp.org/groups/im-historical-offers)
- Demand bids are associated with physical load; virtual bids are not. Virtual offers are not associated with a physical resource. [SPP bid glossary](https://www.spp.org/glossary/?term=Bid), [SPP offer glossary](https://www.spp.org/glossary/?term=Offer)
- SPP protocol 118.1 (published June 1, 2026; internal date May 13) confirms slope interpolation, larger-MW endpoint block pricing, and constant endpoint prices (section 4.2.2.1(6), page 103). Price-sensitive demand has a zero minimum and submitted maximum (section 4.2.3.1, pages 142-143). The export flag encoding and physical offer limits remain provisional. [Protocol 118.1 archive](https://spp.org/Documents/76745/Integrated%20Marketplace%20Protocols%20118.1%20-%20Active%20Version.zip)
- An SPP storage filing describes a single offer curve with negative and positive MW for charging and discharging. This establishes a possible interpretation, not the identity of any masked resource in our files. [SPP-hosted FERC order, 2019](https://www.spp.org/Documents/60834/20191017_Order%20on%20Compliance%20-%20Order%20No.%20841%20Compliance%20Filing_ER19-460-000.pdf)
- The supplied CSVs lack explicit commitment status, startup/no-load costs, physical dispatch limits, ramp limits, initial conditions, network constraints, and reserve requirements. See [the local data audit](DATA_AUDIT_20260701.md). We have not established a public source supplying those inputs with a reliable join to these masked rows.

## Active provisional assumptions

| ID | Working assumption | Evidence and confidence | Modeling impact / resolution |
| --- | --- | --- | --- |
| A01 | `Use_Bid_Slope=1` means slope interpolation; `0` means block pricing. | Moderate confidence: field name, Boolean values in the file, and documented slope/block options. Exact export encoding remains unverified. | Selects curve construction and cost integration. Replace if SPP confirms another mapping; rerun affected results. |
| A02 | MW/price pairs are cumulative MW breakpoints and marginal prices, rather than independent incremental quantities. Below the first breakpoint, use its price; between block breakpoints, use the larger MW endpoint's price. If an entirely negative offer needs extension to zero under A05, use its last price above the final breakpoint. | Curve mechanics confirmed by protocol 118.1, section 4.2.2.1(6); applicability of the CSV encoding remains provisional. Endpoint extension is bounded by A05. | Derive segment widths from differences between MW points. Integrate marginal prices to compute cost/value; do not multiply total quantity by its terminal price. Verify current export semantics with SPP. |
| A03 | Negative MW on an offer curve represents withdrawal/consumption; positive MW represents injection/supply. | Supported by the SPP storage filing. The exact asset type is unknown. | Preserve signed MW and prices in balance and objective calculations. Do not label masked rows as batteries or crypto farms, or invent storage state-of-charge constraints. Confirm export sign conventions. |
| A04 | Preserve every CSV row as a distinct submitted curve, identified by source filename and original data-row number; repeated hour/RCode values are not deduplicated. Physical/virtual type remains unknown. | SPP explains repeated virtual submissions; the CSV has no explicit physical/virtual classifier. | Use rows as auction submissions, not independently identified physical units. Do not sum repeated codes into a generator or use them as commitment variables. Revisit only with a supported classification/join. |
| A05 | For the first simplified auction, ordinary nonnegative offer and bid domains run from zero to the largest submitted MW. An offer with negative breakpoints uses the submitted negative endpoint as its lower bound and the larger of zero and its largest endpoint as its upper bound. No extrapolation beyond these study bounds. | Explicit modeling simplification. Curve endpoints are not established physical minimum/maximum limits. | Bounds make the study finite; zero permits nonparticipation. Report results as offer-bounded auction results. Validate signed-curve endpoint treatment and replace with actual limits when available. |
| A06 | Initially treat all `0_` curves as divisible, price-responsive purchase bids; do not infer additional fixed demand from a load forecast or from the sum of bid maxima. | The file mixes demand and virtual bids and lacks an explicit fixed/price-sensitive classification. | Maximize integrated bid value minus integrated offer cost with signed supply equal to cleared purchases. This may differ from actual fixed-demand or self-scheduled treatment. Confirm how such submissions are represented before claiming operational clearing fidelity. |

## Chosen study scope (not claims about SPP operations)

| ID | Decision | Consequence |
| --- | --- | --- |
| S01 | Start with the hour ending `07/01/2026 01:00:00` CPT on July 1, 2026, duration one hour. | A reproducible first slice; no inter-hour scheduling or storage-energy coupling. |
| S02 | Energy only, one aggregated node, divisible transactions; omit reserves, transmission, losses, commitment, startup/no-load costs, ramping, and initial conditions. | A simplified auction baseline, not a reconstruction of SPP SCUC/SCED or historical LMPs. Do not report omitted constraints as satisfied. |
| S03 | Use an LP for step curves and a convex piecewise quadratic formulation for sloped curves when monotonicity supports convexity. Check monotonicity and convexity separately for supply and purchase bids. | Do not silently sort, drop, or linearize a curve to obtain convexity. Any approximation or exclusion needs its own recorded assumption and error/coverage report. |
| S04 | Consider QAOA commitment-neighborhood sampling only after a justified discrete model exists. Keep RTBM repeated-solve experiments in the backlog. | Do not invent indivisible offer blocks solely to create qubits. Additional operational inputs or explicitly synthetic scenarios are needed for commitment experiments. |

## Historical comparison conventions (2026-10-10)

- **H01 — contextual comparison, unresolved geographic scope:** historical clearing and location-price files explicitly separate `SPP` and `SWPW`. Our offer file does not identify BAA. Keep the historical rows separate, and do not assume the whole modeled fleet belongs to either one. A valid region-level replay requires a supported mapping.
- **H02 — downloaded snapshots, repricing unverified:** use the downloaded July 1 clearing and location-price files as published snapshots for now. Do not assume they are final repriced results or that their node coverage is identical. Archive source URLs and hashes with the historical comparison; verify any revision before stronger claims.
- Historical fixed demand is an observed cleared output, not automatically an additional model input. Resolve whether it overlaps exported `0_` curves before imposing it. Current A06 and solver results remain unchanged.

## Fixed-demand experiments (2026-10-10)

- **A07 — fixed demand as a separate balance obligation:** for an explicitly labeled historical-demand scenario, add the reported fixed-demand MW to the balance equation while retaining exported price-responsive bids. First-hour total exported bid capacity is only 14,252.747 MW, below the SPP fixed-demand total of 37,492.254 MW. This rules out complete representation of fixed demand in those bids, but does not rule out partial overlap. The main scenario assumes no overlap. Do not silently replace A06 or describe this as a verified operational replay.
- **A08 — scope and overlap sensitivity:** because offer BAA classification remains unknown (H01), test both the SPP-only historical fixed total and the sum of SPP plus SWPW fixed demand (40,582.231 MW). Also test an intentionally extreme overlap case: subtract the entire exported bid capacity from SPP fixed demand while retaining bid curves. This is an illustrative sensitivity bound on the added obligation, not an identified correction; overlapping rows are not known and bid maxima are not actual fixed-load awards.
- **A09 — fixed-demand prices are outcomes, not calibration targets:** retain submitted prices, quantities, and earlier domain assumptions. Compare the computed uniform price to historical SMP and MEC as separate metrics. Do not adjust demand, offer bounds, or costs solely to match an LMP. A closer price does not establish identical dispatch, constraints, costs, or quantum speedup.

## Model fidelity extensions (2026-10-10)

- **A10 — interchange is already in the submitted curves:** the current v36 public-data guide explicitly includes import interchange transactions in `1_` offers and export interchange transactions in `0_` bids. Do not add an NSI obligation to the unclassified curve auction without identifying and removing/replacing overlapping transaction rows. Source: [SPP guide and samples v36](https://spp.org/Documents/75871/SPP%20Markets%20Public%20Data%20Guide%20and%20Samples%20v36%201.zip), archived specification in data/reference.
- **A11 — no physical classification from OR overlap:** OR codes match both offer and bid rows and repeated submissions. Treat overlap as an audit signal, not proof that each matching row is a distinct physical generator. Do not infer resource MW capabilities from OR prices or mileage factors.
- **A12 — full-day validation without price calibration:** use the previously defined SPP-only and combined-BAA fixed-demand obligations for each of 24 hours. Keep all submitted curves and their study bounds. Compare each scenario to both BAA reference prices, explicitly retaining unresolved geographic scope. Do not select a scenario or adjust constraints based on its historical price error.
- **A13 — historical outcomes are diagnostics, not replacement network inputs:** binding-constraint names/shadow prices, realized generation, and realized loss/congestion price components may diagnose omissions. They do not establish PTDFs, bus mapping, loss functions, commitment states, or shared energy/reserve capability. Do not force historical dispatch residuals into balance and label them physical losses without a verified definition and overlap check.

**A14 ? distinct dispatch and pricing solutions:** protocol 118.1 section 3.1.1 describes separate SCED dispatch and pricing solutions, including composite energy offers for eligible SPP-committed fast-start resources and offer mitigation. Submitted raw curves alone cannot reconstruct those prices without resource classification, commitment history, startup/no-load inputs, operating limits, and mitigation information. Keep our balance dual labeled a simplified auction price; do not add an inferred price uplift to fit MEC. Exact operating-day effective revision remains unconfirmed.

## Pending external confirmation

Awaiting the user's SPP contact: CSV slope-flag encoding; signed-curve and fixed-demand conventions; public physical/virtual identification; and availability of operational inputs that can be joined to masked submissions. Proceed with A01-A06 and S01-S04, disclose them with results, and revise this register when new evidence arrives. Do not assume missing operational inputs are publicly recoverable.

## Change history

- 2026-10-10: Created the register after the user authorized provisional interpretations and required an easy-to-access record of every assumption. No solver results exist yet.
- 2026-10-10: Implementation clarified A02 endpoint pricing for entirely negative offer curves extended to zero under A05. This does not authorize extrapolation beyond the study bounds. All integrated costs/values use zero MW as their zero reference; signed offers can therefore have negative cost contributions. The objective is offer cost minus bid value, not production cost alone.
