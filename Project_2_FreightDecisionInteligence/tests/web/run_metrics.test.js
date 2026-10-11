import assert from "node:assert/strict";
import test from "node:test";

import { cityColor, metricsUntil, visibleEvents } from "../../src/run_metrics.js";

const REPLAY = {
    settings: { cost_per_mile: 1.5, late_pickup_penalty: 250 },
    trucks: [{ id: "T1" }, { id: "T2" }],
    trips: [
        { decided: 540, empty_miles: 100, loaded_miles: 400, revenue: 2000, late: false },
        { decided: 1980, empty_miles: 0, loaded_miles: 300, revenue: 900, late: true },
    ],
    events: [
        { minute: 480, kind: "tender" },
        { minute: 540, kind: "accept" },
        { minute: 540, kind: "decline" },
        { minute: 1980, kind: "accept" },
    ],
};

test("metrics count only what was decided by the given minute", () => {
    const metrics = metricsUntil(REPLAY, 600);
    assert.equal(metrics.accepted, 1);
    assert.equal(metrics.declined, 1);
    assert.equal(metrics.revenue, 2000);
    assert.equal(metrics.cost, 1.5 * 500);
    assert.equal(metrics.profit, 2000 - 750);
    assert.equal(metrics.acceptanceRate, 0.5);
    assert.equal(metrics.emptyMileShare, 100 / 500);
    assert.equal(metrics.onTimeRate, 1);
});

test("a late pickup costs its penalty and lowers the on-time rate", () => {
    const metrics = metricsUntil(REPLAY, 2000);
    assert.equal(metrics.profit, 2900 - 1.5 * 800 - 250);
    assert.equal(metrics.onTimeRate, 0.5);
});

test("before any decision the rates are zero, not NaN", () => {
    const metrics = metricsUntil(REPLAY, 0);
    assert.equal(metrics.acceptanceRate, 0);
    assert.equal(metrics.emptyMileShare, 0);
    assert.equal(metrics.onTimeRate, 0);
});

test("the timeline shows events up to now, newest first, optionally filtered by kind", () => {
    assert.deepEqual(visibleEvents(REPLAY.events, 540, null).map((event) => event.kind), ["decline", "accept", "tender"]);
    assert.deepEqual(visibleEvents(REPLAY.events, 2000, new Set(["accept"])).map((event) => event.minute), [1980, 540]);
});

test("cities are shades of black: near-black sends only, white receives only, mid grey balanced", () => {
    assert.equal(cityColor({ outbound: 10, inbound: 0 }), "rgb(10, 10, 10)");
    assert.equal(cityColor({ outbound: 0, inbound: 10 }), "rgb(255, 255, 255)");
    assert.equal(cityColor({ outbound: 5, inbound: 5 }), "rgb(133, 133, 133)");
});
