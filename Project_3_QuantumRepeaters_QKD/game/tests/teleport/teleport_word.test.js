/**
 * Tests for src/teleport/teleport_word.js: the 5-bit letter code, "HI" as 10 teleports, assembling Luigi's word and
 * the win check.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CHALLENGE_WORD, assembleWord, decodeLetter, encodeLetter, encodeWord, formatWordProgress, isWordCleared,
    isWordComplete,
} from "../../src/teleport/teleport_word.js";

const HI_BITS = ["0", "0", "1", "1", "1", "0", "1", "0", "0", "0"];


test("letters encode as 5 bits: A = 00000, H = 00111, I = 01000, Z = 11001", () => {
    assert.equal(encodeLetter("A"), "00000");
    assert.equal(encodeLetter("H"), "00111");
    assert.equal(encodeLetter("I"), "01000");
    assert.equal(encodeLetter("Z"), "11001");
    assert.throws(() => encodeLetter("a"), /capital letter/);
    assert.throws(() => encodeLetter("HI"), /capital letter/);
});


test("every letter decodes back to itself; codes past Z are no letter", () => {
    for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
        const letter = String.fromCharCode(code);
        assert.equal(decodeLetter(encodeLetter(letter)), letter);
    }
    assert.equal(decodeLetter("11010"), "?");
    assert.equal(decodeLetter("11111"), "?");
    assert.throws(() => decodeLetter("0101"), /5 bits/);
    assert.throws(() => decodeLetter("0102a"), /5 bits/);
});


test("HI is 10 teleports of |0⟩ or |1⟩", () => {
    assert.equal(CHALLENGE_WORD, "HI");
    assert.deepEqual(encodeWord("HI"), HI_BITS);
});


test("Luigi's word builds up a letter per 5 bits", () => {
    assert.deepEqual(assembleWord([]), { letters: "", pendingBits: "" });
    assert.deepEqual(assembleWord(HI_BITS.slice(0, 3)), { letters: "", pendingBits: "001" });
    assert.deepEqual(assembleWord(HI_BITS.slice(0, 7)), { letters: "H", pendingBits: "01" });
    assert.deepEqual(assembleWord(HI_BITS), { letters: "HI", pendingBits: "" });
    assert.equal(formatWordProgress([], "HI"), "__");
    assert.equal(formatWordProgress(HI_BITS.slice(0, 6), "HI"), "H_");
    assert.equal(formatWordProgress(HI_BITS, "HI"), "HI");
});


test("the level is cleared only when Luigi reads exactly HI", () => {
    assert.equal(isWordCleared(HI_BITS, "HI"), true);
    assert.equal(isWordCleared(HI_BITS.slice(0, 9), "HI"), false);
    assert.equal(isWordComplete(HI_BITS.slice(0, 9), "HI"), false);
    const oneBitWrong = [...HI_BITS];
    oneBitWrong[9] = "1";
    assert.equal(isWordComplete(oneBitWrong, "HI"), true);
    assert.equal(assembleWord(oneBitWrong).letters, "HJ");
    assert.equal(isWordCleared(oneBitWrong, "HI"), false);
    assert.equal(isWordCleared([...HI_BITS, "0"], "HI"), false);
});
