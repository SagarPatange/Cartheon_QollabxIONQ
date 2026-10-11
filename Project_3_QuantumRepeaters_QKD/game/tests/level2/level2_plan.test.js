/**
 * Tests for src/level2/level2_plan.js: the steps Space walks through and the small helpers the animation uses.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CHECK_STEP, ENCODE_STEP, HERALD_STEP, TELEPORT_STEP, buildPlaybackSteps, chooseAttemptTiming, describeBlockLabel,
    describeCheckBanner, describeCheckResult, describeHeraldedState, describeStepAction, isHeraldSuccess,
    listSetPositions,
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


test("one Space press heralds all 7 pairs, then encoding, the teleported CNOT and the check", () => {
    const response = makeResponse();
    const steps = buildPlaybackSteps(response);
    const kinds = steps.map((step) => step.kind);
    assert.deepEqual(kinds, [HERALD_STEP, ENCODE_STEP, TELEPORT_STEP, CHECK_STEP]);
    assert.equal(steps[0].pairAttempts, response.herald_attempts);
});


test("a response without exactly 7 pairs fails fast", () => {
    assert.throws(() => buildPlaybackSteps({ herald_attempts: [[SUCCESS]] }), /7 heralded pairs/);
});


test("each step's key hint says what it does", () => {
    const steps = buildPlaybackSteps(makeResponse());
    assert.equal(describeStepAction(steps[0]), "Herald 7 pairs");
    assert.equal(describeStepAction(steps[1]), "Encode blocks");
    assert.equal(describeStepAction(steps[3]), "Check the pair");
});


test("failed tries play as a quick burst; the heralding attempt plays slower but still far under the old 1.15 s round", () => {
    // Before the speed-up every round took a 700 ms photon flight plus a 450 ms lamp hold.
    const oldRoundMs = 700 + 450;
    const failed = chooseAttemptTiming(false, false);
    const heralding = chooseAttemptTiming(true, false);
    const failedRoundMs = failed.photonFlightMs + failed.lampHoldMs;
    const heraldingRoundMs = heralding.photonFlightMs + heralding.lampHoldMs;
    assert.ok(failedRoundMs < heraldingRoundMs);
    assert.ok(failedRoundMs * 10 <= oldRoundMs);
    assert.ok(heraldingRoundMs * 3 <= oldRoundMs);
    assert.ok(failed.flipMs > 0 && failed.flipMs <= heralding.flipMs);
});


test("with reduced motion no photon flies or qubit flips, failed tries only count, the herald still lights a lamp", () => {
    const failed = chooseAttemptTiming(false, true);
    const heralding = chooseAttemptTiming(true, true);
    assert.deepEqual(failed, { photonFlightMs: 0, lampHoldMs: 0, flipMs: 0 });
    assert.equal(heralding.photonFlightMs, 0);
    assert.equal(heralding.flipMs, 0);
    assert.ok(heralding.lampHoldMs > 0);
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
    assert.deepEqual(describeCheckResult(xMismatch), { aliceLabel: "+", bobLabel: "-", isMatch: false });
});


test("a match names only the basis, then says the logical Bell pair has been made", () => {
    const banner = describeCheckBanner(true, "X");
    assert.deepEqual(banner.lines, [
        ["MATCH! Both blocks agree in the X basis"],
        ["The logical Bell pair ", { symbol: "Φ", superscript: "+" }, " has been made!"],
    ]);
    assert.equal(banner.spokenText,
        "Match! Both blocks agree in the X basis. The logical Bell pair Phi plus has been made!");
});


test("a mismatch names the basis and says no Bell pair was made this run", () => {
    const banner = describeCheckBanner(false, "Z");
    assert.deepEqual(banner.lines[0], ["✖ No match: the blocks disagree in the Z basis"]);
    assert.match(banner.lines[1][0], /error got through/);
    assert.match(banner.spokenText, /disagree in the Z basis/);
});


test("each block is labelled as one logical qubit: |+̃⟩ for Alice, |0̃⟩ for Bob once encoded", () => {
    assert.deepEqual(describeBlockLabel("encoded", "alice"), { symbol: "+", text: "logical |+⟩, all 7 data qubits" });
    assert.deepEqual(describeBlockLabel("encoded", "bob"), { symbol: "0", text: "logical |0⟩, all 7 data qubits" });
});


test("after the teleported CNOT both blocks are the logical Bell pair Φ⁺; before encoding and after the check, none",
    () => {
    for (const tower of ["alice", "bob"]) {
        assert.deepEqual(describeBlockLabel("paired", tower),
            { symbol: "Φ", superscript: "+", text: "one half of the logical Bell pair Φ⁺" });
        assert.equal(describeBlockLabel("empty", tower), null);
        assert.equal(describeBlockLabel("measured", tower), null);
    }
});
