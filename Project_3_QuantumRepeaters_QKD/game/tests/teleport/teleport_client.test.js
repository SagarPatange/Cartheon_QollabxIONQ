/**
 * Tests for src/teleport/teleport_client.js with a stand-in fetch: the request it sends, and the clear message when
 * the backend is not running.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { BACKEND_HINT, requestTeleports } from "../../src/teleport/teleport_client.js";

const realFetch = globalThis.fetch;
const ONE_WITH_X = {
    state: "1", bell_bits: { z_fix: 0, x_fix: 1 }, luigi_reads: { none: "0", x: "1", z: "0", zx: "1" },
};

afterEach(() => {
    globalThis.fetch = realFetch;
});


test("it posts the states to /api/teleport and returns the checked response", async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => {
        calls.push({ path, options });
        return { ok: true, status: 200, json: async () => ({ seed: 7, teleports: [ONE_WITH_X] }) };
    };
    const response = await requestTeleports(["1"]);
    assert.equal(response.seed, 7);
    assert.equal(calls[0].path, "/api/teleport");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { states: ["1"] });
});


test("an unreachable or refusing backend says to run npm run backend", async () => {
    globalThis.fetch = async () => {
        throw new TypeError("Failed to fetch");
    };
    await assert.rejects(requestTeleports(["0"]), (error) => error.message.startsWith(BACKEND_HINT));
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await assert.rejects(requestTeleports(["0"]), /npm run backend.*404/);
    assert.match(BACKEND_HINT, /npm run backend/);
});


test("it asks for 1 to 16 states only", async () => {
    await assert.rejects(requestTeleports([]), /1 to 16/);
    await assert.rejects(requestTeleports(Array(17).fill("0")), /1 to 16/);
});
