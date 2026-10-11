/**
 * Tests for src/qkd/swap_tutorial_plan.js: the order of the tutorial's pages, what each qubit slot shows after each
 * step, the corrections the animations flash, and the key hints.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { BELL, FIXED, FLIPPED, MEASURED, USED, WAITING } from "../../src/qkd/chain_slots.js";
import {
    FLASH_EFFECT, NOTE_PAGE, STEP_COUNT, STEP_PAGE, buildTutorialPages, describeScene, formatSign, listTutorialKeyHints,
} from "../../src/qkd/swap_tutorial_plan.js";

// A real POST /api/repetition-swap answer (seed 1985): a2[1] flipped, the syndrome 11 names it, m_x = 1, m_z = 0.
function makeResponse() {
    return {
        seed: 1985,
        links: [
            { m_bits: [1, 0, 1], n_bits: [0, 0, 0], zz: 1, xx: 1 },
            { m_bits: [0, 0, 0], n_bits: [0, 1, 1], zz: 1, xx: 1 },
        ],
        swap: {
            flipped_qubit: 1, x_bits: [0, 1, 0], z_bits: [0, 1, 0], syndrome: [1, 1], fixed_qubit: 1,
            fixed_z_bits: [0, 0, 0], m_x: 1, m_z: 0, m_z_without_fix: 1,
        },
        before_frame: { xx: -1, yy: 1, zz: 1, fidelity: 0 },
        after_frame: { xx: 1, yy: -1, zz: 1, fidelity: 1 },
        without_fix: { xx: 1, yy: 1, zz: -1, fidelity: 0 },
    };
}


function textOf(page) {
    const parts = [];
    for (const line of page.lines) {
        for (const part of line) {
            parts.push(typeof part === "string" ? part : part.symbol);
        }
    }
    return parts.join(" ");
}


function findStep(pages, stepNumber) {
    return pages.find((page) => page.kind === STEP_PAGE && page.stepNumber === stepNumber);
}


test("three notes on the code come first, then the 11 steps in order, with a pause before the swap and its fix", () => {
    const pages = buildTutorialPages(makeResponse());
    const shape = pages.map((page) => (page.kind === NOTE_PAGE ? "note" : page.stepNumber));
    assert.deepEqual(shape, ["note", "note", "note", 1, 2, 3, 4, 5, 6, 7, "note", 8, "note", 9, 10, 11, "note"]);
    for (const page of pages) {
        assert.equal(page.counter, page.kind === NOTE_PAGE ? "PAUSED" : `STEP ${page.stepNumber}/${STEP_COUNT}`);
    }
});


test("a note never moves the protocol on", () => {
    const pages = buildTutorialPages(makeResponse());
    for (let i = 1; i < pages.length; i++) {
        if (pages[i].kind === NOTE_PAGE) {
            assert.equal(pages[i].stepNumber, pages[i - 1].stepNumber);
            assert.deepEqual(pages[i].effects, []);
        }
    }
});


test("before Step 1 every slot waits", () => {
    const scene = describeScene(makeResponse(), 0);
    for (const qubitStates of Object.values(scene.qubits)) {
        assert.deepEqual(qubitStates.map((qubit) => qubit.look), [WAITING, WAITING, WAITING]);
    }
});


test("the teleported CNOT shows b's and c's bits, then uses them up, leaving a and d as the logical pair", () => {
    const response = makeResponse();
    const afterStep4 = describeScene(response, 4);
    assert.deepEqual(afterStep4.qubits.b.map((qubit) => qubit.text), ["1", "0", "1"]);
    assert.deepEqual(afterStep4.qubits.c.map((qubit) => qubit.look), [MEASURED, MEASURED, MEASURED]);
    assert.deepEqual(afterStep4.qubits.a.map((qubit) => qubit.look), [BELL, BELL, BELL]);
    assert.deepEqual(afterStep4.logicalLinks, [true, false]);
    const afterStep5 = describeScene(response, 5);
    assert.deepEqual(afterStep5.qubits.b.map((qubit) => qubit.look), [USED, USED, USED]);
    assert.equal(afterStep5.qubits.a2[0].look, WAITING);
});


test("the flipped a2 bit stands out after the swap and turns into the fixed bit after the decoding", () => {
    const response = makeResponse();
    const afterSwap = describeScene(response, 8);
    assert.deepEqual(afterSwap.qubits.a2.map((qubit) => qubit.text), ["0", "1", "0"]);
    assert.deepEqual(afterSwap.qubits.a2.map((qubit) => qubit.look), [MEASURED, FLIPPED, MEASURED]);
    assert.deepEqual(afterSwap.logicalLinks, [false, false]);
    const afterFix = describeScene(response, 9);
    assert.deepEqual(afterFix.qubits.a2[1], { look: FIXED, text: "0" });
    assert.equal(afterFix.hasEndToEndPair, false);
    assert.equal(describeScene(response, 10).hasEndToEndPair, true);
});


test("Step 9 explains the syndrome and flashes the bit it fixes", () => {
    const step9 = findStep(buildTutorialPages(makeResponse()), 9);
    assert.match(textOf(step9), /s1 = 0 xor 1 = 1, s2 = 1 xor 0 = 1: flip bit 1 -> 0 0 0/);
    assert.match(textOf(step9), /Without the fix m_z would be 1/);
    assert.deepEqual(step9.effects, [
        { kind: FLASH_EFFECT, register: "a2", positions: [1], letter: "0", tone: "fix" },
    ]);
});


test("Charlie's frame: X on all of d2 only when m_z is 1, Z on d2[0] only when m_x is 1", () => {
    const response = makeResponse();
    const flashes = findStep(buildTutorialPages(response), 10).effects.filter((effect) => effect.kind === FLASH_EFFECT);
    assert.deepEqual(flashes.map((flash) => [flash.letter, flash.positions]), [["X", []], ["Z", [0]]]);

    response.swap.m_z = 1;
    response.swap.m_x = 0;
    const flipped = findStep(buildTutorialPages(response), 10).effects.filter((effect) => effect.kind === FLASH_EFFECT);
    assert.deepEqual(flipped.map((flash) => [flash.letter, flash.positions]), [["X", [0, 1, 2]], ["Z", []]]);
});


test("Space names the next page, and after the last one it moves on to the messages", () => {
    const pages = buildTutorialPages(makeResponse());
    assert.deepEqual(listTutorialKeyHints({ isLoading: true, pages: [], pageCount: 0 }), [{ key: "…", action: "Loading" }]);
    const firstHints = listTutorialKeyHints({ isLoading: false, pages, pageCount: 0 });
    assert.deepEqual(firstHints[0], { key: "Space", action: "The repetition code" });
    assert.deepEqual(firstHints[2], { key: "Esc", action: "Skip to messages" });
    const beforeStep1 = listTutorialKeyHints({ isLoading: false, pages, pageCount: 3 });
    assert.deepEqual(beforeStep1[0], { key: "Space", action: "Step 1: Initialize" });
    const lastHints = listTutorialKeyHints({ isLoading: false, pages, pageCount: pages.length });
    assert.deepEqual(lastHints[0], { key: "Space", action: "Send messages" });
});


test("a response that is not two links of 3-qubit blocks fails fast", () => {
    const response = makeResponse();
    response.links.pop();
    assert.throws(() => buildTutorialPages(response), /expected 2 links/);
});


test("signs are written with a plain hyphen", () => {
    assert.equal(formatSign(1), "+1");
    assert.equal(formatSign(-1), "-1");
    assert.equal(formatSign(0), "0");
});
