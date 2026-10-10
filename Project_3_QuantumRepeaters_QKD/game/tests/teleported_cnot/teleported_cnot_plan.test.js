/**
 * Tests for src/teleported_cnot/teleported_cnot_plan.js: Level 4's rounds, the Fig. 4 circuit, and how fixes are
 * judged.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    BAD_BLOCK_ROUND, BELL_ROUND, BLOCK_ROUND, CLASSICAL_ROUND, ROUND_KINDS, buildPairCircuit, describeBlockStep,
    describeLogicalParities, judgePairFix, listKeyHints, listRoundSteps, listSetPositions, nameFixChoice,
} from "../../src/teleported_cnot/teleported_cnot_plan.js";

// A round-1 response where m = 1 and n = 1: only an X on Luigi's dB makes him read 1; Z can't show on 0 or 1.
const CLASSICAL_ROUND_M1_N1 = {
    m: 1, n: 1,
    readings: {
        none: { mario_bit: 1, luigi_bit: 0 }, x: { mario_bit: 1, luigi_bit: 1 },
        z: { mario_bit: 1, luigi_bit: 0 }, xz: { mario_bit: 1, luigi_bit: 1 },
    },
};
// A round-2 response where m = 1 and n = 1, as the backend reports it (test_teleported_cnot_lesson.py).
const BELL_ROUND_M1_N1 = {
    m: 1, n: 1,
    readings: {
        none: { zz_bit: 1, xx_bit: 1 }, x: { zz_bit: 0, xx_bit: 1 },
        z: { zz_bit: 1, xx_bit: 0 }, xz: { zz_bit: 0, xx_bit: 0 },
    },
};
const BAD_BLOCK = {
    bad_pair: 6, m_bits: [0, 1, 1, 0, 1, 0, 0], n_bits: [1, 0, 1, 0, 0, 1, 1], raw_zz_bit: 1, raw_xx_bit: 0,
    luigi_z_syndrome: [1, 1, 0], luigi_x_syndrome: [0, 0, 0], fixed_zz_bit: 0, fixed_xx_bit: 0,
};


test("the four rounds: one pair from |1⟩, one pair from |+⟩, two blocks, two blocks with a turtle", () => {
    assert.deepEqual(ROUND_KINDS, [CLASSICAL_ROUND, BELL_ROUND, BLOCK_ROUND, BAD_BLOCK_ROUND]);
    const pairSteps = listRoundSteps(CLASSICAL_ROUND);
    assert.deepEqual(pairSteps, ["pair", "cnotA", "measureA", "sendM", "cnotB", "measureB", "sendN", "choose", "done"]);
    assert.ok(listRoundSteps(BAD_BLOCK_ROUND).includes("turtle"));
    assert.ok(listRoundSteps(BAD_BLOCK_ROUND).includes("syndrome"));
    assert.ok(!listRoundSteps(BLOCK_ROUND).includes("turtle"));
});


test("the fixes are named as the backend names them", () => {
    assert.equal(nameFixChoice(false, false), "none");
    assert.equal(nameFixChoice(true, false), "x");
    assert.equal(nameFixChoice(false, true), "z");
    assert.equal(nameFixChoice(true, true), "xz");
});


test("the circuit is Fig. 4: CNOT dA→cA, measure cA in Z, CNOT cB→dB, measure cB in X, then the fixes", () => {
    const { circuit, doneColumnCount } = buildPairCircuit({
        roundKind: CLASSICAL_ROUND, stepIndex: 0, m: null, n: null, hasLuigiX: false, hasMarioZ: false,
    });
    assert.deepEqual(circuit.wires.map((wire) => wire.id), ["dA", "cA", "cB", "dB"]);
    assert.equal(circuit.wires[0].start, "|1⟩");
    assert.deepEqual(circuit.columns[0], [{ gate: "cnot", control: "dA", target: "cA" }]);
    assert.deepEqual(circuit.columns[1], [{ gate: "measure", wire: "cA", basis: "Z" }]);
    assert.deepEqual(circuit.columns[2], [{ gate: "cnot", control: "cB", target: "dB" }]);
    assert.deepEqual(circuit.columns[3], [{ gate: "measure", wire: "cB", basis: "X" }]);
    assert.deepEqual(circuit.columns.slice(4), [[{ gate: "x", wire: "dB" }], [{ gate: "z", wire: "dA" }]]);
    assert.equal(doneColumnCount, 0);
});


test("while choosing, only the chosen fixes are drawn, and the measured bits sit after their measurements", () => {
    const chooseStepIndex = listRoundSteps(BELL_ROUND).indexOf("choose");
    const { circuit, endNotes } = buildPairCircuit({
        roundKind: BELL_ROUND, stepIndex: chooseStepIndex, m: 1, n: 0, hasLuigiX: true, hasMarioZ: false,
    });
    assert.equal(circuit.wires[0].start, "|+⟩");
    assert.deepEqual(circuit.columns.slice(4), [[{ gate: "x", wire: "dB" }]]);
    assert.deepEqual(endNotes, { cA: "m=1", cB: "n=0" });
});


test("round 1 needs Luigi to read 1; a skipped X fails, a wrong Z passes with a note that it can't show", () => {
    assert.equal(judgePairFix(CLASSICAL_ROUND, CLASSICAL_ROUND_M1_N1, false, true).isRight, false);
    assert.match(judgePairFix(CLASSICAL_ROUND, CLASSICAL_ROUND_M1_N1, false, true).message, /needs X/);
    const wrongZ = judgePairFix(CLASSICAL_ROUND, CLASSICAL_ROUND_M1_N1, true, false);
    assert.equal(wrongZ.isRight, true);
    assert.match(wrongZ.message, /invisible/);
    assert.doesNotMatch(judgePairFix(CLASSICAL_ROUND, CLASSICAL_ROUND_M1_N1, true, true).message, /invisible/);
});


test("round 2 needs ZZ and XX at +1; each broken parity names the fix behind it", () => {
    assert.equal(judgePairFix(BELL_ROUND, BELL_ROUND_M1_N1, true, true).isRight, true);
    assert.match(judgePairFix(BELL_ROUND, BELL_ROUND_M1_N1, false, true).message, /Luigi's X fix/);
    assert.match(judgePairFix(BELL_ROUND, BELL_ROUND_M1_N1, true, false).message, /Mario's Z fix/);
    const neither = judgePairFix(BELL_ROUND, BELL_ROUND_M1_N1, false, false);
    assert.match(neither.message, /Luigi's X fix/);
    assert.match(neither.message, /Mario's Z fix/);
});


test("the block steps read the backend's bits: fixes go where m and n are 1, the syndrome names the hit", () => {
    assert.equal(listSetPositions([0, 1, 1, 0, 1, 0, 0]), "q2, q3, q5");
    assert.equal(listSetPositions([0, 0, 0]), "none");
    assert.match(describeBlockStep("luigi", BAD_BLOCK), /q2, q3, q5/);
    assert.match(describeBlockStep("marioFix", BAD_BLOCK), /q1, q3, q6, q7/);
    assert.match(describeBlockStep("check", BAD_BLOCK), /logical ZZ = -1/);
    assert.match(describeBlockStep("syndrome", BAD_BLOCK), /110 is 6/);
    assert.match(describeBlockStep("recheck", BAD_BLOCK), /logical ZZ = \+1, logical XX = \+1/);
    assert.equal(describeLogicalParities(0, 1), "logical ZZ = +1, logical XX = -1");
});


test("the key hints offer the two fixes while choosing, and Next round or Finish at the end of a round", () => {
    const chooseHints = listKeyHints({ stepId: "choose", isLastRound: false }).map((hint) => hint.key);
    assert.deepEqual(chooseHints, ["X", "Z", "Enter", "R"]);
    assert.equal(listKeyHints({ stepId: "done", isLastRound: true })[0].action, "Finish");
    assert.equal(listKeyHints({ stepId: "mario", isLastRound: false })[0].action, "Mario: 7 CNOTs");
});
