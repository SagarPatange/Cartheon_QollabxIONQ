/**
 * Where the dispatch map's data comes from. Locally the page fetches the JSON files written by the tools in
 * tools/. On Qollab, JavaScript cannot read project files, so only this module changes there: it will ask Python
 * for the same objects.
 */

async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`could not load ${path} (HTTP ${response.status}); run the tools in tools/ first`);
    }
    return response.json();
}

/** The 20 lane cities with coordinates and loads sent and received. */
export function loadCities() {
    return fetchJson("data/dispatch_map/cities.json");
}

/** The 58 lanes with miles, rate, transit days and total loads. */
export function loadLanes() {
    return fetchJson("data/dispatch_map/lanes.json");
}

/** Real road paths between lane cities (© OpenStreetMap contributors, ODbL). */
export function loadRoutePaths() {
    return fetchJson("data/osm_routes/lane_routes.json");
}

/** One year of loads as a compact table (see data/dispatch_map/README.md). */
export function loadYear(year) {
    return fetchJson(`data/dispatch_map/loads_${year}.json`);
}
