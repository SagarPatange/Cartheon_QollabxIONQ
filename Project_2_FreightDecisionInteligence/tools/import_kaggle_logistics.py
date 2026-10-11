"""Copy the tables we use from the Kaggle "Logistics Operations Database" into data/kaggle_logistics/.

Run from the project folder, with the unzipped Kaggle download as the argument:
    python tools/import_kaggle_logistics.py path/to/unzipped/kaggle/files

The source is https://www.kaggle.com/datasets/yogape/logistics-operations-database (MIT). Personal-looking columns
(driver names, birth dates, licence numbers, VINs) are removed even though the data is synthetic: the simulator
does not need them. The two large tables are gzip-compressed.

Tables left out on purpose: trips (its truck histories are not physically possible, see docs/data_profile.md),
fuel_purchases, maintenance_records, safety_incidents and the two monthly metrics tables (not used by dispatch).
"""

import csv
import gzip
import sys
from pathlib import Path

DEFAULT_OUTPUT_FOLDER = Path("data/kaggle_logistics")

# For each table: the header the Kaggle file has today, the columns we remove, and whether to compress it.
TABLES = {
    "drivers": {
        "expected_header": [
            "driver_id", "first_name", "last_name", "hire_date", "termination_date", "license_number",
            "license_state", "date_of_birth", "home_terminal", "employment_status", "cdl_class", "years_experience",
        ],
        "drop": ["first_name", "last_name", "license_number", "date_of_birth"],
        "compress": False,
    },
    "trucks": {
        "expected_header": [
            "truck_id", "unit_number", "make", "model_year", "vin", "acquisition_date", "acquisition_mileage",
            "fuel_type", "tank_capacity_gallons", "status", "home_terminal",
        ],
        "drop": ["vin"],
        "compress": False,
    },
    "trailers": {
        "expected_header": [
            "trailer_id", "trailer_number", "trailer_type", "length_feet", "model_year", "vin", "acquisition_date",
            "status", "current_location",
        ],
        "drop": ["vin"],
        "compress": False,
    },
    "customers": {
        "expected_header": [
            "customer_id", "customer_name", "customer_type", "credit_terms_days", "primary_freight_type",
            "account_status", "contract_start_date", "annual_revenue_potential",
        ],
        "drop": [],
        "compress": False,
    },
    "facilities": {
        "expected_header": [
            "facility_id", "facility_name", "facility_type", "city", "state", "latitude", "longitude", "dock_doors",
            "operating_hours",
        ],
        "drop": [],
        "compress": False,
    },
    "routes": {
        "expected_header": [
            "route_id", "origin_city", "origin_state", "destination_city", "destination_state",
            "typical_distance_miles", "base_rate_per_mile", "fuel_surcharge_rate", "typical_transit_days",
        ],
        "drop": [],
        "compress": False,
    },
    "loads": {
        "expected_header": [
            "load_id", "customer_id", "route_id", "load_date", "load_type", "weight_lbs", "pieces", "revenue",
            "fuel_surcharge", "accessorial_charges", "load_status", "booking_type",
        ],
        "drop": [],
        "compress": True,
    },
    "delivery_events": {
        "expected_header": [
            "event_id", "load_id", "trip_id", "event_type", "facility_id", "scheduled_datetime", "actual_datetime",
            "detention_minutes", "on_time_flag", "location_city", "location_state",
        ],
        # trip_id points into the trips table, which is not imported.
        "drop": ["trip_id"],
        "compress": True,
    },
}


def drop_columns(header: list[str], rows: list[list[str]], columns_to_drop: list[str]) -> tuple[list, list]:
    """Remove the named columns from the header and every row. Fails if a named column is not there, because
    that means the source changed and a personal column might now be under another name."""
    for column in columns_to_drop:
        if column not in header:
            raise ValueError(f"expected to remove column {column!r}, but the table has {header}")
    kept_indexes = []
    for index, column in enumerate(header):
        if column not in columns_to_drop:
            kept_indexes.append(index)
    kept_header = [header[index] for index in kept_indexes]
    kept_rows = []
    for row in rows:
        kept_rows.append([row[index] for index in kept_indexes])
    return kept_header, kept_rows


def read_table(path: Path) -> tuple[list[str], list[list[str]]]:
    """Header and rows of one CSV file."""
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing from the Kaggle download")
    with open(path, newline="") as csv_file:
        all_rows = list(csv.reader(csv_file))
    return all_rows[0], all_rows[1:]


def write_table(path: Path, header: list[str], rows: list[list[str]], is_compressed: bool) -> None:
    """Write a CSV, as path.csv.gz when compressed."""
    if is_compressed:
        output_file = gzip.open(path.with_suffix(".csv.gz"), "wt", newline="")
    else:
        output_file = open(path.with_suffix(".csv"), "w", newline="")
    with output_file:
        writer = csv.writer(output_file, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def import_dataset(source_folder: Path, output_folder: Path) -> None:
    """Copy every table in TABLES from source_folder to output_folder, without the dropped columns."""
    output_folder.mkdir(parents=True, exist_ok=True)
    for table_name, rule in TABLES.items():
        header, rows = read_table(source_folder / f"{table_name}.csv")
        if header != rule["expected_header"]:
            raise ValueError(f"{table_name}.csv changed: expected {rule['expected_header']}, got {header}")
        kept_header, kept_rows = drop_columns(header, rows, rule["drop"])
        write_table(output_folder / table_name, kept_header, kept_rows, rule["compress"])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python tools/import_kaggle_logistics.py path/to/unzipped/kaggle/files")
    import_dataset(Path(sys.argv[1]), DEFAULT_OUTPUT_FOLDER)
