import assert from "node:assert/strict";
import test from "node:test";

import { bearingDegrees, truckPositions } from "../../src/truck_motion.js";

const ROUTES = [
    { cities: ["Dallas, TX", "Houston, TX"], points: [[32.8, -96.8], [29.8, -95.4]] },
    { cities: ["Dallas, TX", "Memphis, TN"], points: [[32.8, -96.8], [35.1, -90.0]] },
];
const CITY_POINTS = { "Dallas, TX": [32.8, -96.8], "Houston, TX": [29.8, -95.4], "Memphis, TN": [35.1, -90.0] };

// Truck starts in Houston; at 540 it is sent empty to Dallas (arrives 840), loads until 960, drives to Memphis
// (arrives 1500), unloads until 1620.
const REPLAY = {
    trucks: [{ id: "T1", start_city: "Houston, TX", equipment: "D" }],
    trips: [{
        truck_id: "T1", from_city: "Houston, TX", origin: "Dallas, TX", destination: "Memphis, TN",
        decided: 540, pickup_arrival: 840, loading_start: 840, depart_loaded: 960, delivery_arrival: 1500, free: 1620,
    }],
};

function positionAt(minute) {
    return truckPositions(REPLAY, minute, ROUTES, CITY_POINTS)[0];
}

test("before its first trip a truck is parked at its start city", () => {
    const truck = positionAt(100);
    assert.equal(truck.phase, "parked");
    assert.deepEqual([truck.lat, truck.lon], CITY_POINTS["Houston, TX"]);
});

test("between the decision and the pickup it drives empty along the road", () => {
    const truck = positionAt(690);
    assert.equal(truck.phase, "empty");
    // Halfway along the straight test road from Houston to Dallas.
    assert.ok(Math.abs(truck.lat - 31.3) < 1e-9 && Math.abs(truck.lon + 96.1) < 1e-9);
});

test("at the pickup it is loading, then it drives loaded", () => {
    assert.equal(positionAt(900).phase, "loading");
    assert.equal(positionAt(1000).phase, "loaded");
});

test("after delivery it unloads, then it is parked at the destination", () => {
    assert.equal(positionAt(1550).phase, "unloading");
    const parked = positionAt(2000);
    assert.equal(parked.phase, "parked");
    assert.deepEqual([parked.lat, parked.lon], CITY_POINTS["Memphis, TN"]);
});

test("a driving truck points the way it is going", () => {
    // Houston → Dallas runs north (and a little west).
    const bearing = positionAt(690).bearing;
    assert.ok(bearing > 330 || bearing < 30);
});

test("bearings are measured clockwise from north", () => {
    assert.equal(Math.round(bearingDegrees([0, 0], [1, 0])), 0);
    assert.equal(Math.round(bearingDegrees([0, 0], [0, 1])), 90);
    assert.equal(Math.round(bearingDegrees([0, 0], [-1, 0])), 180);
    assert.equal(Math.round(bearingDegrees([0, 0], [0, -1])), 270);
});
