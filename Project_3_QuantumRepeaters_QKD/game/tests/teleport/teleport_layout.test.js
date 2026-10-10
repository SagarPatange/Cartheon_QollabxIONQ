/**
 * Tests for src/teleport/teleport_layout.js: the scene's zoom fits the space left under the sky.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_TRACK_SCALE, MIN_TRACK_SCALE, computeTrackScale } from "../../src/teleport/teleport_layout.js";

const TRACK = { trackHeightPx: 340, trackMinWidthPx: 900 };


test("the scene takes the smaller of the height and width scales", () => {
    assert.equal(computeTrackScale({ ...TRACK, freeHeightPx: 340, freeWidthPx: 1800 }), 1);
    assert.equal(computeTrackScale({ ...TRACK, freeHeightPx: 680, freeWidthPx: 1080 }), 1.2);
});


test("a short window shrinks the scene, but never below the readable minimum", () => {
    assert.equal(computeTrackScale({ ...TRACK, freeHeightPx: 272, freeWidthPx: 1800 }), 0.8);
    assert.equal(computeTrackScale({ ...TRACK, freeHeightPx: 50, freeWidthPx: 1800 }), MIN_TRACK_SCALE);
});


test("a huge window stops at the largest zoom, and a broken size fails fast", () => {
    assert.equal(computeTrackScale({ ...TRACK, freeHeightPx: 5000, freeWidthPx: 9000 }), MAX_TRACK_SCALE);
    assert.throws(() => computeTrackScale({ trackHeightPx: 0, trackMinWidthPx: 900, freeHeightPx: 1, freeWidthPx: 1 }),
        /positive/);
});
