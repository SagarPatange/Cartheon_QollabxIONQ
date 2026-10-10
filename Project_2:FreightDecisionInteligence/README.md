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
npm run serve        # starts tools/serve.py; open http://localhost:8022, pick a week, press "Simulate week"
npm test             # page logic
../.venv-project2/bin/pytest -q   # simulator and data tools
PYTHONPATH=. ../.venv-project2/bin/python tools/run_simulation.py 2022-03-07 2022-03-13   # totals in the terminal
```

The simulator (`freight_sim/`) follows Powell's framework: the state a dispatcher sees (`state.py`), the decision
it returns (accept with a truck, decline or hold, each with a reason), new tenders as exogenous information, the
discrete-event transition (`simulator.py`) and profit as the objective. Design and defaults:
`docs/superpowers/specs/2026-10-10-dispatch-simulator-design.md`.

## Rebuild the data

```sh
python tools/import_kaggle_logistics.py path/to/unzipped/kaggle/files          # → data/kaggle_logistics/
python tools/build_dispatch_map_data.py path/to/2023_Gaz_place_national.txt     # → data/dispatch_map/
python tools/build_lane_routes.py                                              # → data/osm_routes/ (calls OSRM)
```

## Disclosures

- Loads, lanes, fleet: "Logistics Operations Database" by yogape on Kaggle, synthetic, MIT.
  https://www.kaggle.com/datasets/yogape/logistics-operations-database
- City coordinates: US Census Bureau 2023 Gazetteer of places, public domain.
- Road paths and distances (`data/osm_routes/`, **ODbL, not MIT**) and map tiles: © OpenStreetMap contributors, routed with
  the OSRM demo server. See `data/osm_routes/NOTICE.md`.
- Map library: Leaflet 1.9.4 (BSD-2-Clause), loaded from the jsDelivr CDN.
- AI tools: Claude Code was used to research datasets, write code and draft documentation.
