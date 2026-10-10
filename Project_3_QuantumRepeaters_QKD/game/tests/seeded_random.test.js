/**
 * Tests for src/seeded_random.js.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createSeededRandom, pickOne } from "../src/seeded_random.js";


test("the same seed gives the same sequence and floats stay in [0, 1)", () => {
    const firstGenerator = createSeededRandom(42);
    const secondGenerator = createSeededRandom(42);
    for (let i = 0; i < 100; i++) {
        const value = firstGenerator();
        assert.equal(value, secondGenerator());
        assert.ok(value >= 0 && value < 1);
    }
});


test("a non-integer seed fails fast", () => {
    assert.throws(() => createSeededRandom(1.5), /integer/);
});


test("pickOne refuses an empty list", () => {
    assert.throws(() => pickOne(createSeededRandom(1), []), /at least one/);
});
