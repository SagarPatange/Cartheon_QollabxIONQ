/**
 * Real road paths for lanes (from data/osm_routes/lane_routes.json, © OpenStreetMap contributors, ODbL).
 * Each stored path runs between two cities in alphabetical order; a lane in the other direction uses it reversed.
 */

/** The [lat, lon] path from the lane's origin to its destination. */
export function pathForLane(lane, routes) {
    for (const route of routes) {
        const [firstCity, secondCity] = route.cities;
        if (firstCity === lane.origin && secondCity === lane.destination) {
            return route.points;
        }
        if (firstCity === lane.destination && secondCity === lane.origin) {
            return [...route.points].reverse();
        }
    }
    throw new Error(`no road path for ${lane.origin} → ${lane.destination}`);
}

/**
 * The point a fraction of the way along a path, measured by distance (in degrees, which is fine for placing a
 * marker): 0 is the start, 1 the end; fractions outside 0–1 are clamped.
 */
export function pointAlongPath(path, fraction) {
    const clampedFraction = Math.min(1, Math.max(0, fraction));
    const segmentLengths = [];
    for (let i = 1; i < path.length; i++) {
        segmentLengths.push(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    }
    const totalLength = segmentLengths.reduce((total, length) => total + length, 0);
    let remainingLength = clampedFraction * totalLength;
    for (let i = 0; i < segmentLengths.length; i++) {
        if (remainingLength <= segmentLengths[i]) {
            const segmentFraction = segmentLengths[i] === 0 ? 0 : remainingLength / segmentLengths[i];
            const start = path[i];
            const end = path[i + 1];
            return [start[0] + (end[0] - start[0]) * segmentFraction, start[1] + (end[1] - start[1]) * segmentFraction];
        }
        remainingLength -= segmentLengths[i];
    }
    return path[path.length - 1];
}
