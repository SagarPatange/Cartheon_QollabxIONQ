import assert from "node:assert/strict";
import test from "node:test";

import { formatDay, formatMoney, simulationClock } from "../../src/format.js";

test("a day of the year is shown with weekday, day, month and year", () => {
    assert.equal(formatDay("2022-01-01", 0), "Sat 1 Jan 2022");
    assert.equal(formatDay("2024-02-28", 1), "Thu 29 Feb 2024");
});

test("the simulation clock splits minutes into the day number and HH:MM", () => {
    assert.deepEqual(simulationClock(0), { dayIndex: 0, time: "00:00" });
    assert.deepEqual(simulationClock(2 * 1440 + 9 * 60 + 5.7), { dayIndex: 2, time: "09:05" });
});

test("money is shown in whole dollars, negative with a minus sign", () => {
    assert.equal(formatMoney(171489.2), "$171,489");
    assert.equal(formatMoney(-2500), "−$2,500");
});
