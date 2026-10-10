/**
 * Tests for src/steane_block/steane_block_plan.js: Level 3's rounds, circuit, wording and syndrome reading.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    ANCILLA_WIRE_ID, BUILD_PHASE, HADAMARD_POSITIONS, PICK_PHASE, VERIFICATION_POSITIONS, buildEncoderCircuit,
    countCleanChecks, describeFixResult, describeVerification, explainSyndromes, judgeBuildRound, listBuildRounds,
    listKeyHints, listTargetChoices, moveThroughChoices, nameFix, readSyndromePosition,
} from "../../src/steane_block/steane_block_plan.js";
import { STEANE_ENCODER_CNOTS, STEANE_HADAMARD_POSITIONS } from "../../src/hut/qec_codes.js";


test("the rounds spread q4, q2 and q1, each along the check that starts at it, as steane.py does", () => {
    const rounds = listBuildRounds();
    assert.deepEqual(rounds.map((round) => round.control), [4, 2, 1]);
    assert.deepEqual(rounds.map((round) => round.checkPositions), [[4, 5, 6, 7], [2, 3, 6, 7], [1, 3, 5, 7]]);
    assert.deepEqual([...HADAMARD_POSITIONS].sort(), [...STEANE_HADAMARD_POSITIONS].sort());
});


test("doing each round right gives exactly steane.py's 9 CNOTs, in its order", () => {
    const cnots = [];
    for (const round of listBuildRounds()) {
        for (const target of round.checkPositions.slice(1)) {
            cnots.push([round.control, target]);
        }
    }
    assert.deepEqual(cnots, STEANE_ENCODER_CNOTS);
});


test("a CNOT can target any qubit but its control, and the cursor wraps round", () => {
    assert.deepEqual(listTargetChoices(4), [1, 2, 3, 5, 6, 7]);
    assert.equal(moveThroughChoices([1, 2, 3], 3, 1), 1);
    assert.equal(moveThroughChoices([1, 2, 3], 1, -1), 3);
    assert.equal(moveThroughChoices(["X", "Z", "Y"], "X", 1), "Z");
});


test("a round is complete when its circle holds and the earlier circles still do", () => {
    assert.equal(judgeBuildRound({ x_checks: [1, 0, 0] }, 0, 3).isComplete, true);
    assert.equal(judgeBuildRound({ x_checks: [0, 0, 0] }, 0, 1).isComplete, false);
    const broken = judgeBuildRound({ x_checks: [0, 1, 0] }, 1, 3);
    assert.equal(broken.isComplete, false);
    assert.deepEqual(broken.brokenCheckIndices, [0]);
    assert.match(broken.message, /broke circle 4567/);
});


test("three CNOTs that leave the circle random point at a wrong target; fewer just ask for more", () => {
    assert.match(judgeBuildRound({ x_checks: [0, 0, 0] }, 0, 3).message, /outside it/);
    assert.match(judgeBuildRound({ x_checks: [0, 0, 0] }, 0, 1).message, /every other qubit/);
});


test("the circuit shows the H column, the CNOTs, the dashed ghost, then the paper's Z1 Z6 Z7 ancilla check", () => {
    const circuit = buildEncoderCircuit({
        hasHadamards: true, cnots: [[4, 5]], ghost: { control: 4, target: 6 }, hasVerification: true,
    });
    assert.equal(circuit.wires.length, 8);
    assert.equal(circuit.wires.at(-1).id, ANCILLA_WIRE_ID);
    assert.deepEqual(circuit.columns[0].map((gate) => gate.wire), ["q1", "q2", "q4"]);
    assert.deepEqual(circuit.columns[1], [{ gate: "cnot", control: "q4", target: "q5" }]);
    assert.equal(circuit.columns[2][0].look, "ghost");
    const checkControls = circuit.columns.slice(3, 6).map((column) => column[0].control);
    assert.deepEqual(checkControls, VERIFICATION_POSITIONS.map((position) => `q${position}`));
    assert.deepEqual(circuit.columns.at(-1), [{ gate: "measure", wire: ANCILLA_WIRE_ID, basis: "Z" }]);
});


test("a syndrome read as binary names the qubit: 110 is q6, 000 is none", () => {
    assert.equal(readSyndromePosition([1, 1, 0]), 6);
    assert.equal(readSyndromePosition([0, 0, 1]), 1);
    assert.equal(readSyndromePosition([0, 0, 0]), 0);
});


test("the worked answer names an X, a Z or a Y from the two syndromes", () => {
    assert.match(explainSyndromes([1, 1, 0], [0, 0, 0]), /X flip on q6/);
    assert.match(explainSyndromes([0, 0, 0], [0, 1, 1]), /Z flip on q3/);
    assert.match(explainSyndromes([1, 0, 1], [1, 0, 1]), /which is Y/);
});


test("a wrong fix says what the checks read now and gives the worked answer", () => {
    const errorRound = { z_syndrome: [1, 1, 0], x_syndrome: [0, 0, 0] };
    const wrong = describeFixResult({ is_fixed: false, z_syndrome: [0, 1, 1], x_syndrome: [0, 0, 0] }, errorRound);
    assert.match(wrong, /Z 011, X 000/);
    assert.match(wrong, /q6/);
    assert.match(describeFixResult({ is_fixed: true, z_syndrome: [0, 0, 0], x_syndrome: [0, 0, 0] }, errorRound),
        /Fixed/);
});


test("the ancilla check keeps a block that reads 0 and mentions the paper's 8-CNOT encoder", () => {
    assert.match(describeVerification(0), /keep the block/);
    assert.match(describeVerification(0), /8/);
    assert.match(describeVerification(1), /bad/);
});


test("fix names match the backend's table, and clean checks are counted", () => {
    assert.equal(nameFix("Y", 3), "Y3");
    assert.equal(countCleanChecks([1, 0, 1, 1, 1, 1], 1), 5);
    assert.equal(countCleanChecks([1, 1, 0, 0, 0, 0], 0), 4);
});


test("the key hints name the CNOT under the cursor and the fix about to be applied", () => {
    const buildHints = listKeyHints({ phase: BUILD_PHASE, roundIndex: 0, roundCnotCount: 0, cursorTarget: 5 });
    assert.ok(buildHints.some((hint) => hint.action === "CNOT q4 → q5"));
    assert.ok(!buildHints.some((hint) => hint.action === "Undo"));
    const pickHints = listKeyHints({ phase: PICK_PHASE, fixPauli: "Z", fixPosition: 3 });
    assert.ok(pickHints.some((hint) => hint.action === "Z on q3"));
});
