/**
 * Tests for src/level1/level1_lessons.js: the lesson texts name what happened.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { describeClickLesson, describeDecoherenceLesson } from "../../src/level1/level1_lessons.js";
import { LUIGI_SIDE, MARIO_SIDE, MINUS_DETECTOR, PLUS_DETECTOR } from "../../src/level1/level1_protocol.js";


test("the click lesson names the detector that clicked", () => {
    assert.match(describeClickLesson(PLUS_DETECTOR), /Detector D\+ caught/);
    assert.match(describeClickLesson(MINUS_DETECTOR), /Detector D− caught/);
});


test("the decoherence lesson names whose qubit decohered and after how long", () => {
    assert.match(describeDecoherenceLesson(MARIO_SIDE, 10_000), /After 10 s, Mario's qubit/);
    assert.match(describeDecoherenceLesson(LUIGI_SIDE, 25_000), /After 25 s, Luigi's qubit/);
});
