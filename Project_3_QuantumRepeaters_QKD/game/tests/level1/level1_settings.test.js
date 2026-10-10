/**
 * Tests for src/level1/level1_settings.js: the defaults, and what the settings do to the game.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    PAIR_LIFETIME_MS, computeHeraldProbability, createLevel1State, decohereExpiredPairs, sendPhotons,
} from "../../src/level1/level1_protocol.js";
import {
    LINK_SETTINGS, canFillMemory, computeLifetimeMs, computeTryDurationMs, createDefaultSettings, formatSettingValue,
    MIN_LINK_WIDTH_FRACTION, computeArrivalBrightness, findDetectorWear, findLinkWidthFraction, summarizeLinkSettings,
    toLinkPhysics,
} from "../../src/level1/level1_settings.js";

const ALWAYS_SUCCEED = () => 0;


/**
 * Play tries back to back with every try clicking, losing pairs as they expire; report if all 3 slots ever filled.
 */
function fillsMemoryWithPerfectLuck(settings, tryCount) {
    const tryDurationMs = computeTryDurationMs(settings);
    const lifetimeMs = computeLifetimeMs(settings);
    let state = createLevel1State();
    for (let i = 1; i <= tryCount; i++) {
        const nowMs = i * tryDurationMs;
        state = decohereExpiredPairs(state, nowMs, lifetimeMs).state;
        state = sendPhotons(state, nowMs, ALWAYS_SUCCEED, 1);
        if (state.hasFilledMemory) {
            return true;
        }
    }
    return false;
}


test("every default sits inside its slider's range", () => {
    for (const spec of LINK_SETTINGS) {
        assert.ok(spec.min <= spec.defaultValue && spec.defaultValue <= spec.max, spec.id);
    }
});


test("the defaults are a poor link: about a 1.5 % chance per try, 2.1 s tries, 3 s memories", () => {
    const settings = createDefaultSettings();
    assert.ok(Math.abs(computeHeraldProbability(toLinkPhysics(settings)) - 0.0155) < 0.001);
    assert.equal(computeTryDurationMs(settings), 2100);
    assert.equal(computeLifetimeMs(settings), 3000);
});


test("the defaults can never fill all 3 slots, even if every try clicks", () => {
    const settings = createDefaultSettings();
    assert.equal(canFillMemory(settings), false);
    assert.equal(fillsMemoryWithPerfectLuck(settings, 50), false);
});


test("a better link can fill all 3 slots", () => {
    const tunedSettings = { ...createDefaultSettings(), internodeDistanceKm: 20, memoryLifetimeSeconds: 10 };
    assert.equal(canFillMemory(tunedSettings), true);
    assert.equal(fillsMemoryWithPerfectLuck(tunedSettings, 3), true);
    assert.equal(computeLifetimeMs(tunedSettings), PAIR_LIFETIME_MS);
});


test("a longer link makes each try slower", () => {
    const settings = { ...createDefaultSettings(), internodeDistanceKm: 40 };
    assert.equal(computeTryDurationMs(settings), 1400);
});


test("the panel offers 4 settings, with no extra delay per try", () => {
    const settingIds = LINK_SETTINGS.map((spec) => spec.id);
    assert.deepEqual(settingIds, [
        "detectorEfficiencyPercent", "attenuationDbPerKm", "internodeDistanceKm", "memoryLifetimeSeconds",
    ]);
});


test("values show with their step's decimals and unit", () => {
    const attenuation = LINK_SETTINGS.find((spec) => spec.id === "attenuationDbPerKm");
    const efficiency = LINK_SETTINGS.find((spec) => spec.id === "detectorEfficiencyPercent");
    assert.equal(formatSettingValue(attenuation, 0.2), "0.20 dB/km");
    assert.equal(formatSettingValue(efficiency, 90), "90%");
});


test("the summary of the default link: about 2 % a try, 2.1 s tries, and all 3 slots cannot fill", () => {
    const summary = summarizeLinkSettings(createDefaultSettings());
    assert.equal(summary.chancePercent, 2);
    assert.equal(summary.trySeconds, "2.1");
    assert.equal(summary.canFill, false);
});


test("the link spans more of the screen the longer the fiber: shortest at 5 km, the full width at 60 km", () => {
    assert.equal(findLinkWidthFraction(5), MIN_LINK_WIDTH_FRACTION);
    assert.equal(findLinkWidthFraction(60), 1);
    const halfwayFraction = findLinkWidthFraction(32.5);
    assert.ok(halfwayFraction > MIN_LINK_WIDTH_FRACTION && halfwayFraction < 1);
    assert.ok(findLinkWidthFraction(20) < findLinkWidthFraction(40));
});


test("a photon reaches the BSM with 10^(-dB/10) of its light, over half the internode distance", () => {
    // 0.2 dB/km over 50 km: each photon crosses 25 km, losing 5 dB, so 10^-0.5 of it arrives.
    const settings = { ...createDefaultSettings(), attenuationDbPerKm: 0.2, internodeDistanceKm: 50 };
    assert.ok(Math.abs(computeArrivalBrightness(settings) - 10 ** -0.5) < 1e-12);
});


test("more attenuation or a longer fiber means a dimmer photon at the BSM", () => {
    const base = { ...createDefaultSettings(), attenuationDbPerKm: 0.2, internodeDistanceKm: 20 };
    const lossier = { ...base, attenuationDbPerKm: 0.4 };
    const longer = { ...base, internodeDistanceKm: 40 };
    assert.ok(computeArrivalBrightness(lossier) < computeArrivalBrightness(base));
    assert.ok(computeArrivalBrightness(longer) < computeArrivalBrightness(base));
});


test("detectors wear like a Minecraft anvil: like new from 90 %, chipped from 70 %, damaged below", () => {
    assert.equal(findDetectorWear(100), "new");
    assert.equal(findDetectorWear(90), "new");
    assert.equal(findDetectorWear(89), "chipped");
    assert.equal(findDetectorWear(70), "chipped");
    assert.equal(findDetectorWear(69), "damaged");
    assert.equal(findDetectorWear(50), "damaged");
});
