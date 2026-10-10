/**
 * The overworld map, Super Mario Bros. 3 style: islands in the sea, a path of stops, and a long bridge of repeaters
 * out to Peach's castle. Positions are in map tiles; render_map.js turns tiles into pixels.
 *
 * Mario walks stop to stop along the path. Every pair of neighbouring stops sits on one row or one column, so a
 * direction key picks at most one neighbour. Pure; start_main.js does the drawing and the page changes.
 */

export const TILE_SIZE_PX = 64;
export const MAP_WIDTH_TILES = 39;
export const MAP_HEIGHT_TILES = 9;
// Below this the map is too small to play; the view scrolls instead.
export const MIN_MAP_ZOOM = 0.5;

// In walking order. kind picks the look: "start" square, numbered "level" panel, or the mushroom "hut". id names the
// stop in the map's address (start.html#map-<id>), so each page's "◀ Map" button brings Mario back to its stop.
export const MAP_STOPS = [
    {
        kind: "start",
        label: "START",
        title: "Start",
        description: "Back to the title screen.",
        href: "start.html",
        id: "start",
        tileX: 3,
        tileY: 6,
    },
    {
        kind: "level",
        label: "1",
        title: "Level 1: Quantum repeaters",
        description: "Mario and Luigi with a BSM between them. Hold 3 Bell pairs at once before they decohere.",
        href: "level1.html",
        id: "level1",
        tileX: 7,
        tileY: 6,
    },
    {
        kind: "hut",
        label: "",
        title: "Toad's QEC hut",
        description: "Not a level: Toad teaches how error-correcting codes protect fragile qubits.",
        href: "hut.html",
        id: "hut",
        tileX: 7,
        tileY: 3,
    },
    {
        kind: "level",
        label: "2",
        title: "Level 2: A logical Bell pair with Luigi",
        description: "Herald 7 Bell pairs, encode two Steane blocks, and link them into one logical pair.",
        href: "level2.html",
        id: "level2",
        tileX: 12,
        tileY: 3,
    },
    {
        kind: "level",
        label: "3",
        title: "Level 3: A secret message for Peach",
        description: "Share a quantum key and send Princess Peach a message across a very long repeater chain.",
        href: "qkd.html",
        id: "level3",
        tileX: 12,
        tileY: 6,
    },
];

export const FIRST_STOP_INDEX = 1;

// The map's address: "#map" alone, or "#map-<stop id>" to put Mario on that stop.
const MAP_HASH = "#map";
const MAP_HASH_STOP_PREFIX = "#map-";

// What the Enter button says on each kind of stop: what pressing it opens.
const ENTER_LABEL_BY_KIND = { start: "Title screen", level: "Play level", hut: "Visit hut" };

// Walking speed on the map: Mario takes this long per tile, so a long path takes longer than a short one.
export const WALK_MS_PER_TILE = 160;

// Green land, as {tileX, tileY, widthTiles, heightTiles}. Mario's island has room at its west end for quantum gear.
export const ISLANDS = [
    { tileX: 1, tileY: 2, widthTiles: 8, heightTiles: 6 },
    { tileX: 11, tileY: 2, widthTiles: 4, heightTiles: 6 },
    { tileX: 34, tileY: 3, widthTiles: 4, heightTiles: 5 },
];

// Wooden bridges over the water, on one row, from fromTileX to toTileX.
export const BRIDGES = [
    { fromTileX: 9, toTileX: 11, tileY: 3 },
];

// Level 3 is long: past stop 3 there is no road over the sea, only a QKD fiber strung across telecom towers (the
// repeaters) to Peach's island. The end towers stand on land; the ones between stand on small islets in the sea.
export const QKD_LINK = { fromTileX: 14, toTileX: 34, tileY: 6 };
export const TELECOM_TOWER_TILE_XS = [14, 18, 22, 26, 30, 34];
const PEACH_LAND_ROADS = [
    { fromTileX: 12, toTileX: QKD_LINK.fromTileX, tileY: 6 },
    { fromTileX: QKD_LINK.toTileX, toTileX: 36, tileY: 6 },
];
export const PEACH_CASTLE_TILE = { tileX: 36, tileY: 5 };

