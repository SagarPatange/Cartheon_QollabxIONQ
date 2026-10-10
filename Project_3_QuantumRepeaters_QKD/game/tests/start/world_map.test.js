/**
 * Tests for src/start/world_map.js: walking the overworld path and the shape of the map data.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    BRIDGES, BUSH_TILES, ENTANGLED_PAIR, MAP_HEIGHT_TILES, MAP_STOPS, MAP_WIDTH_TILES, PEACH_CASTLE_TILE, PIPE_TILES,
    QKD_LINK,
    QUANTUM_DECOR, TELECOM_TOWER_TILE_XS, TILE_SIZE_PX, findMapDirection, findStopInDirection,
    isEnterKey, isMapHash, isOnLand, buildMapHash, findEnterLabel, findStopIndexFromHash, findMapZoom,
    findRouteBetweenStops, listMainPathIndices, listPathSegments, listStopLinks, planWalk,
} from "../../src/start/world_map.js";

const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };


test("arrow keys and WASD give one-tile steps; other keys do not move Mario", () => {
    assert.deepEqual(findMapDirection("ArrowLeft"), LEFT);
    assert.deepEqual(findMapDirection("D"), RIGHT);
    assert.deepEqual(findMapDirection("w"), UP);
    assert.deepEqual(findMapDirection("ArrowDown"), DOWN);
    assert.equal(findMapDirection("q"), null);
});


// Stop indices in MAP_STOPS.
const START = 0;
const LEVEL_ONE = 1;
const TELEPORT = 2;
const BB84_HUT = 3;
const QEC_HUT = 4;
const LEVEL_THREE = 5;
const LEVEL_FOUR = 6;


test("the main path runs START → 1 → 2 → QEC hut → 3 → 4 by the arrow that points there", () => {
    assert.equal(findStopInDirection(START, RIGHT), LEVEL_ONE);
    assert.equal(findStopInDirection(LEVEL_ONE, UP), TELEPORT);
    assert.equal(findStopInDirection(TELEPORT, RIGHT), QEC_HUT);
    assert.equal(findStopInDirection(QEC_HUT, RIGHT), LEVEL_THREE);
    assert.equal(findStopInDirection(LEVEL_THREE, DOWN), LEVEL_FOUR);
    assert.equal(findStopInDirection(LEVEL_FOUR, UP), LEVEL_THREE);
    assert.equal(findStopInDirection(LEVEL_THREE, LEFT), QEC_HUT);
    assert.equal(findStopInDirection(QEC_HUT, LEFT), TELEPORT);
    assert.equal(findStopInDirection(TELEPORT, DOWN), LEVEL_ONE);
    assert.equal(findStopInDirection(LEVEL_ONE, LEFT), START);
});


test("the main path skips the BB84 hut: it is a spur off Level 2", () => {
    const mainPathIds = listMainPathIndices().map((stopIndex) => MAP_STOPS[stopIndex].id);
    assert.deepEqual(mainPathIds, ["start", "level1", "teleport", "hut", "level2", "level3"]);
    assert.equal(MAP_STOPS[BB84_HUT].branchFrom, "teleport");
});


test("from Level 2 the spur's arrow reaches the BB84 hut, and the opposite arrow comes back", () => {
    assert.equal(findStopInDirection(TELEPORT, LEFT), BB84_HUT);
    assert.equal(findStopInDirection(BB84_HUT, RIGHT), TELEPORT);
    assert.equal(findStopInDirection(BB84_HUT, LEFT), BB84_HUT);
    assert.equal(findStopInDirection(BB84_HUT, UP), BB84_HUT);
    assert.equal(findStopInDirection(BB84_HUT, DOWN), BB84_HUT);
});


test("a direction the path does not go leaves Mario where he is", () => {
    assert.equal(findStopInDirection(START, LEFT), START);
    assert.equal(findStopInDirection(LEVEL_ONE, RIGHT), LEVEL_ONE);
    assert.equal(findStopInDirection(TELEPORT, UP), TELEPORT);
    assert.equal(findStopInDirection(LEVEL_FOUR, RIGHT), LEVEL_FOUR);
});


test("the links are the main path in order plus the spur to the BB84 hut", () => {
    assert.deepEqual(listStopLinks(), [
        [START, LEVEL_ONE], [LEVEL_ONE, TELEPORT], [TELEPORT, QEC_HUT], [QEC_HUT, LEVEL_THREE],
        [LEVEL_THREE, LEVEL_FOUR], [TELEPORT, BB84_HUT],
    ]);
});


test("no stop has two neighbours in the same direction, so every arrow is unambiguous", () => {
    for (let stopIndex = 0; stopIndex < MAP_STOPS.length; stopIndex++) {
        const directionsUsed = new Set();
        for (const [firstIndex, secondIndex] of listStopLinks()) {
            if (firstIndex !== stopIndex && secondIndex !== stopIndex) {
                continue;
            }
            const otherIndex = firstIndex === stopIndex ? secondIndex : firstIndex;
            const stepX = Math.sign(MAP_STOPS[otherIndex].tileX - MAP_STOPS[stopIndex].tileX);
            const stepY = Math.sign(MAP_STOPS[otherIndex].tileY - MAP_STOPS[stopIndex].tileY);
            const directionKey = `${stepX},${stepY}`;
            assert.equal(directionsUsed.has(directionKey), false, MAP_STOPS[stopIndex].id);
            directionsUsed.add(directionKey);
        }
    }
});


test("the stops come in order: START, 1, 2 teleportation, the BB84 hut, the QEC hut, 3, 4", () => {
    const stopIds = MAP_STOPS.map((stop) => stop.id);
    assert.deepEqual(stopIds, ["start", "level1", "teleport", "bb84-hut", "hut", "level2", "level3"]);
    const kinds = MAP_STOPS.map((stop) => stop.kind);
    assert.deepEqual(kinds, ["start", "level", "level", "hut", "hut", "level", "level"]);
    const labels = MAP_STOPS.map((stop) => stop.label);
    assert.deepEqual(labels, ["START", "1", "2", "", "", "3", "4"]);
    const hrefs = MAP_STOPS.map((stop) => stop.href);
    assert.deepEqual(hrefs, [
        "start.html", "level1.html", "teleport.html", "bb84_hut.html", "hut.html", "level2.html", "qkd.html",
    ]);
});


test("every level's title starts with its label", () => {
    for (const stop of MAP_STOPS) {
        if (stop.kind === "level") {
            assert.ok(stop.title.startsWith(`Level ${stop.label}:`), stop.title);
        }
    }
});


test("every pair of linked stops shares a row or a column, so one arrow key leads to each", () => {
    for (const [firstIndex, secondIndex] of listStopLinks()) {
        const previousStop = MAP_STOPS[firstIndex];
        const stop = MAP_STOPS[secondIndex];
        const isSameRow = previousStop.tileY === stop.tileY;
        const isSameColumn = previousStop.tileX === stop.tileX;
        assert.ok(isSameRow || isSameColumn, `${previousStop.id} → ${stop.id}`);
        assert.ok(!(isSameRow && isSameColumn), `${previousStop.id} and ${stop.id} share a tile`);
    }
});


test("every stop stands on land, and the last one sits on the row where the QKD road starts", () => {
    for (const stop of MAP_STOPS) {
        assert.ok(isOnLand(stop.tileX, stop.tileY), `${stop.id} is in the sea`);
    }
    const lastStop = MAP_STOPS.at(-1);
    assert.equal(lastStop.tileY, QKD_LINK.tileY);
    assert.ok(lastStop.tileX < QKD_LINK.fromTileX);
});


test("the path crosses the sea only on a bridge", () => {
    for (const [firstIndex, secondIndex] of listStopLinks()) {
        const previousStop = MAP_STOPS[firstIndex];
        const stop = MAP_STOPS[secondIndex];
        const stepX = Math.sign(stop.tileX - previousStop.tileX);
        const stepY = Math.sign(stop.tileY - previousStop.tileY);
        let tileX = previousStop.tileX;
        let tileY = previousStop.tileY;
        while (tileX !== stop.tileX || tileY !== stop.tileY) {
            tileX += stepX;
            tileY += stepY;
            const isOnBridge = BRIDGES.some(
                (bridge) => bridge.tileY === tileY && tileX >= bridge.fromTileX && tileX <= bridge.toTileX,
            );
            assert.ok(isOnLand(tileX, tileY) || isOnBridge, `${tileX},${tileY} is open sea`);
        }
    }
});


test("the two huts carry signs that tell them apart", () => {
    const huts = MAP_STOPS.filter((stop) => stop.kind === "hut");
    const hutSigns = huts.map((hut) => hut.sign);
    assert.deepEqual(hutSigns, ["BB84", "QEC"]);
});


test("every path piece is straight and stays on the map", () => {
    for (const segment of listPathSegments()) {
        const isStraight = segment.fromTileX === segment.toTileX || segment.fromTileY === segment.toTileY;
        assert.ok(isStraight);
        for (const tileX of [segment.fromTileX, segment.toTileX]) {
            assert.ok(tileX >= 0 && tileX < MAP_WIDTH_TILES);
        }
        for (const tileY of [segment.fromTileY, segment.toTileY]) {
            assert.ok(tileY >= 0 && tileY < MAP_HEIGHT_TILES);
        }
    }
    assert.ok(PEACH_CASTLE_TILE.tileX < MAP_WIDTH_TILES);
});


test("Enter and Space open a stop", () => {
    assert.equal(isEnterKey("Enter"), true);
    assert.equal(isEnterKey(" "), true);
    assert.equal(isEnterKey("Escape"), false);
});


test("Mario faces the way he walks and keeps his facing on vertical steps", () => {
    const start = MAP_STOPS[0];
    const levelOne = MAP_STOPS[1];
    const teleport = MAP_STOPS[2];
    assert.equal(planWalk(start, levelOne, "left").facing, "right");
    assert.equal(planWalk(levelOne, start, "right").facing, "left");
    assert.equal(planWalk(levelOne, teleport, "left").facing, "left");
    assert.equal(planWalk(levelOne, teleport, "right").facing, "right");
});


test("a longer walk takes longer", () => {
    const shortWalk = planWalk(MAP_STOPS[QEC_HUT], MAP_STOPS[TELEPORT], "right");
    const longWalk = planWalk(MAP_STOPS[QEC_HUT], MAP_STOPS[LEVEL_THREE], "right");
    assert.ok(longWalk.durationMs > shortWalk.durationMs);
});


test("the map zooms so its height fills the view", () => {
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE_PX;
    assert.equal(findMapZoom(mapHeightPx), 1);
    assert.equal(findMapZoom(mapHeightPx * 1.5), 1.5);
});


test("a tiny or hidden view never shrinks the map to nothing", () => {
    assert.ok(findMapZoom(0) > 0);
});


test("the Enter button says what it opens", () => {
    assert.equal(findEnterLabel(MAP_STOPS[0]), "Title screen");
    assert.equal(findEnterLabel(MAP_STOPS[1]), "Play level");
    assert.equal(findEnterLabel(MAP_STOPS[2]), "Play level");
    assert.equal(findEnterLabel(MAP_STOPS[3]), "Visit hut");
});


test("the QKD fiber runs tower to tower from Level 4's island to Peach's island", () => {
    assert.equal(TELECOM_TOWER_TILE_XS[0], QKD_LINK.fromTileX);
    assert.equal(TELECOM_TOWER_TILE_XS.at(-1), QKD_LINK.toTileX);
    assert.ok(isOnLand(QKD_LINK.fromTileX, QKD_LINK.tileY));
    assert.ok(isOnLand(QKD_LINK.toTileX, QKD_LINK.tileY));
    for (const towerTileX of TELECOM_TOWER_TILE_XS.slice(1, -1)) {
        assert.equal(isOnLand(towerTileX, QKD_LINK.tileY), false);
    }
});


test("the quantum scenery (bar the sea monster) stands on land and never covers a stop, bush, pipe or tower", () => {
    const takenTiles = new Set();
    for (const tile of [...MAP_STOPS, ...BUSH_TILES, ...PIPE_TILES]) {
        takenTiles.add(`${tile.tileX},${tile.tileY}`);
    }
    for (const towerTileX of TELECOM_TOWER_TILE_XS) {
        takenTiles.add(`${towerTileX},${QKD_LINK.tileY}`);
    }
    const sceneryTiles = [ENTANGLED_PAIR.firstTile, ENTANGLED_PAIR.secondTile];
    for (const decor of QUANTUM_DECOR) {
        if (decor.kind !== "electric-nessie") {
            sceneryTiles.push(decor);
        }
    }
    for (const tile of sceneryTiles) {
        assert.ok(isOnLand(tile.tileX, tile.tileY), `${tile.tileX},${tile.tileY} is in the sea`);
        assert.equal(takenTiles.has(`${tile.tileX},${tile.tileY}`), false, `${tile.tileX},${tile.tileY} is taken`);
    }
});


test("the electric Loch Ness monster swims in the sea", () => {
    const nessie = QUANTUM_DECOR.find((decor) => decor.kind === "electric-nessie");
    assert.equal(isOnLand(nessie.tileX, nessie.tileY), false);
});


test("each page's Map button brings Mario back to the stop it belongs to", () => {
    const stopIds = MAP_STOPS.map((stop) => stop.id);
    assert.equal(findStopIndexFromHash("#map-level2"), stopIds.indexOf("level2"));
    assert.equal(findStopIndexFromHash("#map-level3"), stopIds.indexOf("level3"));
    assert.equal(findStopIndexFromHash("#map-hut"), stopIds.indexOf("hut"));
    assert.equal(findStopIndexFromHash("#map-teleport"), stopIds.indexOf("teleport"));
    assert.equal(findStopIndexFromHash("#map-bb84-hut"), stopIds.indexOf("bb84-hut"));
    for (let i = 0; i < MAP_STOPS.length; i++) {
        assert.equal(findStopIndexFromHash(buildMapHash(i)), i);
    }
});


test("a plain or unknown map address starts on START; other addresses show the title", () => {
    const startIndex = MAP_STOPS.findIndex((stop) => stop.kind === "start");
    assert.equal(findStopIndexFromHash("#map"), startIndex);
    assert.equal(findStopIndexFromHash("#map-nowhere"), startIndex);
    assert.equal(findStopIndexFromHash("#map-level1"), 1);
    assert.equal(isMapHash("#map"), true);
    assert.equal(isMapHash("#map-level2"), true);
    assert.equal(isMapHash(""), false);
});


test("a route to a neighbouring stop is just that stop; a route to where Mario stands is empty", () => {
    assert.deepEqual(findRouteBetweenStops(LEVEL_THREE, LEVEL_FOUR), [LEVEL_FOUR]);
    assert.deepEqual(findRouteBetweenStops(TELEPORT, TELEPORT), []);
});


test("a long route follows the path through every stop in between, forwards and backwards", () => {
    assert.deepEqual(findRouteBetweenStops(TELEPORT, LEVEL_FOUR), [QEC_HUT, LEVEL_THREE, LEVEL_FOUR]);
    assert.deepEqual(findRouteBetweenStops(LEVEL_FOUR, START), [LEVEL_THREE, QEC_HUT, TELEPORT, LEVEL_ONE, START]);
});


test("a route into or out of the spur goes through Level 2", () => {
    assert.deepEqual(findRouteBetweenStops(BB84_HUT, LEVEL_FOUR), [TELEPORT, QEC_HUT, LEVEL_THREE, LEVEL_FOUR]);
    assert.deepEqual(findRouteBetweenStops(LEVEL_THREE, BB84_HUT), [QEC_HUT, TELEPORT, BB84_HUT]);
    assert.deepEqual(findRouteBetweenStops(START, BB84_HUT), [LEVEL_ONE, TELEPORT, BB84_HUT]);
});
