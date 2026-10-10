/**
 * Tests for src/bb84_hut/bb84_hut_panels.js: Toad's BB84 panels, the intercept-resend error rate, and paging.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    AWARD_SOURCE, AWARD_SOURCE_URL, BB84_EXAMPLE, BB84_PANELS, BB84_SOURCE, RANDOM_BIT, SAMPLE_SIZE, WIKIPEDIA_URL,
    applyPageStep, countSampleErrors, describePanelPosition, findInterceptResendErrorRate, findNextPanelIndex,
    findPageStep, findPreviousPanelIndex, listEveRiskPositions, listSiftedPositions, predictBobBit,
} from "../../src/bb84_hut/bb84_hut_panels.js";

// The game's style is terse: no line runs past this many characters.
const LONGEST_LINE_CHARACTERS = 110;


test("an eavesdropper who measures every photon spoils a quarter of the sifted bits (Bennett & Brassard 1984)", () => {
    assert.equal(findInterceptResendErrorRate(), 0.25);
    assert.match(BB84_SOURCE, /Bennett & Brassard/);
    assert.match(BB84_SOURCE, /1984/);
});


test("the panels go: bases, random picks, sifting, the eavesdropper, catching her, the inventors", () => {
    const headings = BB84_PANELS.map((panel) => panel.heading);
    assert.deepEqual(headings, [
        "Two bases", "Random picks", "Sifting", "An eavesdropper", "Catch her", "The inventors",
    ]);
});


test("every panel has its own picture", () => {
    const pictures = BB84_PANELS.map((panel) => panel.picture);
    assert.deepEqual(pictures, ["bases", "picks", "sifting", "eavesdropper", "sample", "inventors"]);
});


test("Bob reads Alice's bit in her basis and a coin flip in the other", () => {
    assert.equal(predictBobBit(1, "+", "+"), 1);
    assert.equal(predictBobBit(0, "x", "x"), 0);
    assert.equal(predictBobBit(1, "+", "x"), RANDOM_BIT);
});


test("sifting keeps exactly the positions where the bases match", () => {
    assert.deepEqual(listSiftedPositions(["+", "x", "+"], ["+", "+", "+"]), [0, 2]);
    assert.deepEqual(listSiftedPositions(BB84_EXAMPLE.aliceBases, BB84_EXAMPLE.bobBases), [0, 2, 4, 6, 7]);
});


test("Eve can only spoil kept bits she measured in the wrong basis, and the example flips one of those", () => {
    const riskPositions = listEveRiskPositions(BB84_EXAMPLE);
    assert.deepEqual(riskPositions, [2, 6]);
    for (const position of BB84_EXAMPLE.eveFlippedPositions) {
        assert.ok(riskPositions.includes(position));
    }
});


test("a 20-bit sample shows no errors without Eve and 5 with her", () => {
    assert.equal(countSampleErrors(SAMPLE_SIZE, 0), 0);
    assert.equal(countSampleErrors(SAMPLE_SIZE, findInterceptResendErrorRate()), 5);
});


test("the inventors panel names Bennett and Brassard and the award ACM announced, with links to sources", () => {
    const inventorsText = BB84_PANELS.at(-1).lines.join(" ");
    assert.match(inventorsText, /Charles Bennett/);
    assert.match(inventorsText, /Gilles Brassard/);
    assert.match(inventorsText, /2025 ACM A\.M\. Turing Award/);
    assert.match(AWARD_SOURCE, /ACM/);
    assert.match(AWARD_SOURCE_URL, /^https:\/\/www\.acm\.org\//);
    assert.equal(WIKIPEDIA_URL, "https://en.wikipedia.org/wiki/BB84");
});


test("the bases panel names both bases and the eavesdropper panels say 25%", () => {
    const basesText = BB84_PANELS[0].lines.join(" ");
    assert.match(basesText, /\+ basis/);
    assert.match(basesText, /x basis/);
    const eavesdropperText = BB84_PANELS.slice(3).map((panel) => panel.lines.join(" ")).join(" ");
    assert.match(eavesdropperText, /25%/);
});


test("every panel is short", () => {
    for (const panel of BB84_PANELS) {
        assert.ok(panel.lines.length >= 1 && panel.lines.length <= 3, panel.heading);
        for (const line of panel.lines) {
            assert.ok(line.length <= LONGEST_LINE_CHARACTERS, line);
        }
    }
});


test("paging forward stops on the last panel and paging back stops on the first", () => {
    assert.equal(findNextPanelIndex(0, 5), 1);
    assert.equal(findNextPanelIndex(4, 5), 4);
    assert.equal(findPreviousPanelIndex(1), 0);
    assert.equal(findPreviousPanelIndex(0), 0);
});


test("Space, Enter and → page forward; ← and Backspace page back; other keys do nothing", () => {
    assert.equal(findPageStep(" "), "next");
    assert.equal(findPageStep("Enter"), "next");
    assert.equal(findPageStep("ArrowRight"), "next");
    assert.equal(findPageStep("ArrowLeft"), "previous");
    assert.equal(findPageStep("Backspace"), "previous");
    assert.equal(findPageStep("q"), null);
    assert.equal(applyPageStep(2, "next", 5), 3);
    assert.equal(applyPageStep(2, "previous", 5), 1);
});


test("the counter shows the panel number out of the total", () => {
    assert.equal(describePanelPosition(0, 5), "1 / 5");
    assert.equal(describePanelPosition(5, 6), "6 / 6");
});
