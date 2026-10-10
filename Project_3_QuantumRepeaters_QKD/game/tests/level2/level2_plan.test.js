/**
 * Tests for src/level2/level2_plan.js: the steps Space walks through and the small helpers the animation uses.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CHECK_STEP, ENCODE_STEP, HERALD_STEP, TELEPORT_STEP, buildPlaybackSteps, describeCheckResult, describeHeraldedState,
    describeStepAction, isHeraldSuccess, listSetPositions,
} from "../../src/level2/level2_plan.js";

const SUCCESS = { round_one_detector: "D+", round_two_detector: "D+" };
const ROUND_ONE_MISS = { round_one_detector: null, round_two_detector: null };


function makeResponse() {
    const heraldAttempts = [];
    for (let i = 0; i < 7; i++) {
        heraldAttempts.push([ROUND_ONE_MISS, SUCCESS]);
    }
    return { herald_attempts: heraldAttempts };
}


test("Space walks through 7 heralded pairs, then encoding, the teleported CNOT and the check", () => {
    const steps = buildPlaybackSteps(makeResponse());
    const kinds = steps.map((step) => step.kind);
    assert.deepEqual(kinds, [...Array(7).fill(HERALD_STEP), ENCODE_STEP, TELEPORT_STEP, CHECK_STEP]);
    assert.equal(steps[2].pairIndex, 2);
    assert.equal(steps[2].attempts.length, 2);
});


test("a response without exactly 7 pairs fails fast", () => {
    assert.throws(() => buildPlaybackSteps({ herald_attempts: [[SUCCESS]] }), /7 heralded pairs/);
});


test("each step's key hint says what it does", () => {
    const steps = buildPlaybackSteps(makeResponse());
    assert.equal(describeStepAction(steps[0]), "Herald pair 1/7");
    assert.equal(describeStepAction(steps[6]), "Herald pair 7/7");
    assert.equal(describeStepAction(steps[7]), "Encode blocks");
    assert.equal(describeStepAction(steps[9]), "Check the pair");
});


test("corrections act on the positions whose bit is 1", () => {
    assert.deepEqual(listSetPositions([0, 1, 1, 0, 1, 0, 0]), [1, 2, 4]);
    assert.deepEqual(listSetPositions([0, 0, 0]), []);
});


test("a success needs a click in both rounds; the detectors say which Ψ was heralded", () => {
    assert.equal(isHeraldSuccess(SUCCESS), true);
    assert.equal(isHeraldSuccess(ROUND_ONE_MISS), false);
    assert.equal(isHeraldSuccess({ round_one_detector: "D-", round_two_detector: null }), false);
    assert.equal(describeHeraldedState(SUCCESS), "Ψ⁺");
    assert.equal(describeHeraldedState({ round_one_detector: "D+", round_two_detector: "D-" }), "Ψ⁻");
});


test("the check shows each block's logical bit in its basis and whether they match", () => {
    const zMatch = { check_basis: "Z", alice_check: { logical_bit: 1 }, bob_check: { logical_bit: 1 } };
    assert.deepEqual(describeCheckResult(zMatch), { aliceLabel: "1", bobLabel: "1", isMatch: true });
    const xMismatch = { check_basis: "X", alice_check: { logical_bit: 0 }, bob_check: { logical_bit: 1 } };
    assert.deepEqual(describeCheckResult(xMismatch), { aliceLabel: "+", bobLabel: "−", isMatch: false });
});
