/**
 * Tests for src/teleport/teleport_tutorial.js: the phase order, the tutorial's lessons in order, picking a teleport
 * that shows the fix, and the lesson texts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ARRIVED_PHASE, BELL_LESSON, CHALLENGE_LESSON, FIX_LESSON, MEASURED_PHASE, PAIR_LESSON, PIPE_LESSON,
    PLUS_FIX_LESSON, PLUS_LESSON, READY_PHASE, READ_PHASE, RESULT_LESSON, SENDING_PHASE, TELEPORT_PHASES,
    TUTORIAL_DONE_LESSON, TUTORIAL_STATES, TUTORIAL_STEPS, describeLesson, findNextPhase, findTutorialStep,
    isRepeatedLesson, pickTutorialTeleport,
} from "../../src/teleport/teleport_tutorial.js";
import { readLuigiResult } from "../../src/teleport/teleport_rules.js";

// Lessons must be quick to read: none runs longer than this many characters.
const MAX_LESSON_LENGTH = 160;

function makeTeleport(state, zFix, xFix, luigiReads) {
    return { state, bell_bits: { z_fix: zFix, x_fix: xFix }, luigi_reads: luigiReads };
}

const ONE_WITH_X = makeTeleport("1", 0, 1, { none: "0", x: "1", z: "0", zx: "1" });
const ONE_WITH_NOTHING = makeTeleport("1", 0, 0, { none: "1", x: "0", z: "1", zx: "0" });
const PLUS_WITH_Z = makeTeleport("+", 1, 0, { none: "-", x: "-", z: "+", zx: "+" });
const PLUS_WITH_X = makeTeleport("+", 0, 1, { none: "+", x: "+", z: "-", zx: "-" });


test("a teleport goes ready → measured → sending → arrived → read", () => {
    assert.deepEqual(TELEPORT_PHASES, [READY_PHASE, MEASURED_PHASE, SENDING_PHASE, ARRIVED_PHASE, READ_PHASE]);
    assert.equal(findNextPhase(READY_PHASE), MEASURED_PHASE);
    assert.equal(findNextPhase(ARRIVED_PHASE), READ_PHASE);
    assert.equal(findNextPhase(READ_PHASE), null);
    assert.throws(() => findNextPhase("flying"), /unknown phase/);
});


test("the tutorial teleports |1⟩ then |+⟩, with lessons in protocol order", () => {
    assert.deepEqual(TUTORIAL_STATES, ["1", "+"]);
    const order = TUTORIAL_STEPS.map((step) => `${step.teleportIndex}:${step.phase}:${step.lessonId}`);
    assert.deepEqual(order, [
        `0:${READY_PHASE}:${PAIR_LESSON}`,
        `0:${MEASURED_PHASE}:${BELL_LESSON}`,
        `0:${SENDING_PHASE}:${PIPE_LESSON}`,
        `0:${ARRIVED_PHASE}:${FIX_LESSON}`,
        `0:${READ_PHASE}:${RESULT_LESSON}`,
        `1:${READY_PHASE}:${PLUS_LESSON}`,
        `1:${ARRIVED_PHASE}:${PLUS_FIX_LESSON}`,
        `1:${READ_PHASE}:${RESULT_LESSON}`,
    ]);
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) {
        const previous = TUTORIAL_STEPS[i - 1];
        const current = TUTORIAL_STEPS[i];
        const isLater = current.teleportIndex > previous.teleportIndex
            || TELEPORT_PHASES.indexOf(current.phase) > TELEPORT_PHASES.indexOf(previous.phase);
        assert.equal(isLater, true, `step ${i} comes after step ${i - 1}`);
    }
});


test("each phase finds its lesson, and phases without one do not pause", () => {
    assert.equal(findTutorialStep(0, SENDING_PHASE).lessonId, PIPE_LESSON);
    assert.equal(findTutorialStep(1, READY_PHASE).lessonId, PLUS_LESSON);
    assert.equal(findTutorialStep(1, MEASURED_PHASE), null);
    assert.equal(findTutorialStep(2, READY_PHASE), null);
    assert.equal(isRepeatedLesson(RESULT_LESSON), true);
    assert.equal(isRepeatedLesson(PIPE_LESSON), false);
});


test("the tutorial picks a teleport whose bits make its fix matter, else the first one", () => {
    assert.equal(pickTutorialTeleport([ONE_WITH_NOTHING, ONE_WITH_X]), ONE_WITH_X);
    assert.equal(pickTutorialTeleport([PLUS_WITH_X, PLUS_WITH_Z]), PLUS_WITH_Z);
    assert.equal(pickTutorialTeleport([PLUS_WITH_X]), PLUS_WITH_X);
    assert.throws(() => pickTutorialTeleport([]), /no teleports/);
});


test("lessons quote the simulated bits and Luigi's reading", () => {
    assert.match(describeLesson(PAIR_LESSON, { teleport: ONE_WITH_X }), /3 Bell pairs.*\|1⟩/);
    assert.match(describeLesson(BELL_LESSON, { teleport: ONE_WITH_X }), /bits: 01/);
    assert.match(describeLesson(FIX_LESSON, { teleport: PLUS_WITH_Z }), /bits 10/);
    const rightResult = readLuigiResult(ONE_WITH_X, { isXOn: true, isZOn: false });
    const rightText = describeLesson(RESULT_LESSON, { teleport: ONE_WITH_X, result: rightResult });
    assert.match(rightText, /Luigi reads 1: \|1⟩ made it!/);
    assert.match(rightText, /no fix he'd read 0/);
    const wrongResult = readLuigiResult(PLUS_WITH_Z, { isXOn: false, isZOn: false });
    const wrongText = describeLesson(RESULT_LESSON, { teleport: PLUS_WITH_Z, result: wrongResult });
    assert.match(wrongText, /Luigi reads −, not \+: bits 10 need Z/);
    const noFixResult = readLuigiResult(ONE_WITH_NOTHING, { isXOn: false, isZOn: false });
    assert.match(describeLesson(RESULT_LESSON, { teleport: ONE_WITH_NOTHING, result: noFixResult }), /no fix was/);
    assert.match(describeLesson(CHALLENGE_LESSON, {}), /H = 00111, I = 01000/);
    assert.throws(() => describeLesson("nap", {}), /unknown lesson/);
});


test("every lesson is short enough to read at a glance", () => {
    const result = readLuigiResult(PLUS_WITH_Z, { isXOn: false, isZOn: false });
    const context = { teleport: PLUS_WITH_Z, result };
    const lessonIds = [...TUTORIAL_STEPS.map((step) => step.lessonId), TUTORIAL_DONE_LESSON, CHALLENGE_LESSON];
    for (const lessonId of lessonIds) {
        const text = describeLesson(lessonId, context);
        assert.ok(text.length <= MAX_LESSON_LENGTH, `${lessonId} is ${text.length} characters`);
    }
});
