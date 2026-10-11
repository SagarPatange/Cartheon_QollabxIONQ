import assert from "node:assert/strict";
import test from "node:test";

import { pathForLane, pointAlongPath } from "../../src/route_paths.js";

const ROUTES = [{ cities: ["Dallas, TX", "Memphis, TN"], points: [[32.8, -96.8], [33.5, -93.0], [35.1, -90.0]] }];

test("a lane running the stored direction gets the path as stored", () => {
    const lane = { origin: "Dallas, TX", destination: "Memphis, TN" };
    assert.deepEqual(pathForLane(lane, ROUTES), ROUTES[0].points);
});

test("a lane running the other way gets the path reversed", () => {
    const lane = { origin: "Memphis, TN", destination: "Dallas, TX" };
    assert.deepEqual(pathForLane(lane, ROUTES), [[35.1, -90.0], [33.5, -93.0], [32.8, -96.8]]);
});

test("a lane with no stored path fails fast", () => {
    assert.throws(() => pathForLane({ origin: "Miami, FL", destination: "Dallas, TX" }, ROUTES), /Miami, FL/);
});

test("pointAlongPath follows the path by distance travelled, not by point count", () => {
    const path = [[0, 0], [0, 1], [0, 4]];
    assert.deepEqual(pointAlongPath(path, 0), [0, 0]);
    assert.deepEqual(pointAlongPath(path, 0.5), [0, 2]);
    assert.deepEqual(pointAlongPath(path, 1), [0, 4]);
});

test("pointAlongPath clamps fractions outside 0 to 1", () => {
    const path = [[0, 0], [0, 2]];
    assert.deepEqual(pointAlongPath(path, -0.5), [0, 0]);
    assert.deepEqual(pointAlongPath(path, 1.5), [0, 2]);
});
