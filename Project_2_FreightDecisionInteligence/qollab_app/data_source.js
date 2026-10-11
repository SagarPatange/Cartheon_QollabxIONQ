/** Qollab adapter: all data and computation cross the documented Python bridge. */
import * as bridge from 'qollab_app.bridge';

let selectedBackend;
let mapPromise;
function decode(value) { return JSON.parse(typeof value === 'string' ? value : value.toJs()); }
function mapData() { return mapPromise ??= bridge.map_data.callPromising().then(decode); }
export function configureBackend(value) { selectedBackend = value; }
export async function loadCities() { return (await mapData()).cities; }
export async function loadLanes() { return (await mapData()).lanes; }
export async function loadRoutePaths() { return (await mapData()).paths; }
export async function runSimulation(start, policy, objective, seed) {
    return decode(await bridge.run_week.callPromising(start, policy, objective, seed));
}
export async function compareObjectives(start, seed) {
    return decode(await bridge.compare_week.callPromising(start, seed));
}
export async function runQuantumComparison(start, seed, objective) {
    return decode(await bridge.quantum_compare.callPromising(selectedBackend, start, seed, objective, 256));
}
