/**
 * Where every simulated truck is at a minute, what it is doing, and which way it points.
 *
 * A trip runs: decided → driving empty to the pickup → at the pickup (waiting and loading) → driving loaded →
 * unloading → free. Between trips a truck is parked at the city of its last delivery (or its start city).
 * Position along a road is linear in time, rest breaks included.
 */

import { pathForLane, pointAlongPath } from "./route_paths.js";

const LOOK_AHEAD_FRACTION = 0.02; // how far ahead to look when working out the direction of travel
const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * @returns {{truckId, equipment, phase, lat, lon, bearing}[]} with phase one of parked, empty, loading, loaded,
 *     unloading; bearing in degrees clockwise from north (0 when not moving).
 */
export function truckPositions(replay, minute, routes, cityPoints) {
    const tripsByTruck = groupTripsByTruck(replay.trips);
    const positions = [];
    for (const truck of replay.trucks) {
        const trips = tripsByTruck.get(truck.id) ?? [];
        const state = describeTruck(truck, trips, minute, routes, cityPoints);
        positions.push({ truckId: truck.id, equipment: truck.equipment, ...state });
    }
    return positions;
}

function groupTripsByTruck(trips) {
    const tripsByTruck = new Map();
    for (const trip of trips) {
        if (!tripsByTruck.has(trip.truck_id)) {
            tripsByTruck.set(trip.truck_id, []);
        }
        tripsByTruck.get(trip.truck_id).push(trip);
    }
    for (const truckTrips of tripsByTruck.values()) {
        truckTrips.sort((first, second) => first.decided - second.decided);
    }
    return tripsByTruck;
}

function describeTruck(truck, trips, minute, routes, cityPoints) {
    let parkedCity = truck.start_city;
    for (const trip of trips) {
        if (minute < trip.decided) {
            break;
        }
        if (minute >= trip.free) {
            parkedCity = trip.destination;
            continue;
        }
        return describeTrip(trip, minute, routes, cityPoints);
    }
    return parkedAt(parkedCity, "parked", cityPoints);
}

function describeTrip(trip, minute, routes, cityPoints) {
    if (minute < trip.pickup_arrival) {
        const fraction = (minute - trip.decided) / (trip.pickup_arrival - trip.decided);
        return driving(trip.from_city, trip.origin, fraction, "empty", routes, cityPoints);
    }
    if (minute < trip.depart_loaded) {
        return parkedAt(trip.origin, "loading", cityPoints);
    }
    if (minute < trip.delivery_arrival) {
        const fraction = (minute - trip.depart_loaded) / (trip.delivery_arrival - trip.depart_loaded);
        return driving(trip.origin, trip.destination, fraction, "loaded", routes, cityPoints);
    }
    return parkedAt(trip.destination, "unloading", cityPoints);
}

function parkedAt(city, phase, cityPoints) {
    const [lat, lon] = cityPoints[city];
    return { phase, lat, lon, bearing: 0 };
}

function driving(fromCity, toCity, fraction, phase, routes, cityPoints) {
    if (fromCity === toCity) {
        return parkedAt(fromCity, phase, cityPoints);
    }
    const path = pathForLane({ origin: fromCity, destination: toCity }, routes);
    const [lat, lon] = pointAlongPath(path, fraction);
    const ahead = pointAlongPath(path, Math.min(1, fraction + LOOK_AHEAD_FRACTION));
    const behind = pointAlongPath(path, Math.max(0, fraction - LOOK_AHEAD_FRACTION));
    return { phase, lat, lon, bearing: bearingDegrees(behind, ahead) };
}

/** Compass bearing from one [lat, lon] point to another, in degrees clockwise from north (0–360). */
export function bearingDegrees(from, to) {
    const northDistance = to[0] - from[0];
    const eastDistance = (to[1] - from[1]) * Math.cos(((from[0] + to[0]) / 2) * DEGREES_TO_RADIANS);
    const degrees = Math.atan2(eastDistance, northDistance) / DEGREES_TO_RADIANS;
    return (degrees + 360) % 360;
}
