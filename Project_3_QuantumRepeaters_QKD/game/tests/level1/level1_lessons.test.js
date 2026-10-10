/**
 * Tests for src/level1/level1_lessons.js: the lesson texts name what happened, stay short, and the settings tour
 * points at real settings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    SETTINGS_TOUR, describeClickLesson, describeDecoherenceLesson, describeEmissionLesson, describeMemoryLesson,
    describeNoClickLesson, describeSettingsHint, describeTourEnding, describeTwoClickLesson, HINT_AFTER_LOST_PAIRS,
    shouldShowSettingsHint,
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
    assert.match(describeDecoherenceLesson(MARIO_SIDE, 3000), /Tune the settings/);
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
        describeTwoClickLesson(), describeDecoherenceLesson(MARIO_SIDE, 10_000), describeTourEnding(true),
        describeTourEnding(false),
    ];
    for (const step of SETTINGS_TOUR) {
        texts.push(step.text);
    }
    for (const text of texts) {
        assert.ok(text.length <= MAX_LESSON_LENGTH, `${text.length} characters: ${text}`);
    }
});


test("the settings tour visits every setting once, in panel order", () => {
    const touredIds = SETTINGS_TOUR.map((step) => step.settingId);
    const panelIds = LINK_SETTINGS.map((spec) => spec.id);
    assert.deepEqual(touredIds, panelIds);
});


test("the tour ends without giving the hint away, whatever the settings", () => {
    assert.doesNotMatch(describeTourEnding(false), /HINT/);
    assert.doesNotMatch(describeTourEnding(true), /HINT/);
    assert.match(describeTourEnding(false), /Esc/);
});


test("the settings hint waits until the player has lost a couple of pairs", () => {
    assert.equal(shouldShowSettingsHint(0, 0, false), false);
    assert.equal(shouldShowSettingsHint(HINT_AFTER_LOST_PAIRS - 1, 0, false), false);
    assert.equal(shouldShowSettingsHint(HINT_AFTER_LOST_PAIRS, 0, false), true);
});


test("the settings hint comes back after every couple of further lost pairs", () => {
    const lostAtLastHint = HINT_AFTER_LOST_PAIRS;
    assert.equal(shouldShowSettingsHint(lostAtLastHint, lostAtLastHint, false), false);
    assert.equal(shouldShowSettingsHint(lostAtLastHint + 1, lostAtLastHint, false), false);
    assert.equal(shouldShowSettingsHint(lostAtLastHint + HINT_AFTER_LOST_PAIRS, lostAtLastHint, false), true);
});


test("no settings hint when the settings can already fill all 3 slots", () => {
    assert.equal(shouldShowSettingsHint(HINT_AFTER_LOST_PAIRS, 0, true), false);
});


test("the settings hint says to change the settings", () => {
    assert.match(describeSettingsHint(), /HINT/);
    assert.match(describeSettingsHint(), /Esc/);
});
