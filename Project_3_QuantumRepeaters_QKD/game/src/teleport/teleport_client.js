/**
 * Level 2 (teleportation)'s call to the simulator: POST /api/teleport teleports each requested state on the backend
 * and returns Mario's two Bell bits and what Luigi reads after each of the four possible fixes.
 */

import { checkTeleportResponse } from "./teleport_rules.js";

const TELEPORT_API_PATH = "/api/teleport";
// The backend accepts 1 to 16 states per request.
export const MAX_STATES_PER_REQUEST = 16;
export const BACKEND_HINT = "Can't reach the simulator. Run `npm run backend` from the repo root, then reload.";


/**
 * Teleport these states (the backend picks the seed) and check the answer matches the request.
 *
 * @param {string[]} states - each "0", "1", "+" or "-", 1 to 16 of them.
 * @returns {Promise<{seed: number, teleports: object[]}>} TeleportResponse JSON.
 * @throws {Error} when the backend is not running, refuses the request or answers something else.
 */
export async function requestTeleports(states) {
    if (states.length < 1 || states.length > MAX_STATES_PER_REQUEST) {
        throw new Error(`ask for 1 to ${MAX_STATES_PER_REQUEST} states, got ${states.length}`);
    }
    let response;
    try {
        response = await fetch(TELEPORT_API_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ states }),
        });
    } catch (networkError) {
        throw new Error(`${BACKEND_HINT} (${networkError.message})`);
    }
    if (!response.ok) {
        throw new Error(`${BACKEND_HINT} (the simulator answered ${response.status})`);
    }
    const teleportResponse = await response.json();
    checkTeleportResponse(teleportResponse, states);
    return teleportResponse;
}
