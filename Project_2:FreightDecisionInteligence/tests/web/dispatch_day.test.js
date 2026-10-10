import assert from "node:assert/strict";
import test from "node:test";

import {
    cityShade,
    countLoadsPerLane,
    formatDay,
    loadsInTransit,
    loadsOnDay,
    rankLanes,
    summarizeLoads,
} from "../../src/dispatch_day.js";

const COLUMNS = ["day", "lane", "pickup_min", "transit_min", "equipment", "booking", "revenue"];
const YEAR_FILE = {
    year: 2022,
    columns: COLUMNS,
    rows: [
        [0, 1, 360, 600, "R", "S", 1000],
        [0, 1, 720, 500, "D", "C", 2000],
        [0, 0, 900, 400, "D", "D", 500],
        [1, 0, 400, 300, "R", "S", 700],
    ],
};

test("loadsOnDay returns the day's loads as objects, in pickup order", () => {
    const loads = loadsOnDay(YEAR_FILE, 0);
    assert.deepEqual(loads.map((load) => load.pickupMinute), [360, 720, 900]);
    assert.deepEqual(loads[0], { lane: 1, pickupMinute: 360, transitMinutes: 600, equipment: "R", booking: "S", revenue: 1000 });
});

test("the day summary counts loads, revenue, equipment and booking types", () => {
    assert.deepEqual(summarizeLoads(loadsOnDay(YEAR_FILE, 0)), {
        loads: 3,
        revenue: 3500,
        reefer: 1,
        dryVan: 2,
        spot: 1,
        contract: 1,
        dedicated: 1,
    });
});

test("loads are counted per lane, with zero for lanes that had none", () => {
    assert.deepEqual(countLoadsPerLane(loadsOnDay(YEAR_FILE, 1), 3), [1, 0, 0]);
});

test("lanes are ranked by loads, busiest first, ties by lane index", () => {
    assert.deepEqual(rankLanes([2, 5, 2, 0], 3), [
        { lane: 1, loads: 5 },
        { lane: 0, loads: 2 },
        { lane: 2, loads: 2 },
    ]);
});

test("a city that only sends is black, one that only receives is white, a balanced one is mid grey", () => {
    assert.equal(cityShade({ outbound: 10, inbound: 0 }), "rgb(10, 10, 10)");
    assert.equal(cityShade({ outbound: 0, inbound: 10 }), "rgb(255, 255, 255)");
    assert.equal(cityShade({ outbound: 5, inbound: 5 }), "rgb(133, 133, 133)");
});

test("a load is in transit from its scheduled pickup until its scheduled delivery, even across days", () => {
    const yearFile = {
        year: 2022,
        columns: COLUMNS,
        rows: [
            [0, 0, 1200, 600, "R", "S", 1000],
            [1, 1, 60, 30, "D", "C", 500],
        ],
    };
    const nextDayBeforeOneAm = loadsInTransit(yearFile, 1, 50);
    assert.equal(nextDayBeforeOneAm.length, 1);
    assert.equal(nextDayBeforeOneAm[0].lane, 0);
    assert.equal(nextDayBeforeOneAm[0].progress, (1440 + 50 - 1200) / 600);
    assert.deepEqual(loadsInTransit(yearFile, 1, 80).map((load) => load.lane), [0, 1]);
    assert.deepEqual(loadsInTransit(yearFile, 1, 400), []);
});

test("a day of the year is shown with weekday, day, month and year", () => {
    assert.equal(formatDay(2022, 0), "Sat 1 Jan 2022");
    assert.equal(formatDay(2024, 59), "Thu 29 Feb 2024");
});
