/**
 * Tests for src/qkd/chain_slots.js: the 6-12-6 castles and what one logical pair looks like during a message.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    BELL, IDLE, MEASURED, PAIR, PLUS, QUBITS_PER_BLOCK, TOWER_REGISTER_GROUPS, USED, ZERO, describeMessageSlots,
} from "../../src/qkd/chain_slots.js";


function looksOf(qubits, register) {
    return qubits[register].map((qubit) => qubit.look);
}


test("Alice, Bob and Charlie hold 6, 12 and 6 qubits", () => {
    const slotCounts = TOWER_REGISTER_GROUPS.map((groups) => groups.flat().length * QUBITS_PER_BLOCK);
    assert.deepEqual(slotCounts, [6, 12, 6]);
});


test("before a message every slot is idle", () => {
    const qubits = describeMessageSlots(new Set());
    assert.deepEqual(looksOf(qubits, "a"), [IDLE, IDLE, IDLE]);
    assert.deepEqual(looksOf(qubits, "c2"), [IDLE, IDLE, IDLE]);
});


test("an encrypted message walks one pair through heralding, encoding, the CNOT, the swap and the measurement", () => {
    const phases = new Set(["heralding"]);
    assert.deepEqual(looksOf(describeMessageSlots(phases), "b"), [PAIR, PAIR, PAIR]);
    phases.add("encoding");
    assert.deepEqual(looksOf(describeMessageSlots(phases), "a2"), [PLUS, PLUS, PLUS]);
    assert.deepEqual(looksOf(describeMessageSlots(phases), "d"), [ZERO, ZERO, ZERO]);
    phases.add("teleported_cnot");
    assert.deepEqual(looksOf(describeMessageSlots(phases), "c"), [USED, USED, USED]);
    assert.deepEqual(looksOf(describeMessageSlots(phases), "d2"), [BELL, BELL, BELL]);
    phases.add("encoded_swapping");
    assert.deepEqual(looksOf(describeMessageSlots(phases), "a2"), [MEASURED, MEASURED, MEASURED]);
    assert.deepEqual(looksOf(describeMessageSlots(phases), "a"), [BELL, BELL, BELL]);
    phases.add("qkd_measure");
    assert.deepEqual(looksOf(describeMessageSlots(phases), "a"), [MEASURED, MEASURED, MEASURED]);
});


test("a classical message never touches the qubits", () => {
    const qubits = describeMessageSlots(new Set(["classical_send", "deliver"]));
    assert.deepEqual(looksOf(qubits, "a"), [IDLE, IDLE, IDLE]);
});
