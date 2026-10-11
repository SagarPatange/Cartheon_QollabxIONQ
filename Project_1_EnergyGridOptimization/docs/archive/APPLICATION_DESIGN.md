# Analog optimizer control application - design

Status: design approved by the user on October 10, 2026. Tasks 1-4 are implemented and reviewed; Task 5 tests, retained-artifact reload and documentation audit are recorded in APPLICATION_RESULTS.md. The controller's fresh final whole-application review and scoped fix review passed. All application files and generated scenarios remain in Project_1_EnergyGridOptimization. Qollab/quantum execution remains paused.

## Purpose and acceptance

Build a local application in which the user changes physical/economic parameters, runs the existing optimizer, and sees actual dispatch, network flows, conditional nodal prices and total cost. Use the supplied substation photograph as the visual reference: square corners on every panel and box, instrument-panel styling reminiscent of early computer applications, and minimal visible text.

Success means parameter changes reach the solver, outputs pass its original-parameter certificates, and the visible network and readouts reflect those outputs. The application must also expose infeasibility and stale results honestly. It must be usable with a mouse and keyboard.

## Recommended approach and alternatives

Use a local browser application served by Python inside this project. HTML/CSS/SVG provide precise visual control; the existing project-local Python environment runs the real optimizer. A small loopback-only standard-library HTTP server avoids an additional application framework and external hosting. Python handles validated scenario construction and a single serialized solver worker; the browser polls a run ID and renders results.

A native desktop toolkit is an alternative, with more packaging work and fewer convenient diagram controls. A notebook/dashboard framework is another alternative, but its default components need substantial restyling to reproduce the requested instrument-panel appearance. The local browser approach best combines direct solver integration, controllable appearance and easy local launch.

## Screen and visual system

One control cabinet fills the screen. A narrow header contains the operating day, run/reset switches and status lamps. The main panel contains a large electrical single-line diagram of the nine-bus test network. Side panels contain a selected unit's controls and compact numerical instruments. A lower strip contains a 24-hour dispatch trace and hour selector.

Use warm gray/cream cabinet surfaces, dark engraved-looking rules, black monospace labels, muted green instrument displays, and red/amber/green lamps. Restrained blue identifies selection. Every box has a zero-radius corner; circles are reserved for lamps, rotary-style controls and electrical symbols. Use subtle depth and panel seams rather than decorative gradients or modern rounded cards. No stock hero section or explanatory paragraphs in the working screen.

Labels are short (MW, $/MWh, COST, FLOW, RAMP, RESERVE). Units stay visible beside values. Tooltips and a compact information drawer explain details without crowding the cabinet. All icon controls have accessible names; status also uses symbols/words rather than color alone. Reduced-motion preferences are respected.

## Controls and actual solver behavior

Start from data/operating_case.json, the explicitly declared four-unit case with the scaled historical SPP load profile. Default mode is its energy-only unit-commitment solve followed by continuous pricing with the commitment fixed. A reserve switch enables the existing single-product reserve model.

Global controls: load multiplier, branch-limit multiplier, reserve requirement multiplier, and selected interval. Per-unit controls: availability, maximum output multiplier, ramp multiplier, energy-offer price multiplier, startup cost and no-load cost. Selecting a bus/unit or line reveals its associated physical controls and numerical results. Editing a selected branch rating overrides the global scaling for that branch. Enforce explicit finite bounds and consistency; never silently clip infeasible values or invent capacity. Defaults reproduce the current declared case.

The hour selector changes the view of the completed 24-hour solution, not the solved horizon. Parameter edits mark the displayed solution stale; RUN solves a new complete scenario. The server snapshots exact inputs, returns objective, bound, gap, duration, commitment, energy/reserve awards, line flows, conditional prices and original-parameter verification. Economic multipliers change submitted test-unit costs explicitly; they are not arbitrary weights fitted to historical prices.

One active solve at a time; disable duplicate run submission. Result IDs prevent an old response from overwriting a newer scenario. On infeasibility, display a red FAULT lamp and a compact cause, with prior results explicitly stale. Reset restores the original configuration and requires a fresh solve. No invented output while waiting.

## Network overlay

Draw the attributed case9 topology as an electrical schematic with fixed, documented display coordinates. Line width/utilization and direction show actual solved MW flows. Bus instruments show model price and load; unit symbols show online status and energy/reserve awards. Selecting an hour updates the entire schematic and trace cursor together.

This is a physical network schematic of a public test system, not a geographic map of SPP substations. Actual SPP geography requires a verified resource/node crosswalk and network coordinates; do not place synthetic buses on real SPP substations. Geographic display can replace the schematic later when those inputs exist. A small TEST SYSTEM plate identifies the scope without excessive prose.

