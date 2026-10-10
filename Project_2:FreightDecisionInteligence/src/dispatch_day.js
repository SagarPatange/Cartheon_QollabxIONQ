/**
 * One day of the load stream: which loads were tendered, what they add up to, and how busy each lane was.
 * Works on the compact year files written by tools/build_dispatch_map_data.py.
 */

const COLUMN_DAY = 0;
const COLUMN_LANE = 1;
const COLUMN_PICKUP_MINUTE = 2;
const COLUMN_TRANSIT_MINUTES = 3;
const COLUMN_EQUIPMENT = 4;
const COLUMN_BOOKING = 5;
const COLUMN_REVENUE = 6;

const MINUTES_PER_DAY = 24 * 60;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// City shading: a city that only sends loads is near-black, one that only receives is white.
const SEND_ONLY_GREY = 10;
const RECEIVE_ONLY_GREY = 255;

/** The loads of one day (0 = 1 January) as objects, sorted by scheduled pickup time. */
export function loadsOnDay(yearFile, dayOfYear) {
    const loads = [];
    for (const row of yearFile.rows) {
        if (row[COLUMN_DAY] !== dayOfYear) {
            continue;
        }
        loads.push({
            lane: row[COLUMN_LANE],
            pickupMinute: row[COLUMN_PICKUP_MINUTE],
            transitMinutes: row[COLUMN_TRANSIT_MINUTES],
            equipment: row[COLUMN_EQUIPMENT],
            booking: row[COLUMN_BOOKING],
            revenue: row[COLUMN_REVENUE],
        });
    }
    loads.sort((first, second) => first.pickupMinute - second.pickupMinute);
    return loads;
}

/**
 * Loads on the road at a moment: scheduled pickup ≤ now < scheduled pickup + transit. Each gets `progress`
 * (0 at pickup, 1 at delivery). Only loads from the same year file are considered, so loads picked up late in
 * December do not carry over into January.
 */
export function loadsInTransit(yearFile, dayOfYear, minuteOfDay) {
    const nowMinute = dayOfYear * MINUTES_PER_DAY + minuteOfDay;
    const inTransit = [];
    for (const row of yearFile.rows) {
        const startMinute = row[COLUMN_DAY] * MINUTES_PER_DAY + row[COLUMN_PICKUP_MINUTE];
        const transitMinutes = row[COLUMN_TRANSIT_MINUTES];
        const hasStarted = startMinute <= nowMinute;
        const hasArrived = nowMinute >= startMinute + transitMinutes;
        if (hasStarted && !hasArrived) {
            inTransit.push({
                lane: row[COLUMN_LANE],
                equipment: row[COLUMN_EQUIPMENT],
                startMinute,
                progress: (nowMinute - startMinute) / transitMinutes,
            });
        }
    }
    inTransit.sort((first, second) => first.startMinute - second.startMinute);
    return inTransit;
}

/** Load count, revenue, and counts by equipment and booking type. */
export function summarizeLoads(loads) {
    const summary = { loads: loads.length, revenue: 0, reefer: 0, dryVan: 0, spot: 0, contract: 0, dedicated: 0 };
    for (const load of loads) {
        summary.revenue += load.revenue;
        if (load.equipment === "R") {
            summary.reefer += 1;
        } else {
            summary.dryVan += 1;
        }
        if (load.booking === "S") {
            summary.spot += 1;
        } else if (load.booking === "C") {
            summary.contract += 1;
        } else {
            summary.dedicated += 1;
        }
    }
    return summary;
}

/** An array with one load count per lane index. */
export function countLoadsPerLane(loads, laneCount) {
    const counts = new Array(laneCount).fill(0);
    for (const load of loads) {
        counts[load.lane] += 1;
    }
    return counts;
}

/** The busiest lanes, most loads first, ties by lane index; lanes with no loads are left out. */
export function rankLanes(loadsPerLane, limit) {
    const ranking = [];
    loadsPerLane.forEach((loads, lane) => {
        if (loads > 0) {
            ranking.push({ lane, loads });
        }
    });
    ranking.sort((first, second) => second.loads - first.loads || first.lane - second.lane);
    return ranking.slice(0, limit);
}

/** A grey from white (only receives) to near-black (only sends), so freight imbalance shows on the map. */
export function cityShade(city) {
    const totalLoads = city.outbound + city.inbound;
    const sendShare = totalLoads === 0 ? 0.5 : city.outbound / totalLoads;
    const grey = Math.round(RECEIVE_ONLY_GREY - sendShare * (RECEIVE_ONLY_GREY - SEND_ONLY_GREY));
    return `rgb(${grey}, ${grey}, ${grey})`;
}

/** Year 2022, day 0 → "Sat 1 Jan 2022". */
export function formatDay(year, dayOfYear) {
    const day = new Date(Date.UTC(year, 0, 1 + dayOfYear));
    const weekday = WEEKDAY_NAMES[day.getUTCDay()];
    const month = MONTH_NAMES[day.getUTCMonth()];
    return `${weekday} ${day.getUTCDate()} ${month} ${day.getUTCFullYear()}`;
}
