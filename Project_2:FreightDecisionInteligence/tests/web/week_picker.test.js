import assert from "node:assert/strict";
import test from "node:test";

import { WEEKS_PER_MONTH, listMonths, weekLabel, weekStartFor } from "../../src/week_picker.js";

test("the months run from the first to the last, across year ends", () => {
    assert.deepEqual(listMonths("2022-11", "2023-02"), [
        { value: "2022-11", label: "Nov 2022" },
        { value: "2022-12", label: "Dec 2022" },
        { value: "2023-01", label: "Jan 2023" },
        { value: "2023-02", label: "Feb 2023" },
    ]);
    assert.equal(listMonths("2022-01", "2024-12").length, 36);
});

test("week n starts on the n-th Monday of the month", () => {
    assert.equal(weekStartFor("2022-03", 1), "2022-03-07");
    assert.equal(weekStartFor("2022-03", 4), "2022-03-28");
    // August 2022 starts on a Monday, so week 1 starts on the 1st.
    assert.equal(weekStartFor("2022-08", 1), "2022-08-01");
});

test("only weeks 1 to 4 can be chosen", () => {
    assert.equal(WEEKS_PER_MONTH, 4);
    assert.throws(() => weekStartFor("2022-03", 5), /1 to 4/);
    assert.throws(() => weekStartFor("2022-03", 0), /1 to 4/);
});

test("every week of every month in the data is a full week inside the data", () => {
    for (const month of listMonths("2022-01", "2024-12")) {
        for (let weekNumber = 1; weekNumber <= WEEKS_PER_MONTH; weekNumber++) {
            const weekStart = weekStartFor(month.value, weekNumber);
            const weekEnd = new Date(`${weekStart}T00:00:00Z`);
            weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
            assert.ok(weekStart >= "2022-01-01", weekStart);
            assert.ok(weekEnd.toISOString().slice(0, 10) <= "2024-12-31", weekStart);
            assert.equal(new Date(`${weekStart}T00:00:00Z`).getUTCDay(), 1, `${weekStart} is a Monday`);
        }
    }
});

test("a week's label shows its dates, with both months when it crosses into the next", () => {
    assert.equal(weekLabel("2022-03", 1), "Week 1 · Mar 7–13");
    assert.equal(weekLabel("2022-03", 4), "Week 4 · Mar 28–Apr 3");
});
