/**
 * Tests for src/hut_paging.js: paging through the panels of Toad's huts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    applyPageStep, describePanelPosition, findNextPanelIndex, findPageStep, findPreviousPanelIndex,
} from "../../src/hut_paging.js";


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
