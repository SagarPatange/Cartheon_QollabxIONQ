# Lane road paths: OpenStreetMap data

`lane_routes.json` holds one driving path for every pair of the 20 lane cities (190 paths), built by
`tools/build_lane_routes.py` with the public OSRM demo server (https://router.project-osrm.org), which routes on
OpenStreetMap. Every pair is included because trucks can drive empty between any two cities.

**These files are not MIT.** They contain data © OpenStreetMap contributors, available under the Open Database
License (ODbL) 1.0: https://www.openstreetmap.org/copyright. With 190 features this is more than an insubstantial
extract, so the files are a derivative database and are themselves offered under the ODbL (share-alike). The
attribution above must stay with them and be shown wherever the paths are displayed.

`city_matrix.json` holds road miles and drive hours between all 20 lane cities (20 × 20), from the OSRM table
service on 2026-10-10. It is under the same OpenStreetMap attribution and license. Drive hours are for a car; the
simulator computes truck times from the miles instead.

Each `lane_routes.json` entry: the two city labels (alphabetical), road miles and drive hours from OSRM (2026-10-10), and the path as
[latitude, longitude] points, simplified with Douglas–Peucker at 0.01° (about 1 km).
