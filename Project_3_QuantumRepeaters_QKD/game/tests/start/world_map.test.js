/**
 * Tests for src/start/world_map.js: walking the overworld path and the shape of the map data.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    BUSH_TILES, ENTANGLED_PAIR, MAP_HEIGHT_TILES, MAP_STOPS, MAP_WIDTH_TILES, PEACH_CASTLE_TILE, PIPE_TILES, QKD_LINK,
    QUANTUM_DECOR, TELECOM_TOWER_TILE_XS, TILE_SIZE_PX, findMapDirection, findStopInDirection,
    isEnterKey, isMapHash, isOnLand, buildMapHash, findEnterLabel, findStopIndexFromHash, findMapZoom,
    listPathSegments, planWalk,
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


test("the path runs START → 1 → hut → 2 → 3 by the arrow that points there", () => {
    assert.equal(findStopInDirection(0, RIGHT), 1);
    assert.equal(findStopInDirection(1, UP), 2);
    assert.equal(findStopInDirection(2, RIGHT), 3);
    assert.equal(findStopInDirection(3, DOWN), 4);
    assert.equal(findStopInDirection(4, UP), 3);
    assert.equal(findStopInDirection(2, DOWN), 1);
});


test("a direction the path does not go leaves Mario where he is", () => {
    assert.equal(findStopInDirection(0, LEFT), 0);
    assert.equal(findStopInDirection(1, RIGHT), 1);
    assert.equal(findStopInDirection(4, RIGHT), 4);
});


test("the stops are START, level 1, the hut, level 2 and level 3, each opening a page", () => {
    const kinds = MAP_STOPS.map((stop) => stop.kind);
    assert.deepEqual(kinds, ["start", "level", "hut", "level", "level"]);
    for (const stop of MAP_STOPS) {
        assert.match(stop.href, /\.html$/);
    }
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
    const hut = MAP_STOPS[2];
    assert.equal(planWalk(start, levelOne, "left").facing, "right");
    assert.equal(planWalk(levelOne, start, "right").facing, "left");
    assert.equal(planWalk(levelOne, hut, "left").facing, "left");
    assert.equal(planWalk(levelOne, hut, "right").facing, "right");
});


test("a longer walk takes longer", () => {
    const shortWalk = planWalk(MAP_STOPS[1], MAP_STOPS[2], "right");
    const longWalk = planWalk(MAP_STOPS[2], MAP_STOPS[3], "right");
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
    assert.equal(findEnterLabel(MAP_STOPS[2]), "Visit hut");
});


test("the QKD fiber runs tower to tower from Level 3's island to Peach's island", () => {
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
    for (let i = 0; i < MAP_STOPS.length; i++) {
        assert.equal(findStopIndexFromHash(buildMapHash(i)), i);
    }
});


test("a plain or unknown map address starts on Level 1; other addresses show the title", () => {
    assert.equal(findStopIndexFromHash("#map"), 1);
    assert.equal(findStopIndexFromHash("#map-nowhere"), 1);
    assert.equal(isMapHash("#map"), true);
    assert.equal(isMapHash("#map-level2"), true);
    assert.equal(isMapHash(""), false);
});
