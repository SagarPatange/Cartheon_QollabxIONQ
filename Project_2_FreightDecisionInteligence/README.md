# Freight Decision Intelligence

A truckload dispatch simulator: loads are tendered over time across US lanes, and different dispatch policies,
classical and quantum, decide which loads to accept and which truck hauls each. Every policy runs on the same
stream of loads and is scored the same way.

This effort is supported by Qollab & IonQ.

## Data

The load stream, lanes, rates, facilities and fleet come from the **Logistics Operations Database** on Kaggle,
a synthetic three-year dataset of a US over-the-road truckload carrier (MIT). The imported tables and the changes
made to them are in `data/kaggle_logistics/README.md`; what the data contains and where it is unrealistic is in
`docs/data_profile.md`.

## Run the dispatch simulator

```sh
npm run serve        # starts tools/serve.py; open http://localhost:8022, pick a month and week, press "Simulate week"
npm test             # page logic
../.venv-project2/bin/pytest -q   # simulator and data tools
PYTHONPATH=. ../.venv-project2/bin/python tools/run_simulation.py 2022-03-07 2022-03-13   # totals in the terminal
```

The simulator (`freight_sim/`) follows Powell's framework: the state a dispatcher sees (`state.py`), the decision
it returns (accept with a truck, decline or hold, each with a reason), new tenders as exogenous information, the
discrete-event transition (`simulator.py`) and profit as the objective.

A run covers one of the first 4 weeks of a month (Jan 2022 – Dec 2024); week *n* starts on the month's *n*-th
Monday.

Policies (`freight_sim/policies/`): **greedy** gives each load, in pickup order, the nearest free truck with the
right trailer; **milp** solves the whole epoch as one load–truck assignment with SciPy's `milp` (HiGHS), maximising
the chosen **objective** (`objectives.py`; greedy ignores it):

| Objective | Maximises |
|---|---|
| Max profit | revenue − cost; money-losing pairs are skipped |
| Customer satisfaction | loads covered over the week, even at a loss; prefers trucks that are free again soon |
| Low cost | profit with empty miles counted 3×, so only nearby trucks go |
| Max revenue | top-line revenue, profitable or not |
| Balanced | profit + a bonus per load − empty miles − lateness |

On the week of 2022-03-07 (seed 1): greedy covers 243 loads for $171k profit; max profit 177 loads, $211k; customer
satisfaction 266 loads, $140k; low cost 157 loads, $214k with 3.3 % empty miles; max revenue $717k revenue but
$110k profit; balanced 174 loads, $210k.

The page explains the run two ways. **Decision by decision** steps through the dispatcher's decision times and
shows, for each load, what was decided and why. **Compare objectives** runs the same week and seed under greedy and every objective
(`GET /api/compare?start=…&seed=…`) and marks the best value in each column. SciPy is bundled on Qollab; OR-Tools is not. Design and defaults:
`docs/superpowers/specs/2026-10-10-dispatch-simulator-design.md`.

## Bounded quantum experiment (QAOA on a contested dispatch decision)

Following Project 1's QAOA study, `freight_sim/quantum/` takes a small, contested piece of one real decision epoch
(a few loads competing for the same trucks, at most 8 load–truck pairs, one qubit each) and builds an exact table of
every possible assignment: valid ones score the objective's total, ones that use a truck or a load twice get a
penalty. The table's best assignment is checked against the MILP. QAOA (exact diagonal cost, RX mixers) is tuned
locally on a statevector, then sampled with uniform sampling in **one backend job** (a joint circuit on disjoint
qubit blocks); one-bit search gets the same candidate budget classically.

Week of 2022-03-07, Monday 09:00 (157 open loads, 92 free trucks): three loads compete for one truck, 8 pairs, 256
assignments of which 39 are valid. 1,000 shots each on a noiseless simulator (depth 1):

| Method | Valid samples | Optimal samples | Best found |
|---|---|---|---|
| Uniform sampling | 14.5% | 1.4% | optimal |
| One-bit search | 17.4% | 1.2% | optimal |
| QAOA | 42.2% | 4.8% | optimal |

QAOA concentrates samples on valid and optimal assignments, but building the table takes 2⁸ classical evaluations and
tuning is classical too, so this is no speedup; the exact-diagonal circuit is also deep (thousands of CNOTs at depth
2), which noisy hardware would not tolerate. One run is not statistical proof.

```sh
python tools/build_quantum_oracle.py --start 2022-03-07 --objective profit   # → data/quantum/freight_oracle.json
python tools/build_qollab_quantum.py                                          # → build/qollab-quantum.zip
```

The ZIP holds `main.py`, the two quantum modules and the table. In a Qollab project use **Code → Files → Browse**,
pick the ZIP, choose **Unpack**, and check that `main.py` sits at the root next to `data/` and `freight_sim/`.
Qollab supplies `backend` and calls `main()` with the Run settings (shots, seed, depth, restarts, maxiter). The
quantum tests (`tests/freight_sim/test_quantum_qaoa.py`) skip where Qiskit is not installed.

## Rebuild the data

```sh
python tools/import_kaggle_logistics.py path/to/unzipped/kaggle/files          # → data/kaggle_logistics/
python tools/build_dispatch_map_data.py path/to/2023_Gaz_place_national.txt     # → data/dispatch_map/
python tools/build_lane_routes.py                                              # → data/osm_routes/ (calls OSRM)
```

## Disclosures

**Prior work:** none. All code was written during the build window (first code commit Oct 10, 2026). The QAOA
circuit, tuning, scoring, one-bit search and joint one-job comparison in `freight_sim/quantum/` are ported from our
team's Project 1 (`Project_1_EnergyGridOptimization/quantum/`, same repository, MIT) and adapted to dispatch.

**Open data used:**

- **Loads, lanes, rates, facilities and fleet:** the "Logistics Operations Database" by yogape on Kaggle, a synthetic
  dataset of a US truckload carrier, MIT license (copy in `data/kaggle_logistics/LICENSE`; driver names, license
  numbers and birth dates removed on import).
  https://www.kaggle.com/datasets/yogape/logistics-operations-database
- **City coordinates:** US Census Bureau 2023 Gazetteer of places, public domain.
- **Road paths and drive distances** (`data/osm_routes/`, **ODbL, not MIT**) and the map tiles: © OpenStreetMap
  contributors, routed with the public OSRM demo server. See `data/osm_routes/NOTICE.md`.

**Libraries:** SciPy 1.14.1 (BSD-3-Clause) for the MILP policy (HiGHS solver) and QAOA tuning (COBYLA), Qiskit
2.5.2 (Apache-2.0) and NumPy (BSD-3-Clause) for the quantum experiment, Leaflet 1.9.4 (BSD-2-Clause) from the jsDelivr
CDN for the map, and pytest and Ruff (MIT) for tests and linting.

**AI tools:** Claude Code (Anthropic) was used to research datasets, write code and tests, and draft documentation.