## Files and boundaries

Keep the UI in application/ (HTML, CSS, JavaScript, Python server/scenario adapter and tests). Provide a project-local PowerShell launch script. Store runs under ignored results/application-* with exact scenario and validated output. Reuse multihour_dispatch.py, unit_commitment.py and reserve_coupling.py rather than reimplementing solver mathematics. Record display coordinates and UI scenario assumptions in ASSUMPTIONS.md before use. Update README with launch instructions and controls.

No cloud deployment, external messages, remote simulator, Git commit or push is part of this application milestone.

## Verification

Adapter/API tests must establish default-case equivalence, that each supported control actually modifies the intended solver input, and that headroom/ramp/branch constraints remain valid. Include infeasible scenarios, nonfinite/out-of-range input rejection, serialized runs and stale-result protection. Run the complete existing solver suite.

Run the local application and verify a default solve plus changed load, unit availability, line rating and reserve requirement. Inspect rendered desktop and narrower screens for square corners, compact readable controls, diagram selection, keyboard operation and clear busy/stale/fault behavior. Compare displayed values to saved real solver outputs. Completion requires working runtime behavior and visual inspection, not a screenshot-only mockup.

## Solver-interface check and precise control contract

The current checkout supplies complete 24-hour block offers for four explicitly named units. The existing entry points are load_operating_case(), load_commitment_specs(), solve_commitment(), price_fixed_commitment(), verify_commitment() and verify_fixed_pricing(); load_reserve_case() supplies the optional reserve product. The application adapter will construct an explicit scenario snapshot and invoke these entry points. It will not run shell commands supplied by the browser.

| Control | Input changed | Proposed domain |
| --- | --- | --- |
| LOAD | All interval nodal demand MW, preserving profile and bus shares | 0-200% |
| LINE | All branch limit_mw, before selected-line overrides | 1-200% |
| Selected line MW | One named branch limit_mw across the horizon | 1-1,000 MW |
| RESERVE | All zonal reserve_requirements_mw; used only when enabled | 0-200% |
| Unit ENABLE | Selected unit availability in every interval | On/off |
| Unit CAP | Selected maximum_mw and matching submitted curve MW endpoints | 0-200% |
| Unit RAMP | Selected normal ramp-up and ramp-down rates | 0-200% |
| Unit OFFER | Selected submitted price values, retaining MW coordinates | 0-200% |
| Unit START | Selected startup_cost_dollars | $0-$10,000/start |
| Unit IDLE | Selected no_load_dollars_per_hour | $0-$1,000/hour |
| HOUR | View cursor only | All 24 solved intervals |

Startup/shutdown ramps, minimum output, minimum on/off times, initial state and reserve eligible MW remain explicit original inputs in the first interface. The adapter rejects a reduced capacity below those required physical values rather than silently changing them. Availability may legitimately make a scenario infeasible; the application reports that outcome. A zero normal ramp is allowed and means zero normal change, not unlimited capability. Unit availability applies to the full solve horizon; changing an individual hour's availability is a later control, not an implied existing feature.

Demand multiplier 100%, line multiplier 100%, per-unit multipliers 100%, original startup/no-load costs and reserves disabled reproduce the energy-only declared benchmark ($82,039.2757548886, subject to solver numerical tolerance). With reserve enabled and multiplier 100%, the declared benchmark is $84,723.66483083188. These are useful reproducibility checks, not fixed numbers for the display to substitute for a solve.

## Proposed application interface

GET /api/config returns the original explicit case, control domains and display coordinates. POST /api/runs accepts a strictly validated control object plus its client revision; it returns an opaque run ID and revision. GET /api/runs/{id} returns queued/running/complete/infeasible/error and, only on validated completion, exact scenario and verified solver outputs. Static assets are served from application/ only. The server binds to 127.0.0.1 and accepts local application-origin requests; no file paths or arbitrary code come from browser input.

The browser maintains a current input revision separately from the result revision. Any parameter edit immediately marks the old result stale. A returned run may display as current only when its revision matches current controls. Hour selection is a display action and does not invalidate a result. Before the first solve, instruments display dashes; during a solve, the RUN lamp is amber. The result drawer contains solver status, objective bound/gap and verification details without expanding the main display's text.

## Design self-review

The approved design was reviewed against the schema and existing solvers before implementation. Block-offer commitment is exact for the supplied case. Conditional model prices exclude losses in this zero-loss test case. A total 24-hour objective and an hourly nodal price have different units and are labeled separately. The schematic represents network connectivity, not geographic coordinates. The implemented version and verification evidence are recorded in APPLICATION_RESULTS.md; final whole-application review and scoped fix review passed.
