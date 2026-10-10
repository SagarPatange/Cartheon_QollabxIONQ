/**
 * Where the page's data comes from. Locally the page fetches the JSON files and asks tools/serve.py to simulate a
 * week. On Qollab, JavaScript cannot read project files and there is no server, so only this module changes there:
 * it will call the same Python functions through the runtime.
 */

async function fetchJson(path) {
    const response = await fetch(path);
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body.error ?? `could not load ${path} (HTTP ${response.status})`);
    }
    return body;
}

/** The 20 lane cities with coordinates and loads sent and received. */
export function loadCities() {
    return fetchJson("data/dispatch_map/cities.json");
}

/** The 58 lanes with miles, rate, transit days and total loads. */
export function loadLanes() {
    return fetchJson("data/dispatch_map/lanes.json");
}

/** Real road paths between every pair of lane cities (© OpenStreetMap contributors, ODbL). */
export function loadRoutePaths() {
    return fetchJson("data/osm_routes/lane_routes.json");
}

/**
 * Simulate seven days from startDate with a policy, an objective (used by the MILP policy) and a seed; returns the
 * replay (see freight_sim/replay.py).
 */
export function runSimulation(startDate, policyName, objectiveKey, seed) {
    const query = new URLSearchParams({
        start: startDate, policy: policyName, objective: objectiveKey, seed: String(seed),
    });
    return fetchJson(`/api/simulate?${query}`);
}
