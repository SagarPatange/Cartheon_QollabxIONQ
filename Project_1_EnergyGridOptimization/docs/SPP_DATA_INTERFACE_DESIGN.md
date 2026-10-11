# SPP data interface design

## Agreed outcome

Make the interface represent the actual SPP day-ahead dataset rather than using a synthetic network as its main view. The owner approved actual-data charts and requiring both DA Energy Offers and DA Market Clearing CSVs for each uploaded day. Keep the cabinet visual style and a single-screen 16:9 desktop layout. Keep implementation and verification focused to conserve credits.

## Main screen and workflow

1. A dataset bar shows the operating day, selected filenames, validation state and an **Upload day** action. The July 1 files already in `data/` are the initial dataset.
2. The main panel shows the selected hour's actual supply and responsive purchase curves, with clearly separated signed supply/consumption conventions, fixed demand and the solved marginal price. Label prices as **model system price ($/MWh)**.
3. A side panel shows selected resource/submission details: masked code, offer type, offered range, bid-slope setting, curve and optimized award. Preserve distinct submissions when masked resource codes repeat; virtual/physical classification is shown only when supported by the source fields and documented interpretation.
4. A compact daily panel shows historical fixed demand and, after a run, model prices by hour. Use the hour selector to inspect results. A paginated award list gives access to all submissions without placing thousands of labels on a diagram.
5. **Run hour** executes the selected interval. **Run day** executes the same auction independently for every validated interval, reporting progress and any failed/infeasible intervals accurately. Edits or dataset changes make earlier results stale; previous-day results cannot appear as current-day results.
6. Display cost, model price, net balance and verification status with explicit units. DA Market Clearing SMP may be plotted as a historical comparison, never used as a solver input. Any direct comparison remains labeled contextual because the resource-to-BAA mapping is unresolved.

The existing synthetic network cabinet remains available as a separately labeled test-system view. The current portable Qollab quantum experiment retains its own synthetic four-decision scope; adding actual SPP CSV upload to the local application does not establish a quantum solve of those files.

## Solver/data contract

Reuse `optimizer.energy_auction` for signed block/sloped curves, awards, integrated offer cost minus bid value, fixed-demand balance and original verification. The default fixed demand is the SPP row's **Cleared Fixed Demand Bid** in DA Market Clearing, preserving the documented SPP-fixed scope sensitivity. This is a single-node continuous energy-only auction: network constraints, operating reserves and inter-hour commitment/ramping are not inferred from the uploaded files.

Store uploaded inputs only under `Project_1_EnergyGridOptimization/data/uploads/<server-generated-id>/`, with original filenames as metadata, fixed internal filenames and SHA-256 provenance. Store runs under ignored project-local results. Never overwrite original datasets. Original public SPP inputs retain their separate rights and are excluded from MIT; uploaded data are not included in the Qollab ZIP.

Validate required column names, numeric finiteness, offer curves, unambiguous UTC/CPT correspondence, consistent operating-day metadata, matching interval sets and exactly one SPP fixed-demand row per interval. Reject malformed or mismatched files with a readable error. Do not silently drop invalid rows or synthesize missing demand. Support the validated interval count rather than assuming every day has 24 local hours; document timestamp/DST policy during implementation. Set explicit size limits informed by the existing input sizes, and retain the loopback/origin protections on upload routes.

## Map limitation and assumptions

The uploaded offer codes do not provide a verified resource-to-substation location mapping. A geographic substation map is deferred until such a mapping and its provenance are available. Do not place masked resources on invented locations. Record all new interpretation/validation assumptions in `docs/ASSUMPTIONS.md` before using them.

## Implementation and verification scope

Add a local dataset/run adapter and chart renderer to the existing application, reusing established solver functions and the cabinet styling. No new quantum method, external hosting, paid compute or dependency upgrade is included.

Use focused checks for CSV validation and cross-day separation, and compare one July 1 hour against the existing certified baseline. Verify a real browser upload/run and layout at the two established 16:9 sizes. Broaden checks only if a changed shared solver interface or a failure gives a concrete reason. Avoid duplicate agent reviews and repeated full-day benchmarks.

Owner approved this design on October 11, 2026. Implementation planning follows.


## Owner revision: readable resource dispatch view

Scrolling is allowed. Replace the main submission-curve panel with a selectable resource dispatch schematic and right-hand inspector. Use actual submissions/awards, show the largest active resources plus the selected resource, and disclose aggregate remainder counts and MW. Connections are single-node modeled transfers, not substations or transmission topology. Retain searchable submissions, two-file uploads, hourly/day runs and historical-demand/price context. Larger fonts take priority over fitting one 16:9 screen. Existing QAOA is not connected to the actual SPP offer auction: show its status explicitly; do not present the synthetic $410 trial as a matching comparison.
