/**
 * Tests for src/level1/level1_settings.js: the defaults, and what the settings do to the game.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PAIR_LIFETIME_MS, computeHeraldProbability } from "../../src/level1/level1_protocol.js";
import {
    LINK_SETTINGS, computeLifetimeMs, computeTryDurationMs, createDefaultSettings, formatSettingValue, toLinkPhysics,
} from "../../src/level1/level1_settings.js";


test("every default sits inside its slider's range", () => {
    for (const spec of LINK_SETTINGS) {
        assert.ok(spec.min <= spec.defaultValue && spec.defaultValue <= spec.max, spec.id);
    }
});


test("the defaults give the classic level: about a 32 % chance per try, 0.7 s tries, 10 s memories", () => {
    const settings = createDefaultSettings();
    assert.ok(Math.abs(computeHeraldProbability(toLinkPhysics(settings)) - 0.3226) < 0.001);
    assert.equal(computeTryDurationMs(settings), 700);
    assert.equal(computeLifetimeMs(settings), PAIR_LIFETIME_MS);
});


test("a longer link and extra delay make each try slower", () => {
    const settings = { ...createDefaultSettings(), internodeDistanceKm: 40, extraDelaySeconds: 0.5 };
    assert.equal(computeTryDurationMs(settings), 1900);
});


test("values show with their step's decimals and unit", () => {
    const attenuation = LINK_SETTINGS.find((spec) => spec.id === "attenuationDbPerKm");
    const efficiency = LINK_SETTINGS.find((spec) => spec.id === "detectorEfficiencyPercent");
    assert.equal(formatSettingValue(attenuation, 0.2), "0.20 dB/km");
    assert.equal(formatSettingValue(efficiency, 90), "90%");
});
