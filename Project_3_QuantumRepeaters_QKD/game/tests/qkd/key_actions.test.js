/**
 * Tests for src/qkd/key_actions.js: which key presses fire which send action.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { findKeyAction, findTutorialCommand } from "../../src/qkd/key_actions.js";
import {
    CLASSICAL, ENCRYPTED, LUIGI, MARIO, NEW_RUN, NEXT_STEP, QUANTUM, REPLAY_TUTORIAL, SKIP_TUTORIAL,
} from "../../src/qkd/qkd_constants.js";

const PLAIN_PRESS = { ctrlKey: false, metaKey: false, altKey: false, repeat: false };


function press(key) {
    return { ...PLAIN_PRESS, key };
}


test("Q W E are Mario's three actions and I O P are Peach's", () => {
    assert.deepEqual(findKeyAction(press("q"), "BODY"), { sender: MARIO, kind: CLASSICAL });
    assert.deepEqual(findKeyAction(press("w"), "BODY"), { sender: MARIO, kind: ENCRYPTED });
    assert.deepEqual(findKeyAction(press("e"), "BODY"), { sender: MARIO, kind: QUANTUM });
    assert.deepEqual(findKeyAction(press("i"), "BUTTON"), { sender: LUIGI, kind: CLASSICAL });
    assert.deepEqual(findKeyAction(press("o"), "BODY"), { sender: LUIGI, kind: ENCRYPTED });
    assert.deepEqual(findKeyAction(press("P"), "BODY"), { sender: LUIGI, kind: QUANTUM });
});


test("keys do nothing while typing in a text box", () => {
    assert.equal(findKeyAction(press("q"), "INPUT"), null);
    assert.equal(findKeyAction(press("p"), "TEXTAREA"), null);
});


test("other keys, modifiers and auto-repeat do nothing", () => {
    assert.equal(findKeyAction(press("a"), "BODY"), null);
    assert.equal(findKeyAction(press("ArrowLeft"), "BODY"), null);
    assert.equal(findKeyAction({ ...press("w"), metaKey: true }, "BODY"), null);
    assert.equal(findKeyAction({ ...press("w"), repeat: true }, "BODY"), null);
});


test("the swap tutorial's keys: Space, R, Esc and T, never while typing", () => {
    assert.equal(findTutorialCommand(press(" "), "BODY"), NEXT_STEP);
    assert.equal(findTutorialCommand(press("R"), "BODY"), NEW_RUN);
    assert.equal(findTutorialCommand(press("Escape"), "BODY"), SKIP_TUTORIAL);
    assert.equal(findTutorialCommand(press("t"), "BODY"), REPLAY_TUTORIAL);
    assert.equal(findTutorialCommand(press(" "), "INPUT"), null);
    assert.equal(findTutorialCommand(press("x"), "BODY"), null);
    assert.equal(findTutorialCommand({ ...press(" "), repeat: true }, "BODY"), null);
});