export const BUSH_TILES = [
    { tileX: 2, tileY: 4 }, { tileX: 4, tileY: 4 }, { tileX: 5, tileY: 5 }, { tileX: 1, tileY: 7 },
    { tileX: 3, tileY: 7 }, { tileX: 11, tileY: 4 }, { tileX: 35, tileY: 7 },
];
export const PIPE_TILES = [{ tileX: 8, tileY: 7 }, { tileX: 14, tileY: 7 }];

// Quantum scenery: decoration only, nothing to click. All of it stands on land except the electric Loch Ness
// monster, who lives in the sea. kind picks the sprite in render_map.js; sign, when given, is
// a short name shown on a sign just below. Pieces sit at hand-picked, uneven spots (between whole tiles) so the
// islands look like countryside, not a grid.
export const QUANTUM_DECOR = [
    { kind: "ion-trap", tileX: 2.2, tileY: 2.4 },
    { kind: "infinite-well", tileX: 4.8, tileY: 2.2 },
    { kind: "schrodinger-cat", tileX: 13.4, tileY: 2.3 },
    { kind: "nv-center", tileX: 13.3, tileY: 3.6 },
    { kind: "electric-nessie", tileX: 23.5, tileY: 3 },
];

// Qubit birds flying across the whole map over sea and sky, each at its own height and speed. A negative delay starts
// a bird part-way across, so the sky is never empty when the map opens.
export const QUBIT_BIRDS = [
    { tileY: 0.5, flySeconds: 40, delaySeconds: -6, isFlyingLeft: false },
    { tileY: 1.2, flySeconds: 55, delaySeconds: -30, isFlyingLeft: false },
    { tileY: 8.4, flySeconds: 48, delaySeconds: -18, isFlyingLeft: true },
];

// Two Bloch spheres, spins opposite, one on each of the first two islands, linked across the sea.
export const ENTANGLED_PAIR = {
    firstTile: { tileX: 5, tileY: 7 },
    secondTile: { tileX: 11, tileY: 7 },
};

const DIRECTION_BY_KEY = {
    ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
};
const ENTER_KEYS = ["Enter", " "];


/**
 * The step direction for a key, or null when the key does not move Mario.
 *
 * @param {string} key - KeyboardEvent.key.
 * @returns {{x: number, y: number} | null}
 */
export function findMapDirection(key) {
    // Letter keys count with or without Shift; named keys such as ArrowLeft stay as they are.
    const isLetterKey = key.length === 1;
    const lookupKey = isLetterKey ? key.toLowerCase() : key;
    const direction = DIRECTION_BY_KEY[lookupKey];
    if (direction === undefined) {
        return null;
    }
    return direction;
}


/**
 * Does this key open the stop Mario stands on?
 *
 * @param {string} key - KeyboardEvent.key.
 * @returns {boolean}
 */
export function isEnterKey(key) {
    return ENTER_KEYS.includes(key);
}


/**
 * The neighbouring stop in the given direction, or the current stop when the path does not go that way.
 *
 * @param {number} currentIndex - index into MAP_STOPS.
 * @param {{x: number, y: number}} direction - one step left, right, up or down.
 * @returns {number}
 */
export function findStopInDirection(currentIndex, direction) {
    const currentStop = MAP_STOPS[currentIndex];
    for (const neighbourIndex of [currentIndex - 1, currentIndex + 1]) {
        const neighbourStop = MAP_STOPS[neighbourIndex];
        if (neighbourStop === undefined) {
            continue;
        }
        const stepX = Math.sign(neighbourStop.tileX - currentStop.tileX);
        const stepY = Math.sign(neighbourStop.tileY - currentStop.tileY);
        if (stepX === direction.x && stepY === direction.y) {
            return neighbourIndex;
        }
    }
    return currentIndex;
}


/**
 * The straight path pieces between neighbouring stops, plus the land roads at each end of the QKD fiber.
 *
 * @returns {{fromTileX: number, fromTileY: number, toTileX: number, toTileY: number}[]}
 */
