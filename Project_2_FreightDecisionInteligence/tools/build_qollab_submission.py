"""Build the full visual Qollab project, with all weeks and one live QAOA comparison.

Monthly text inputs preserve all fields the simulator uses and avoid large CSV/gzip uploads.
Every generated Python file path is literal so Qollab can preload the inputs.
"""

import csv
import gzip
import json
import zipfile
from collections import defaultdict
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent


def read_rows(name):
    path = PROJECT / "data" / "kaggle_logistics" / name
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def write_text(root, name, text):
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def write_inputs(root):
    appointments = defaultdict(dict)
    for row in read_rows("delivery_events.csv.gz"):
        appointments[row["load_id"]][row["event_type"]] = row["scheduled_datetime"]
    months = defaultdict(list)
    keys = ("load_id", "load_date", "route_id", "load_type", "revenue")
    for row in read_rows("loads.csv.gz"):
        compact = {key: row[key] for key in keys}
        compact["pickup"] = appointments[row["load_id"]]["Pickup"]
        compact["delivery"] = appointments[row["load_id"]]["Delivery"]
        months[row["load_date"][:7]].append(compact)
    for month, rows in months.items():
        write_text(root, f"data/months/{month}.json", json.dumps(rows, separators=(",", ":")))
    for source, target in (("routes.csv", "routes.json"), ("trucks.csv", "trucks.json")):
        write_text(root, f"data/inputs/{target}", json.dumps(read_rows(source), separators=(",", ":")))
    readers = []
    for index, month in enumerate(sorted(months)):
        readers.append(f'''def month_{index}():
    with open("data/months/{month}.json", encoding="utf-8") as source:
        return json.load(source)
''')
    mapping = ",\n".join(f'    "{month}": month_{i}' for i, month in enumerate(sorted(months)))
    module = '''"""All simulation inputs, with literal Qollab preload paths."""
import json

with open("data/inputs/routes.json", encoding="utf-8") as source:
    ROUTES = {row["route_id"]: row for row in json.load(source)}
with open("data/inputs/trucks.json", encoding="utf-8") as source:
    TRUCKS = json.load(source)
with open("data/osm_routes/city_matrix.json", encoding="utf-8") as source:
    MATRIX = json.load(source)

'''
    module += "\n".join(readers) + "\nREADERS = {\n" + mapping + "\n}\n"
    module += '''
def load_inputs(start_date, end_date):
    months = sorted({start_date[:7], end_date[:7]})
    rows = [row for month in months for row in READERS[month]()]
    appointments = {row["load_id"]: (row["pickup"], row["delivery"]) for row in rows}
    return rows, appointments
'''
    write_text(root, "qollab_app/data.py", module)


PORTABLE_SCENARIO = '''def load_scenario(start_date, end_date, seed, lead_time=DEFAULT_LEAD_TIME):
    from qollab_app.data import load_inputs, ROUTES, TRUCKS, MATRIX
    rng = random.Random(seed)
    network = RoadNetwork(MATRIX["cities"], MATRIX["road_miles"])
    rows, appointments = load_inputs(start_date, end_date)
    loads = build_loads(rows, appointments, ROUTES, start_date, end_date, lead_time, rng)
    lane_cities = list(network.index_of_city)
    trucks = build_trucks(TRUCKS, lane_cities, REEFER_SHARE, rng)
    return Scenario(loads, trucks, network, build_out_of_service(TRUCKS, lane_cities))
'''


def build_package(output_dir=None):
    output = Path(output_dir) if output_dir is not None else PROJECT / "build"
    root = output / "qollab-submission"
    root.mkdir(parents=True, exist_ok=True)
    # Never recursively remove user files. This generated directory is overwritten in place.
    for folder in ("freight_sim", "src"):
        for source in (PROJECT / folder).rglob("*.py" if folder == "freight_sim" else "*.js"):
            if "__pycache__" in source.parts:
                continue
            write_text(root, source.relative_to(PROJECT), source.read_text(encoding="utf-8"))
    write_text(root, "freight_sim/__init__.py", '"""Freight dispatch simulator."""\n')
    write_text(root, "freight_sim/policies/__init__.py", '"""Classical dispatch policies."""\n')
    for name in ("__init__.py", "bridge.py"):
        write_text(root, "qollab_app/" + name, (PROJECT / "qollab_app" / name).read_text(encoding="utf-8"))
    for name in ("data_source.js", "us_map_view.js"):
        write_text(root, "src/" + name, (PROJECT / "qollab_app" / name).read_text(encoding="utf-8"))
    for name in ("index.html", "main.css", "main.js"):
        text = (PROJECT / name).read_text(encoding="utf-8")
        if name == "index.html":
            text = text.replace('    <script type="module" src="main.js"></script>', '')
        if name == "main.js":
            text = 'import { configureBackend } from "./src/data_source.js";\nconfigureBackend(backend);\n' + text
            text = text.replace("start().catch", "start().then(() => document.getElementById('quantum-button').click()).catch")
            text = text.replace("// QOLLAb: local runs can repeat experiments", "// Qollab permits one backend job per Run")
            text = text.replace("quantumButton.disabled = false; // LOCAL_QUANTUM_REPEAT", "quantumButton.disabled = true; quantumButton.textContent = 'Press Qollab Run for a new comparison';")
        write_text(root, name, text)
    original = (PROJECT / "freight_sim/scenario.py").read_text(encoding="utf-8")
    write_text(root, "freight_sim/scenario.py", original[:original.index("def load_scenario(")] + PORTABLE_SCENARIO)
    for name in ("data/dispatch_map/cities.json", "data/dispatch_map/lanes.json",
                 "data/osm_routes/lane_routes.json", "data/osm_routes/city_matrix.json"):
        write_text(root, name, (PROJECT / name).read_text(encoding="utf-8"))
    write_inputs(root)
    write_text(root, "LICENSE", (PROJECT.parent / "LICENSE").read_text(encoding="utf-8"))
    write_text(root, "DATA_LICENSE.md", (PROJECT / "data/kaggle_logistics/LICENSE").read_text(encoding="utf-8")
               + "\n\n" + (PROJECT / "data/osm_routes/NOTICE.md").read_text(encoding="utf-8"))
    write_text(root, "README.md", (PROJECT / "docs/QOLLAB_PROJECT_CARD.md").read_text(encoding="utf-8"))
    write_text(root, "requirements.txt", "# Qollab supplies Qiskit 2.x, NumPy and SciPy.\n")
    files = sorted(p for p in root.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    if len(files) > 100 or any(p.stat().st_size >= 2_000_000 for p in files):
        raise ValueError("Qollab upload limit exceeded: at most 100 files, each below 2 MB")
    archive = output / "qollab-submission.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
        for path in files:
            package.write(path, path.relative_to(root).as_posix())
    print(f"Packaged {len(files)} files; largest {max(p.stat().st_size for p in files):,} bytes -> {archive}")
    return archive


if __name__ == "__main__":
    build_package()
