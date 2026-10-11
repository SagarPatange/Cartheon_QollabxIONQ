/**
 * Tests for the pure formatting in src/page_helpers.js.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPercent } from "../src/page_helpers.js";


test("a probability reads as a percent with one decimal, or as many as asked for", () => {
    assert.equal(formatPercent(0.034), "3.4%");
    assert.equal(formatPercent(0.0025, 2), "0.25%");
    assert.equal(formatPercent(0.02, 2), "2.00%");
});
