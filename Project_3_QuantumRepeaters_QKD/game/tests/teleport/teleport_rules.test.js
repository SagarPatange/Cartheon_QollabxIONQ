/**
 * Tests for src/teleport/teleport_rules.js: the fix rule for all four bit pairs, the X/Z toggles, Luigi's reading
 * taken from the response, and the response check.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    FIX_RULES, NO_FIX, PAIR_SLOT_COUNT, X_FIX, ZX_FIX, Z_FIX, checkTeleportResponse, describeFix, findNeededFix, findPairSlot, formatBellBits,
    formatKet, formatReading, isXBasisState, readLuigiResult, toFixKey,
} from "../../src/teleport/teleport_rules.js";

// A teleport of |1⟩ whose bits were z_fix 0, x_fix 1, shaped like a /api/teleport response entry.
const ONE_WITH_X = {
    state: "1",
    bell_bits: { z_fix: 0, x_fix: 1 },
    luigi_reads: { none: "0", x: "1", z: "0", zx: "1" },
};
const PLUS_WITH_Z = {
    state: "+",
    bell_bits: { z_fix: 1, x_fix: 0 },
    luigi_reads: { none: "-", x: "-", z: "+", zx: "+" },
};


test("bits 00 need nothing, 01 need X, 10 need Z, 11 need Z and X", () => {
    assert.equal(findNeededFix({ z_fix: 0, x_fix: 0 }), NO_FIX);
    assert.equal(findNeededFix({ z_fix: 0, x_fix: 1 }), X_FIX);
    assert.equal(findNeededFix({ z_fix: 1, x_fix: 0 }), Z_FIX);
    assert.equal(findNeededFix({ z_fix: 1, x_fix: 1 }), ZX_FIX);
    assert.throws(() => findNeededFix({ z_fix: 2, x_fix: 0 }), /0 or 1/);
});


test("the fix keys are the ones the backend's luigi_reads uses", () => {
    assert.deepEqual(FIX_RULES.map((rule) => rule.fixKey), ["none", "x", "z", "zx"]);
});


test("the X and Z toggles name the fix", () => {
    assert.equal(toFixKey({ isXOn: false, isZOn: false }), NO_FIX);
    assert.equal(toFixKey({ isXOn: true, isZOn: false }), X_FIX);
    assert.equal(toFixKey({ isXOn: false, isZOn: true }), Z_FIX);
    assert.equal(toFixKey({ isXOn: true, isZOn: true }), ZX_FIX);
});


test("fixes and bits read the way the cheat sheet writes them", () => {
    assert.equal(describeFix(NO_FIX), "nothing");
    assert.equal(describeFix(ZX_FIX), "Z and X");
    assert.throws(() => describeFix("y"), /unknown fix/);
    assert.equal(formatBellBits({ z_fix: 1, x_fix: 0 }), "10");
    assert.equal(formatBellBits({ z_fix: 0, x_fix: 1 }), "01");
});


test("states show as kets with a real minus sign, and +/− are the X-basis states", () => {
    assert.equal(formatKet("1"), "|1⟩");
    assert.equal(formatKet("-"), "|−⟩");
    assert.equal(formatReading("+"), "+");
    assert.throws(() => formatReading("2"), /unknown state/);
    assert.equal(isXBasisState("+"), true);
    assert.equal(isXBasisState("-"), true);
    assert.equal(isXBasisState("0"), false);
});


test("Luigi's reading is the response's luigi_reads entry for the player's fix", () => {
    const right = readLuigiResult(ONE_WITH_X, { isXOn: true, isZOn: false });
    assert.deepEqual(right, { reading: "1", fixKey: X_FIX, neededFixKey: X_FIX, isRightFix: true, isRightState: true });
    const wrong = readLuigiResult(ONE_WITH_X, { isXOn: false, isZOn: false });
    assert.equal(wrong.reading, "0");
    assert.equal(wrong.isRightFix, false);
    assert.equal(wrong.isRightState, false);
});


test("for a 0/1 message an extra Z changes nothing Luigi can see; for |+⟩ it is what matters", () => {
    const extraZ = readLuigiResult(ONE_WITH_X, { isXOn: true, isZOn: true });
    assert.equal(extraZ.isRightFix, false);
    assert.equal(extraZ.isRightState, true);
    assert.equal(readLuigiResult(PLUS_WITH_Z, { isXOn: false, isZOn: false }).reading, "-");
    assert.equal(readLuigiResult(PLUS_WITH_Z, { isXOn: false, isZOn: true }).reading, "+");
});


test("a response must answer every requested state, in order, with all four readings", () => {
    checkTeleportResponse({ seed: 1, teleports: [ONE_WITH_X, PLUS_WITH_Z] }, ["1", "+"]);
    assert.throws(() => checkTeleportResponse({ seed: 1, teleports: [ONE_WITH_X] }, ["1", "+"]), /expected 2/);
    assert.throws(() => checkTeleportResponse({ seed: 1, teleports: [PLUS_WITH_Z] }, ["1"]), /expected 1/);
    const missingReading = { ...ONE_WITH_X, luigi_reads: { none: "0", x: "1", z: "0" } };
    assert.throws(() => checkTeleportResponse({ seed: 1, teleports: [missingReading] }, ["1"]), /fix zx/);
});


test("teleports take the 3 Bell-pair slots in turn", () => {
    assert.equal(PAIR_SLOT_COUNT, 3);
    const slots = [0, 1, 2, 3, 4, 9].map((teleportNumber) => findPairSlot(teleportNumber));
    assert.deepEqual(slots, [0, 1, 2, 0, 1, 0]);
    assert.throws(() => findPairSlot(-1), /whole number/);
    assert.throws(() => findPairSlot(1.5), /whole number/);
});
