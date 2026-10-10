# Lane road paths: OpenStreetMap data

`lane_routes.json` holds one driving path per pair of lane cities (53 paths), built by `tools/build_lane_routes.py`
with the public OSRM demo server (https://router.project-osrm.org), which routes on OpenStreetMap.

**This file is not MIT.** It contains data © OpenStreetMap contributors, available under the Open Database License
(ODbL) 1.0: https://www.openstreetmap.org/copyright. With 53 features it is an insubstantial extract under the OSMF
"Substantial — Guideline" (fewer than 100 features), so share-alike does not apply, but the attribution above must
stay with it and be shown wherever the paths are displayed.

Each entry: the two city labels (alphabetical), road miles and drive hours from OSRM (2026-10-10), and the path as
[latitude, longitude] points, simplified with Douglas–Peucker at 0.01° (about 1 km).
