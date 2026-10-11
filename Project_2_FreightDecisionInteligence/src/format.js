/**
 * Dates, times and money as the page shows them.
 */

const MINUTES_PER_DAY = 24 * 60;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2022-01-01", 0 → "Sat 1 Jan 2022": the date `dayIndex` days after the start date. */
export function formatDay(startDate, dayIndex) {
    const day = new Date(`${startDate}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + dayIndex);
    const weekday = WEEKDAY_NAMES[day.getUTCDay()];
    const month = MONTH_NAMES[day.getUTCMonth()];
    return `${weekday} ${day.getUTCDate()} ${month} ${day.getUTCFullYear()}`;
}

/** Minutes since the start of the run → the day number and the clock time HH:MM. */
export function simulationClock(minute) {
    const dayIndex = Math.floor(minute / MINUTES_PER_DAY);
    const minuteOfDay = Math.floor(minute - dayIndex * MINUTES_PER_DAY);
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = minuteOfDay % 60;
    return { dayIndex, time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
}

/** 171489.2 → "$171,489"; −2500 → "−$2,500". */
export function formatMoney(dollars) {
    const wholeDollars = Math.round(Math.abs(dollars)).toLocaleString("en-US");
    return dollars < 0 ? `−$${wholeDollars}` : `$${wholeDollars}`;
}
