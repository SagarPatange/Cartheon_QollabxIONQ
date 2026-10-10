import assert from "node:assert/strict";
import test from "node:test";

import { advanceTime } from "../../src/playback.js";

test("simulated time moves elapsed real time × speed", () => {
    const step = advanceTime({ timeS: 100, elapsedMs: 500, speed: 60, endS: 10_000 });
    assert.deepEqual(step, { timeS: 130, isFinished: false });
});

test("playback stops exactly at the end of the day", () => {
    const step = advanceTime({ timeS: 9_990, elapsedMs: 1_000, speed: 600, endS: 10_000 });
    assert.deepEqual(step, { timeS: 10_000, isFinished: true });
});

test("a negative speed is refused", () => {
    assert.throws(() => advanceTime({ timeS: 0, elapsedMs: 10, speed: -1, endS: 100 }), /speed/);
});
