"""Tests for tools/import_kaggle_logistics.py: copying the Kaggle tables we use, without personal columns."""

import csv
import gzip

import pytest
from import_kaggle_logistics import TABLES, drop_columns, import_dataset


def write_csv(path, header, rows):
    with open(path, "w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(header)
        writer.writerows(rows)


def read_csv(path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", newline="") as csv_file:
        return list(csv.reader(csv_file))


def test_drop_columns_removes_the_named_columns_and_keeps_the_order_of_the_rest():
    header = ["driver_id", "first_name", "home_terminal", "date_of_birth"]
    rows = [["DRV1", "Ann", "Denver", "1980-01-01"]]
    kept_header, kept_rows = drop_columns(header, rows, ["first_name", "date_of_birth"])
    assert kept_header == ["driver_id", "home_terminal"]
    assert kept_rows == [["DRV1", "Denver"]]


def test_drop_columns_fails_when_the_source_no_longer_has_a_column_we_expect_to_remove():
    with pytest.raises(ValueError, match="vin"):
        drop_columns(["truck_id"], [["TRK1"]], ["vin"])


def make_source(folder):
    """One row per table, with exactly the columns the real Kaggle files have."""
    for table_name, rule in TABLES.items():
        header = rule["expected_header"]
        write_csv(folder / f"{table_name}.csv", header, [[f"{column}-value" for column in header]])


def test_import_writes_every_table_without_personal_columns(tmp_path):
    source_folder = tmp_path / "kaggle"
    output_folder = tmp_path / "out"
    source_folder.mkdir()
    make_source(source_folder)

    import_dataset(source_folder, output_folder)

    drivers = read_csv(output_folder / "drivers.csv")
    for personal_column in ["first_name", "last_name", "license_number", "date_of_birth"]:
        assert personal_column not in drivers[0]
    assert "vin" not in read_csv(output_folder / "trucks.csv")[0]
    assert "vin" not in read_csv(output_folder / "trailers.csv")[0]


def test_import_compresses_the_large_tables(tmp_path):
    source_folder = tmp_path / "kaggle"
    output_folder = tmp_path / "out"
    source_folder.mkdir()
    make_source(source_folder)

    import_dataset(source_folder, output_folder)

    loads = read_csv(output_folder / "loads.csv.gz")
    assert loads[0][0] == "load_id"
    assert not (output_folder / "loads.csv").exists()


def test_import_fails_fast_when_a_table_is_missing(tmp_path):
    source_folder = tmp_path / "kaggle"
    source_folder.mkdir()
    with pytest.raises(FileNotFoundError, match="drivers.csv"):
        import_dataset(source_folder, tmp_path / "out")
