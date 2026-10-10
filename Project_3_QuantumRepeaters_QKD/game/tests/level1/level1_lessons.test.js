/**
 * Tests for src/level1/level1_lessons.js: the lesson texts name what happened, stay short, and the settings tour
 * points at real settings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    SETTINGS_TOUR, describeClickLesson, describeDecoherenceLesson, describeEmissionLesson, describeMemoryLesson,
    describeNoClickLesson, describeTwoClickLesson,
} from "../../src/level1/level1_lessons.js";
import { LUIGI_SIDE, MARIO_SIDE, MINUS_DETECTOR, PLUS_DETECTOR } from "../../src/level1/level1_protocol.js";
import { LINK_SETTINGS } from "../../src/level1/level1_settings.js";

// Lessons must be quick to read: none runs longer than this many characters.
const MAX_LESSON_LENGTH = 110;


test("the click lesson names the detector that clicked", () => {
    assert.match(describeClickLesson(PLUS_DETECTOR), /ONE CLICK at D\+/);
    assert.match(describeClickLesson(MINUS_DETECTOR), /ONE CLICK at D−/);
});


test("no click and two clicks are both explained as misses", () => {
    assert.match(describeNoClickLesson(), /No click/);
    assert.match(describeNoClickLesson(), /try again/);
    assert.match(describeTwoClickLesson(), /TWO CLICKS/);
    assert.match(describeTwoClickLesson(), /miss/);
});


test("the decoherence lesson names whose atom decohered and after how long", () => {
    assert.match(describeDecoherenceLesson(MARIO_SIDE, 10_000), /After 10 s, Mario's atom/);
    assert.match(describeDecoherenceLesson(LUIGI_SIDE, 25_000), /After 25 s, Luigi's atom/);
});


test("the story opens on the memories: 3 slots each, one Rydberg atom per slot", () => {
    assert.match(describeMemoryLesson(), /3 memory slots/);
    assert.match(describeMemoryLesson(), /Rydberg atom/);
});


test("the emission lesson says each atom is entangled with its photon, not yet with the other atom", () => {
    assert.match(describeEmissionLesson(), /entangled with it/);
    assert.match(describeEmissionLesson(), /not linked yet/);
});


test("every lesson and tour tip is short", () => {
    const texts = [
        describeMemoryLesson(), describeEmissionLesson(), describeNoClickLesson(), describeClickLesson(PLUS_DETECTOR),
        describeTwoClickLesson(),
        describeDecoherenceLesson(MARIO_SIDE, 10_000),
    ];
    for (const step of SETTINGS_TOUR) {
        texts.push(step.text);
    }
    for (const text of texts) {
        assert.ok(text.length <= MAX_LESSON_LENGTH, `${text.length} characters: ${text}`);
    }
});


test("the settings tour visits every setting once, in panel order, then ends", () => {
    const touredIds = SETTINGS_TOUR.map((step) => step.settingId);
    const panelIds = LINK_SETTINGS.map((spec) => spec.id);
    assert.deepEqual(touredIds, [...panelIds, null]);
});
