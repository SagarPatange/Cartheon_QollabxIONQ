/**
 * Tests for src/start/scroll_hint.js: when the map's scroll arrows show and how far a click scrolls.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    SCROLL_END_THRESHOLD_PX, SCROLL_STEP_FRACTION, findScrollStepPx, shouldShowScrollLeftHint,
    shouldShowScrollRightHint,
} from "../../src/start/scroll_hint.js";

// A view 800 px wide over a map 2000 px wide, so the furthest it can scroll is 1200 px.
const VIEW_WIDTH_PX = 800;
const MAP_WIDTH_PX = 2000;
const MAX_SCROLL_PX = MAP_WIDTH_PX - VIEW_WIDTH_PX;


test("the right arrow shows at the left end and partway along", () => {
    assert.equal(shouldShowScrollRightHint(0, VIEW_WIDTH_PX, MAP_WIDTH_PX), true);
    assert.equal(shouldShowScrollRightHint(MAX_SCROLL_PX / 2, VIEW_WIDTH_PX, MAP_WIDTH_PX), true);
});


test("the right arrow hides at the right end and within the threshold of it", () => {
    assert.equal(shouldShowScrollRightHint(MAX_SCROLL_PX, VIEW_WIDTH_PX, MAP_WIDTH_PX), false);
    const justShortOfTheEnd = MAX_SCROLL_PX - SCROLL_END_THRESHOLD_PX;
    assert.equal(shouldShowScrollRightHint(justShortOfTheEnd, VIEW_WIDTH_PX, MAP_WIDTH_PX), false);
    const pastTheThreshold = justShortOfTheEnd - 1;
    assert.equal(shouldShowScrollRightHint(pastTheThreshold, VIEW_WIDTH_PX, MAP_WIDTH_PX), true);
});


test("the right arrow hides when the whole map fits in the view", () => {
    assert.equal(shouldShowScrollRightHint(0, VIEW_WIDTH_PX, VIEW_WIDTH_PX), false);
    const mapNarrowerThanView = VIEW_WIDTH_PX - 100;
    assert.equal(shouldShowScrollRightHint(0, VIEW_WIDTH_PX, mapNarrowerThanView), false);
});


test("the right arrow hides on a fractional scroll position a pixel short of the end", () => {
    assert.equal(shouldShowScrollRightHint(MAX_SCROLL_PX - 0.5, VIEW_WIDTH_PX, MAP_WIDTH_PX), false);
});


test("the left arrow hides at the left end and shows once scrolled past the threshold", () => {
    assert.equal(shouldShowScrollLeftHint(0), false);
    assert.equal(shouldShowScrollLeftHint(SCROLL_END_THRESHOLD_PX), false);
    assert.equal(shouldShowScrollLeftHint(SCROLL_END_THRESHOLD_PX + 1), true);
    assert.equal(shouldShowScrollLeftHint(MAX_SCROLL_PX), true);
});


test("one click scrolls a whole number of pixels, most of a view-width", () => {
    const stepPx = findScrollStepPx(VIEW_WIDTH_PX);
    assert.equal(stepPx, Math.round(VIEW_WIDTH_PX * SCROLL_STEP_FRACTION));
    assert.ok(stepPx > 0 && stepPx < VIEW_WIDTH_PX);
    assert.equal(findScrollStepPx(333), Math.round(333 * SCROLL_STEP_FRACTION));
});
