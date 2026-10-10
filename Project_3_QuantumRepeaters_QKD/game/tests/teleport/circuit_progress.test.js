/**
 * Tests for src/teleport/circuit_progress.js: the cheat sheet's circuit lights up step by step with the teleport.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { areBitsMeasured, circuitStepStates } from "../../src/teleport/circuit_progress.js";
import {
    ARRIVED_PHASE, MEASURED_PHASE, READY_PHASE, READ_PHASE, SENDING_PHASE,
} from "../../src/teleport/teleport_tutorial.js";

const NO_FIX = { isXOn: false, isZOn: false };

test("before Mario measures, the Bell pair is done and his measurement is up next", () => {
    assert.deepEqual(circuitStepStates(READY_PHASE, NO_FIX), {
        pair: "done", bell: "current", measure: "current", send: "pending", fixX: "pending", fixZ: "pending",
    });
    assert.equal(circuitStepStates(null, NO_FIX).bell, "pending");
});

test("the measurement, then the classical wires, light up as the bits are made and sent", () => {
    assert.equal(circuitStepStates(MEASURED_PHASE, NO_FIX).measure, "current");
    const sending = circuitStepStates(SENDING_PHASE, NO_FIX);
    assert.equal(sending.measure, "done");
    assert.equal(sending.send, "current");
});

test("Luigi's fix gates follow his switches, then show which fix was applied", () => {
    const setting = circuitStepStates(ARRIVED_PHASE, { isXOn: true, isZOn: false });
    assert.equal(setting.send, "done");
    assert.equal(setting.fixX, "on");
    assert.equal(setting.fixZ, "off");
    const applied = circuitStepStates(READ_PHASE, { isXOn: false, isZOn: true });
    assert.equal(applied.fixX, "off");
    assert.equal(applied.fixZ, "applied");
});

test("the bits are shown on their wires from the measurement on", () => {
    assert.equal(areBitsMeasured(READY_PHASE), false);
    assert.equal(areBitsMeasured(MEASURED_PHASE), true);
    assert.equal(areBitsMeasured(READ_PHASE), true);
});
