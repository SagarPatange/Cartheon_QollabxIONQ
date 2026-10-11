/**
 * The week a run covers, chosen as a month and one of its first 4 weeks. Week n starts on the n-th Monday of the
 * month and runs Monday to Sunday, so every choice is a full week inside the data (Jan 2022 to Dec 2024).
 */

export const WEEKS_PER_MONTH = 4;
const DAYS_PER_WEEK = 7;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-01", "2022-03" → the months from first to last, each {value: "2022-02", label: "Feb 2022"}. */
export function listMonths(firstMonth, lastMonth) {
    const months = [];
    let [year, month] = firstMonth.split("-").map(Number);
    const [lastYear, lastMonthNumber] = lastMonth.split("-").map(Number);
    while (year < lastYear || (year === lastYear && month <= lastMonthNumber)) {
        const value = `${year}-${String(month).padStart(2, "0")}`;
        months.push({ value, label: `${MONTH_NAMES[month - 1]} ${year}` });
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return months;
}

/** "2022-03", 1 → "2022-03-07": the Monday that starts week `weekNumber` (1 to 4) of the month. */
export function weekStartFor(monthValue, weekNumber) {
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > WEEKS_PER_MONTH) {
        throw new Error(`week must be 1 to ${WEEKS_PER_MONTH}, got ${weekNumber}`);
    }
    const firstDay = new Date(`${monthValue}-01T00:00:00Z`);
    const daysToFirstMonday = (8 - firstDay.getUTCDay()) % DAYS_PER_WEEK;
    const weekStart = new Date(firstDay);
    weekStart.setUTCDate(1 + daysToFirstMonday + (weekNumber - 1) * DAYS_PER_WEEK);
    return weekStart.toISOString().slice(0, 10);
}

/** "2022-03", 1 → "Week 1 · Mar 7–13"; a week that ends in the next month shows both months. */
export function weekLabel(monthValue, weekNumber) {
    const weekStart = new Date(`${weekStartFor(monthValue, weekNumber)}T00:00:00Z`);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + DAYS_PER_WEEK - 1);
    const startMonthName = MONTH_NAMES[weekStart.getUTCMonth()];
    const endMonthName = MONTH_NAMES[weekEnd.getUTCMonth()];
    const isSameMonth = startMonthName === endMonthName;
    const endText = isSameMonth ? `${weekEnd.getUTCDate()}` : `${endMonthName} ${weekEnd.getUTCDate()}`;
    return `Week ${weekNumber} · ${startMonthName} ${weekStart.getUTCDate()}–${endText}`;
}