export function listPathSegments() {
    const segments = [];
    for (let i = 1; i < MAP_STOPS.length; i++) {
        const previousStop = MAP_STOPS[i - 1];
        const stop = MAP_STOPS[i];
        segments.push({
            fromTileX: previousStop.tileX, fromTileY: previousStop.tileY, toTileX: stop.tileX, toTileY: stop.tileY,
        });
    }
    for (const road of PEACH_LAND_ROADS) {
        segments.push({ fromTileX: road.fromTileX, fromTileY: road.tileY, toTileX: road.toTileX, toTileY: road.tileY });
    }
    return segments;
}


/**
 * How Mario walks from one stop to the next: which way he faces and how long the walk takes.
 *
 * Neighbouring stops share a row or a column, so the walk is one straight line. On an up or down walk he keeps the
 * way he was facing, as in Super Mario Bros. 3.
 *
 * @param {{tileX: number, tileY: number}} fromStop
 * @param {{tileX: number, tileY: number}} toStop
 * @param {"left" | "right"} previousFacing
 * @returns {{facing: "left" | "right", durationMs: number}}
 */
export function planWalk(fromStop, toStop, previousFacing) {
    const stepX = Math.sign(toStop.tileX - fromStop.tileX);
    let facing = previousFacing;
    if (stepX > 0) {
        facing = "right";
    } else if (stepX < 0) {
        facing = "left";
    }
    const distanceTiles = Math.abs(toStop.tileX - fromStop.tileX) + Math.abs(toStop.tileY - fromStop.tileY);
    const durationMs = distanceTiles * WALK_MS_PER_TILE;
    return { facing, durationMs };
}


/**
 * How much to zoom the map so its height fills the map view. The width then runs past the screen and scrolls.
 *
 * @param {number} viewHeightPx - the inner height of the map view, in CSS pixels.
 * @returns {number} the zoom, never below MIN_MAP_ZOOM.
 */
export function findMapZoom(viewHeightPx) {
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE_PX;
    const zoom = viewHeightPx / mapHeightPx;
    return Math.max(zoom, MIN_MAP_ZOOM);
}


/**
 * The Enter button's label for a stop.
 *
 * @param {{kind: string}} stop - one of MAP_STOPS.
 * @returns {string}
 */
export function findEnterLabel(stop) {
    return ENTER_LABEL_BY_KIND[stop.kind];
}


/**
 * Is this tile on one of the islands? Telecom towers in the sea get an islet to stand on; towers on land don't.
 *
 * @param {number} tileX
 * @param {number} tileY
 * @returns {boolean}
 */
export function isOnLand(tileX, tileY) {
    for (const island of ISLANDS) {
        const isInsideX = tileX >= island.tileX && tileX < island.tileX + island.widthTiles;
        const isInsideY = tileY >= island.tileY && tileY < island.tileY + island.heightTiles;
        if (isInsideX && isInsideY) {
            return true;
        }
    }
    return false;
}


/**
 * Does this address open the map (rather than the title screen)?
 *
 * @param {string} hash - window.location.hash.
 * @returns {boolean}
 */
export function isMapHash(hash) {
    return hash === MAP_HASH || hash.startsWith(MAP_HASH_STOP_PREFIX);
}


/**
 * Which stop Mario stands on when the map opens at this address: the one it names, or Level 1.
 *
 * @param {string} hash - window.location.hash, e.g. "#map-level2".
 * @returns {number} index into MAP_STOPS.
 */
export function findStopIndexFromHash(hash) {
    if (!hash.startsWith(MAP_HASH_STOP_PREFIX)) {
        return FIRST_STOP_INDEX;
    }
    const stopId = hash.slice(MAP_HASH_STOP_PREFIX.length);
    const stopIndex = MAP_STOPS.findIndex((stop) => stop.id === stopId);
    if (stopIndex === -1) {
        return FIRST_STOP_INDEX;
    }
    return stopIndex;
}


/**
 * The map's address with Mario on a stop, so a reload keeps him there.
 *
 * @param {number} stopIndex - index into MAP_STOPS.
 * @returns {string}
 */
export function buildMapHash(stopIndex) {
    return `${MAP_HASH_STOP_PREFIX}${MAP_STOPS[stopIndex].id}`;
}
