/**
 * The numbers a dispatcher optimises, as they stand at a minute of the replay, plus the event timeline filter and
 * the colour of each city.
 */

// City shading: near-black for a city that only sends freight, white for one that only receives it.
const SEND_ONLY_GREY = 10;
const RECEIVE_ONLY_GREY = 255;

/** Revenue, cost, profit, acceptance, empty miles and on-time pickups for everything decided by `minute`. */
export function metricsUntil(replay, minute) {
    const settings = replay.settings;
    let revenue = 0;
    let emptyMiles = 0;
    let loadedMiles = 0;
    let latePickups = 0;
    let accepted = 0;
    for (const trip of replay.trips) {
        if (trip.decided > minute) {
            continue;
        }
        accepted += 1;
        revenue += trip.revenue;
        emptyMiles += trip.empty_miles;
        loadedMiles += trip.loaded_miles;
        if (trip.late) {
            latePickups += 1;
        }
    }
    let declined = 0;
    for (const event of replay.events) {
        if (event.minute <= minute && (event.kind === "decline" || event.kind === "expire")) {
            declined += 1;
        }
    }
    const cost = settings.cost_per_mile * (emptyMiles + loadedMiles);
    const latePenalties = settings.late_pickup_penalty * latePickups;
    const totalMiles = emptyMiles + loadedMiles;
    const decidedCount = accepted + declined;
    return {
        accepted,
        declined,
        revenue,
        cost,
        latePenalties,
        profit: revenue - cost - latePenalties,
        emptyMiles,
        loadedMiles,
        acceptanceRate: decidedCount === 0 ? 0 : accepted / decidedCount,
        emptyMileShare: totalMiles === 0 ? 0 : emptyMiles / totalMiles,
        onTimeRate: accepted === 0 ? 0 : 1 - latePickups / accepted,
    };
}

/** Events up to `minute`, newest first; `kinds` (a Set) keeps only those kinds, or null for all. */
export function visibleEvents(events, minute, kinds) {
    const visible = [];
    for (const event of events) {
        const isPast = event.minute <= minute;
        const isWantedKind = kinds === null || kinds.has(event.kind);
        if (isPast && isWantedKind) {
            visible.push(event);
        }
    }
    return visible.reverse();
}

/** A grey from white (only receives freight) to near-black (only sends), so imbalance shows on the map. */
export function cityColor(city) {
    const totalLoads = city.outbound + city.inbound;
    const sendShare = totalLoads === 0 ? 0.5 : city.outbound / totalLoads;
    const grey = Math.round(RECEIVE_ONLY_GREY - sendShare * (RECEIVE_ONLY_GREY - SEND_ONLY_GREY));
    return `rgb(${grey}, ${grey}, ${grey})`;
}
