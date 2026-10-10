/**
 * Tests for src/pixel_sprites.js: every sprite map is rectangular and only uses palette colours.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ARROW_SPRITE, BLOCH_SPHERE_SPRITE, CASTLE_SPRITE, ELECTRIC_NESSIE_SPRITE, CLOUD_TURTLE_SPRITE, INFINITE_WELL_SPRITE,
    ION_TRAP_SPRITE, LUIGI_SPRITE, MARIO_SPRITE, MARIO_STRIDE_SPRITE, MUSHROOM_HUT_SPRITE,
    NV_CENTER_SPRITE, PEACH_CASTLE_SPRITE, PEACH_SPRITE, QUBIT_BIRD_DOWN_SPRITE, QUBIT_BIRD_UP_SPRITE,
    SCHRODINGER_CAT_SPRITE, TELECOM_TOWER_SPRITE, TOAD_SPRITE, checkSprite,
} from "../src/pixel_sprites.js";


test("every sprite is well-formed", () => {
    const sprites = [
        MARIO_SPRITE, MARIO_STRIDE_SPRITE, LUIGI_SPRITE, CLOUD_TURTLE_SPRITE, PEACH_SPRITE, TOAD_SPRITE,
        MUSHROOM_HUT_SPRITE, CASTLE_SPRITE, ARROW_SPRITE, TELECOM_TOWER_SPRITE, PEACH_CASTLE_SPRITE,
        ION_TRAP_SPRITE, NV_CENTER_SPRITE, INFINITE_WELL_SPRITE,
        BLOCH_SPHERE_SPRITE, QUBIT_BIRD_UP_SPRITE, QUBIT_BIRD_DOWN_SPRITE, SCHRODINGER_CAT_SPRITE,
        ELECTRIC_NESSIE_SPRITE,
    ];
    for (const sprite of sprites) {
        assert.doesNotThrow(() => checkSprite(sprite));
    }
});


test("a ragged sprite fails fast", () => {
    const raggedSprite = { rows: ["RR", "R"], palette: { R: "#ff0000" } };
    assert.throws(() => checkSprite(raggedSprite), /wide/);
});


test("an unknown colour fails fast", () => {
    const unknownColorSprite = { rows: ["RX"], palette: { R: "#ff0000" } };
    assert.throws(() => checkSprite(unknownColorSprite), /palette/);
});
