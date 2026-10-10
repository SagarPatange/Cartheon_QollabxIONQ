import assert from "node:assert/strict";
import test from "node:test";

import { COMPARED_COLUMNS, bestValues } from "../../src/compare_view.js";

function makeRun(loadsAccepted, loadsNotServed, revenue, cost, profit, emptyMileShare) {
    return {
        loads_accepted: loadsAccepted, loads_not_served: loadsNotServed, revenue, cost, profit,
        empty_mile_share: emptyMileShare,
    };
}

const RUNS = [
    makeRun(243, 256, 753007, 581518, 171489, 0.107),
    makeRun(266, 239, 679934, 540419, 139516, 0.125),
    makeRun(157, 345, 627017, 413512, 213505, 0.033),
];

test("the best value is the highest for good things and the lowest for costs", () => {
    assert.deepEqual(bestValues(RUNS, COMPARED_COLUMNS), {
        loads_accepted: 266,
        loads_not_served: 239,
        revenue: 753007,
        cost: 413512,
        profit: 213505,
        empty_mile_share: 0.033,
    });
});
