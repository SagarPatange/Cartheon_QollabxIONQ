import assert from "node:assert/strict";
import test from "node:test";

import { fitZoom } from "../../src/fit_one_row.js";

test("a row that already fits keeps its size", () => {
    assert.equal(fitZoom(1400, 1200), 1);
    assert.equal(fitZoom(1400, 1400), 1);
});

test("a row that is too wide shrinks just enough to fit, never grows", () => {
    assert.equal(fitZoom(1000, 1250), 0.8);
    assert.equal(fitZoom(1000, 0), 1);
});
