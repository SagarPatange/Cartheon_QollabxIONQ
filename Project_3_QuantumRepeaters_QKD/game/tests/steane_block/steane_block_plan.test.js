/**
 * Tests for src/steane_block/steane_block_plan.js: Level 3's rounds (the Error Correction Zoo's Steane encoder),
 * circuit, wording and syndrome reading.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    ANCILLA_WIRE_ID, BUILD_PHASE, CHECK_POSITIONS, ENCODER_CNOTS, HADAMARD_PHASE, HADAMARD_POSITIONS, PICK_PHASE,
    VERIFICATION_POSITIONS, buildEncoderCircuit, countCleanChecks, describeFixResult, describeVerification,
    explainSyndromes, findFlippedPosition, judgeBuildRound, listBuildRounds, listKeyHints, listTargetChoices,
    moveThroughChoices, nameFix, readSyndromePosition,
} from "../../src/steane_block/steane_block_plan.js";


test("the rounds follow the Zoo figure: q0 copies psi, then q6, q5 and q4 each spread along their circle", () => {
    const rounds = listBuildRounds();
    assert.deepEqual(rounds.map((round) => round.control), [0, 6, 5, 4]);
    assert.deepEqual(rounds.map((round) => round.targets), [[1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]);
    assert.deepEqual(rounds.map((round) => round.checkIndex), [null, 0, 1, 2]);
    assert.deepEqual(CHECK_POSITIONS, [[0, 1, 3, 6], [0, 2, 3, 5], [1, 2, 3, 4]]);
    assert.deepEqual(HADAMARD_POSITIONS, [4, 5, 6]);
});


test("doing each round right gives exactly the Zoo encoder's 11 CNOTs, in its order", () => {
    const cnots = listBuildRounds().flatMap((round) => round.targets.map((target) => [round.control, target]));
    assert.deepEqual(cnots, ENCODER_CNOTS);
    assert.equal(cnots.length, 11);
});


test("a CNOT can target any qubit but its control, and the cursor wraps round", () => {
    assert.deepEqual(listTargetChoices(4), [0, 1, 2, 3, 5, 6]);
    assert.equal(moveThroughChoices([1, 2, 3], 3, 1), 1);
    assert.equal(moveThroughChoices([1, 2, 3], 1, -1), 3);
    assert.equal(moveThroughChoices(["X", "Z", "Y"], "X", 1), "Z");
});


test("the copy round is done once q0 reaches q1 and q2, whatever the checks read", () => {
    assert.equal(judgeBuildRound({ x_checks: [0, 0, 0] }, 0, [1, 2]).isComplete, true);
    const halfway = judgeBuildRound({ x_checks: [0, 0, 0] }, 0, [1]);
    assert.equal(halfway.isComplete, false);
    assert.equal(halfway.isWrong, false);
    const wrong = judgeBuildRound({ x_checks: [0, 0, 0] }, 0, [3]);
    assert.equal(wrong.isWrong, true);
    assert.match(wrong.message, /q0 copies \|ψ⟩ only onto q1 and q2/);
});


test("a circle round is complete when its circle holds and the earlier circles still do", () => {
    assert.equal(judgeBuildRound({ x_checks: [1, 0, 0] }, 1, [0, 1, 3]).isComplete, true);
    assert.equal(judgeBuildRound({ x_checks: [0, 0, 0] }, 1, [0]).isComplete, false);
    const broken = judgeBuildRound({ x_checks: [0, 1, 0] }, 2, [0, 2, 3]);
    assert.equal(broken.isComplete, false);
    assert.deepEqual(broken.brokenCheckIndices, [0]);
    assert.match(broken.message, /broke circle 0136/);
});


test("a CNOT onto a qubit outside the round's circle is wrong at once, and says which qubits are right", () => {
    const judgement = judgeBuildRound({ x_checks: [1, 0, 0] }, 2, [1]);
    assert.equal(judgement.isWrong, true);
    assert.equal(judgement.isComplete, false);
    assert.equal(judgement.wrongTargetIndex, 0);
    assert.match(judgement.message, /q1 is not in circle 0235/);
    assert.match(judgement.message, /q0, q2 and q3/);
    assert.match(judgement.message, /Backspace/);
});


// q4 is |+⟩ during q5's round, so CNOT q5 → q4 changes nothing the checks can see; the rule still catches it.
test("a wrong CNOT keeps the round open even when the checks read fine", () => {
    const judgement = judgeBuildRound({ x_checks: [1, 1, 0] }, 2, [0, 4, 2, 3]);
    assert.equal(judgement.isComplete, false);
    assert.equal(judgement.isWrong, true);
    assert.equal(judgement.wrongTargetIndex, 1);
});


test("a second CNOT onto the same qubit is wrong too: it cancels the first", () => {
    const judgement = judgeBuildRound({ x_checks: [0, 0, 0] }, 1, [0, 0]);
    assert.equal(judgement.isWrong, true);
    assert.equal(judgement.wrongTargetIndex, 1);
    assert.match(judgement.message, /q0 already has a CNOT from q6/);
});


test("right CNOTs that don't finish the circle yet just ask for more", () => {
    const judgement = judgeBuildRound({ x_checks: [0, 0, 0] }, 1, [0]);
    assert.equal(judgement.isWrong, false);
    assert.equal(judgement.wrongTargetIndex, null);
    assert.match(judgement.message, /every other qubit/);
});


test("the circuit starts q0 in |ψ⟩, puts H on q4-q6, then the CNOTs, the ghost and the Z0 Z1 Z2 ancilla check", () => {
    const circuit = buildEncoderCircuit({
        hasHadamards: true, cnots: [[0, 1]], ghost: { control: 0, target: 2 }, hasVerification: true,
    });
    assert.equal(circuit.wires.length, 8);
    assert.deepEqual(circuit.wires.slice(0, 7).map((wire) => wire.id), ["q0", "q1", "q2", "q3", "q4", "q5", "q6"]);
    assert.equal(circuit.wires[0].start, "|ψ⟩");
    assert.equal(circuit.wires[1].start, "|0⟩");
    assert.equal(circuit.wires.at(-1).id, ANCILLA_WIRE_ID);
    assert.deepEqual(circuit.columns[0].map((gate) => gate.wire), ["q4", "q5", "q6"]);
    assert.deepEqual(circuit.columns[1], [{ gate: "cnot", control: "q0", target: "q1" }]);
    assert.equal(circuit.columns[2][0].look, "ghost");
    const checkControls = circuit.columns.slice(3, 6).map((column) => column[0].control);
    assert.deepEqual(checkControls, VERIFICATION_POSITIONS.map((position) => `q${position}`));
    assert.deepEqual(circuit.columns.at(-1), [{ gate: "measure", wire: ANCILLA_WIRE_ID, basis: "Z" }]);
});


test("the wrong CNOT is drawn in the wrong look; the others are drawn plainly", () => {
    const circuit = buildEncoderCircuit({
        hasHadamards: true, cnots: [[0, 1], [0, 3]], ghost: null, hasVerification: false, wrongCnotIndex: 1,
    });
    assert.equal(circuit.columns[1][0].look, undefined);
    assert.equal(circuit.columns[2][0].look, "wrong");
});


test("the circles that fired name the qubit inside exactly them", () => {
    assert.equal(findFlippedPosition([1, 1, 0]), 0);
    assert.equal(findFlippedPosition([1, 1, 1]), 3);
    assert.equal(findFlippedPosition([0, 0, 1]), 4);
    assert.equal(findFlippedPosition([1, 0, 0]), 6);
    assert.equal(findFlippedPosition([0, 0, 0]), null);
});


test("Level 4's textbook numbering still reads a syndrome as binary: 110 is q6, 000 is none", () => {
    assert.equal(readSyndromePosition([1, 1, 0]), 6);
    assert.equal(readSyndromePosition([0, 0, 1]), 1);
    assert.equal(readSyndromePosition([0, 0, 0]), 0);
});


test("the worked answer names the circles that fired and the X, Z or Y they point at", () => {
    const xFlip = explainSyndromes([1, 1, 0], [0, 0, 0]);
    assert.match(xFlip, /0136 and 0235 fired/);
    assert.match(xFlip, /X flip on q0/);
    assert.match(explainSyndromes([0, 0, 0], [0, 1, 1]), /Z flip on q2/);
    assert.match(explainSyndromes([1, 0, 1], [1, 0, 1]), /which is Y/);
});


test("a wrong fix says what the checks read now and gives the worked answer", () => {
    const errorRound = { z_syndrome: [1, 1, 0], x_syndrome: [0, 0, 0] };
    const wrong = describeFixResult({ is_fixed: false, z_syndrome: [0, 1, 1], x_syndrome: [0, 0, 0] }, errorRound);
    assert.match(wrong, /Z 011, X 000/);
    assert.match(wrong, /q0/);
    assert.match(describeFixResult({ is_fixed: true, z_syndrome: [0, 0, 0], x_syndrome: [0, 0, 0] }, errorRound),
        /Fixed/);
});


test("the ancilla check keeps a block that reads 0 and says why this encoder needs 11 CNOTs", () => {
    assert.match(describeVerification(0), /keep the block/);
    assert.match(describeVerification(0), /11 CNOTs/);
    assert.match(describeVerification(1), /bad/);
});


test("fix names match the backend's table, and clean checks are counted", () => {
    assert.equal(nameFix("Y", 3), "Y3");
    assert.equal(nameFix("X", 0), "X0");
    assert.equal(countCleanChecks([1, 0, 1, 1, 1, 1], 1), 5);
    assert.equal(countCleanChecks([1, 1, 0, 0, 0, 0], 0), 4);
});


test("the key hints name the H gates, the CNOT under the cursor and the fix about to be applied", () => {
    assert.equal(listKeyHints({ phase: HADAMARD_PHASE })[0].action, "H on q4, q5, q6");
    const buildHints = listKeyHints({ phase: BUILD_PHASE, roundIndex: 1, roundCnotCount: 0, cursorTarget: 0 });
    assert.ok(buildHints.some((hint) => hint.key === "Enter" && hint.action === "CNOT q6 → q0"));
    assert.ok(!buildHints.some((hint) => hint.action === "Undo"));
    assert.ok(!buildHints.some((hint) => hint.key === "Space"));
    const pickHints = listKeyHints({ phase: PICK_PHASE, fixPauli: "Z", fixPosition: 3 });
    assert.ok(pickHints.some((hint) => hint.key === "Enter" && hint.action === "Z on q3"));
    assert.ok(!pickHints.some((hint) => hint.key === "Space"));
});
