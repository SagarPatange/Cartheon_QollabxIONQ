# Kaggle "Logistics Operations Database" (imported subset)

Source: https://www.kaggle.com/datasets/yogape/logistics-operations-database, MIT (see `LICENSE`).
A **synthetic** three-year (2022–2024) operational database of a fictional US Class 8 truckload carrier.

Written by `tools/import_kaggle_logistics.py` from the unzipped Kaggle download. Changes from the original:

| File | Rows | Change |
|---|---|---|
| `loads.csv.gz` | 85,410 | gzip-compressed |
| `delivery_events.csv.gz` | 170,820 | gzip-compressed; `trip_id` removed (trips are not imported) |
| `routes.csv` | 58 | none |
| `facilities.csv` | 50 | none |
| `customers.csv` | 200 | none |
| `trucks.csv` | 120 | `vin` removed |
| `trailers.csv` | 180 | `vin` removed |
| `drivers.csv` | 150 | `first_name`, `last_name`, `license_number`, `date_of_birth` removed |

Not imported: `trips` (its truck histories are not physically possible), `fuel_purchases`, `maintenance_records`,
`safety_incidents`, `driver_monthly_metrics`, `truck_utilization_metrics`. What the data contains, and what it
gets wrong, is in `docs/data_profile.md`.
