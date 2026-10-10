/**
 * Tests for src/teleport/lesson_history.js: going back over earlier lesson notes and forward again.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { countReviewable, startReview, stepReview } from "../../src/teleport/lesson_history.js";

test("with a lesson open, B goes to the note before it; with none open, to the latest note", () => {
    assert.equal(startReview(3, true), 1);
    assert.equal(startReview(3, false), 2);
    assert.equal(countReviewable(3, true), 2);
    assert.equal(countReviewable(3, false), 3);
});

test("there is nothing to go back to before the first note, or while the first note is still open", () => {
    assert.equal(startReview(0, false), null);
    assert.equal(startReview(1, true), null);
    assert.equal(countReviewable(1, true), 0);
});

test("stepping back stops at the first note; stepping past the last earlier note ends the review", () => {
    assert.equal(stepReview(1, -1, 3, true), 0);
    assert.equal(stepReview(0, -1, 3, true), 0);
    assert.equal(stepReview(0, 1, 3, true), 1);
    assert.equal(stepReview(1, 1, 3, true), null);
    assert.equal(stepReview(2, 1, 3, false), null);
});
