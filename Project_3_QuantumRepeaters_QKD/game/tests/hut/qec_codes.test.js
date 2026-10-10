/**
 * Tests for src/hut/qec_codes.js: the codes, circuits and fault spreading Toad's QEC hut shows.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    ANCILLA_WIRE, FLAG_WIRE, STEANE_DIAGRAM, STEANE_ENCODER_CNOTS, STEANE_HADAMARD_POSITIONS,
    buildBitFlipCircuit, buildCheckCircuit, buildSteaneEncoderCircuit, decodeSteaneXErrors,
    findCorrectableErrorCount, findHookFaultColumn, findSteaneDecoderFlip, listBitFlipSyndromeTable,
    listDataPositions, listExampleCodes, listSteaneCheckPositions, measureBitFlipChecks, spreadXFault,
} from "../../src/hut/qec_codes.js";


test("each single bit flip of the 3-qubit code gives its own syndrome, and no flip gives 00 (N&C §10.1.1)", () => {
    assert.deepEqual(measureBitFlipChecks(null), [0, 0]);
    assert.deepEqual(measureBitFlipChecks(1), [1, 0]);
    assert.deepEqual(measureBitFlipChecks(2), [1, 1]);
    assert.deepEqual(measureBitFlipChecks(3), [0, 1]);
    const syndromes = listBitFlipSyndromeTable().map((row) => row.checkResults.join(""));
    assert.equal(new Set(syndromes).size, 4);
});


test("a distance-d code corrects ⌊(d−1)/2⌋ errors and rejects a distance below 1", () => {
    assert.equal(findCorrectableErrorCount(1), 0);
    assert.equal(findCorrectableErrorCount(3), 1);
    assert.equal(findCorrectableErrorCount(5), 2);
    assert.throws(() => findCorrectableErrorCount(0));
    assert.throws(() => findCorrectableErrorCount(2.5));
});


test("the example codes: [[3,1,1]] bit flip (3 against X), Steane [[7,1,3]], rotated surface [[25,1,5]]", () => {
    const codes = listExampleCodes();
    assert.deepEqual(codes.map((code) => [code.qubitCount, code.logicalCount]), [[3, 1], [7, 1], [25, 1]]);
    assert.deepEqual(codes.map((code) => [code.xDistance, code.zDistance]), [[3, 1], [3, 3], [5, 5]]);
});


test("the Steane checks are the Hamming rows: qubits 4567, 2367 and 1357", () => {
    assert.deepEqual(listSteaneCheckPositions(), [[4, 5, 6, 7], [2, 3, 6, 7], [1, 3, 5, 7]]);
});


test("the Steane decoder corrects every single X error (Steane 1996)", () => {
    for (let position = 1; position <= 7; position++) {
        assert.equal(findSteaneDecoderFlip([position]), position);
        assert.deepEqual(decodeSteaneXErrors([position]), { remainingPositions: [], isLogicalError: false });
    }
    assert.equal(findSteaneDecoderFlip([]), 0);
});


test("two X errors fool the Steane decoder into a logical X̄", () => {
    assert.equal(decodeSteaneXErrors([6, 7]).isLogicalError, true);
});


test("each qubit in the Steane diagram sits inside exactly the circles of the checks that touch it", () => {
    const checkPositions = listSteaneCheckPositions();
    for (const [positionText, spot] of Object.entries(STEANE_DIAGRAM.qubitSpots)) {
        const position = Number(positionText);
        for (let i = 0; i < STEANE_DIAGRAM.circles.length; i++) {
            const circle = STEANE_DIAGRAM.circles[i];
            const distance = Math.hypot(spot.x - circle.centerX, spot.y - circle.centerY);
            const isInside = distance < STEANE_DIAGRAM.circleRadius;
            assert.equal(isInside, checkPositions[i].includes(position), `qubit ${position}, circle ${i + 1}`);
        }
    }
});


test("the Steane encoder is steane.py's: H on q1, q2, q4, then its 9 CNOTs in order", () => {
    const circuit = buildSteaneEncoderCircuit();
    assert.equal(circuit.wires.length, 7);
    assert.deepEqual(circuit.columns[0].map((gate) => gate.wire), STEANE_HADAMARD_POSITIONS.map((p) => `q${p}`));
    const cnots = circuit.columns.slice(1).map((column) => [column[0].control, column[0].target]);
    assert.deepEqual(cnots, STEANE_ENCODER_CNOTS.map(([control, target]) => [`q${control}`, `q${target}`]));
});


test("each encoder CNOT spreads a Hadamard qubit along its Steane check row", () => {
    const checkPositions = listSteaneCheckPositions();
    for (const hadamardPosition of STEANE_HADAMARD_POSITIONS) {
        const targets = STEANE_ENCODER_CNOTS.filter(([control]) => control === hadamardPosition).map((cnot) => cnot[1]);
        const row = checkPositions.find((positions) => positions[0] === hadamardPosition);
        assert.deepEqual([hadamardPosition, ...targets], row);
    }
});


test("the bit-flip circuit encodes with 2 CNOTs from q1 and measures both checks", () => {
    const circuit = buildBitFlipCircuit();
    assert.deepEqual(circuit.columns[0], [{ gate: "cnot", control: "q1", target: "q2" }]);
    assert.deepEqual(circuit.columns[1], [{ gate: "cnot", control: "q1", target: "q3" }]);
    assert.deepEqual(circuit.columns.at(-1).map((gate) => gate.wire), ["a1", "a2"]);
});


test("without a flag, one ancilla X fault after the 2nd data CNOT spreads to q6 and q7: a hook error", () => {
    const circuit = buildCheckCircuit(false);
    const xWires = spreadXFault(circuit, ANCILLA_WIRE, findHookFaultColumn(circuit));
    assert.deepEqual(listDataPositions(xWires), [6, 7]);
    assert.equal(decodeSteaneXErrors(listDataPositions(xWires)).isLogicalError, true);
});


test("with a flag, the same fault also reaches the flag, so the flag reads 1 (Chao & Reichardt 2018)", () => {
    const circuit = buildCheckCircuit(true);
    const xWires = spreadXFault(circuit, ANCILLA_WIRE, findHookFaultColumn(circuit));
    assert.deepEqual(listDataPositions(xWires), [6, 7]);
    assert.ok(xWires.has(FLAG_WIRE));
});


test("a fault on the ancilla after its last data CNOT spreads to no data qubit and leaves the flag at 0", () => {
    const circuit = buildCheckCircuit(true);
    const lastDataColumn = circuit.columns.length - 2;
    const xWires = spreadXFault(circuit, ANCILLA_WIRE, lastDataColumn);
    assert.deepEqual(listDataPositions(xWires), []);
    assert.equal(xWires.has(FLAG_WIRE), false);
});
