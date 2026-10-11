/**
 * Level 2's call to the simulator: POST /api/logical-pair runs one Alice–Bob logical Bell pair on the Stim backend.
 */

import { callSimulator } from "../simulator_bridge.js";

const LOGICAL_PAIR_API_PATH = "/api/logical-pair";


/**
 * Ask the backend for a fresh run (it picks the seed).
 *
 * @returns {Promise<object>} LogicalPairResponse JSON.
 * @throws {Error} when the backend is not running or refuses the request.
 */
export async function requestLogicalPair() {
    return callSimulator(LOGICAL_PAIR_API_PATH, {});
}
