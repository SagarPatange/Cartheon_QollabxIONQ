/**
 * Level 1's link settings: what the settings panel offers, their defaults, and what each one does to the game.
 *
 * The defaults are a poor link on purpose: a long, lossy fiber and short-lived memories, so 3 pairs can never sit in
 * memory at once. The round only clears once the player changes the settings (canFillMemory says when it can).
 *
 * Pure functions with no DOM, so they can be tested in node; src/settings_panel.js draws the sliders.
 */

import { MEMORY_SLOT_COUNT, computeHeraldProbability, computePhotonTransmission } from "./level1_protocol.js";

// Photons and the herald signal take this long per km of link, in game time, so a longer link means slower tries.
// 35 ms per km makes a 20 km link take 0.7 s, the photon animation's original length.
const GAME_MS_PER_KM = 35;
const MS_PER_SECOND = 1000;
const PERCENT = 100;
// At the shortest distance the fiber still spans this share of the widest link, so the BSM Node never crowds the
// towers.
export const MIN_LINK_WIDTH_FRACTION = 0.2;
// Detector wear, Minecraft-anvil style: like new from this efficiency up, chipped from the next, damaged below it.
const LIKE_NEW_FROM_PERCENT = 90;
const CHIPPED_FROM_PERCENT = 70;

export const LINK_SETTINGS = [
    {
        id: "detectorEfficiencyPercent", label: "Detector efficiency", unit: "%",
        min: 50, max: 100, step: 1, defaultValue: 70,
    },
    {
        id: "attenuationDbPerKm", label: "Fiber attenuation", unit: " dB/km",
        min: 0.15, max: 0.5, step: 0.01, defaultValue: 0.25,
    },
    {
        id: "internodeDistanceKm", label: "Internode distance", unit: " km",
        min: 5, max: 60, step: 1, defaultValue: 60,
    },
    {
        id: "memoryLifetimeSeconds", label: "Memory lifetime", unit: " s",
        min: 2, max: 30, step: 1, defaultValue: 3,
    },
];


/**
 * Every setting at its default.
 *
 * @returns {Object<string, number>} by setting id.
 */
export function createDefaultSettings() {
    const settings = {};
    for (const spec of LINK_SETTINGS) {
        settings[spec.id] = spec.defaultValue;
    }
    return settings;
}


/**
 * The link as computeHeraldProbability (level1_protocol.js) wants it.
 *
 * @param {Object<string, number>} settings
 * @returns {{detectorEfficiency: number, attenuationDbPerKm: number, internodeDistanceKm: number}}
 */
export function toLinkPhysics(settings) {
    return {
        detectorEfficiency: settings.detectorEfficiencyPercent / PERCENT,
        attenuationDbPerKm: settings.attenuationDbPerKm,
        internodeDistanceKm: settings.internodeDistanceKm,
    };
}


/**
 * How long one try takes in game time: photons out to the BSM and its click back.
 *
 * @param {Object<string, number>} settings
 * @returns {number} milliseconds.
 */
export function computeTryDurationMs(settings) {
    return Math.round(settings.internodeDistanceKm * GAME_MS_PER_KM);
}


/**
 * How long a stored pair lasts.
 *
 * @param {Object<string, number>} settings
 * @returns {number} milliseconds.
 */
export function computeLifetimeMs(settings) {
    return settings.memoryLifetimeSeconds * MS_PER_SECOND;
}


/**
 * Whether these settings can ever hold all 3 pairs at once. Even if every try clicked, the last pair arrives
 * (MEMORY_SLOT_COUNT − 1) tries after the first, and the first must still be alive then. The defaults fail this:
 * 2 tries of 2.1 s take 4.2 s, longer than a 3 s memory.
 *
 * @param {Object<string, number>} settings
 * @returns {boolean}
 */
export function canFillMemory(settings) {
    const fastestFillMs = (MEMORY_SLOT_COUNT - 1) * computeTryDurationMs(settings);
    return fastestFillMs < computeLifetimeMs(settings);
}


/**
 * What the settings add up to, for the panel's summary: the chance a try makes a pair, how long a try takes, and
 * whether all 3 slots can ever fill.
 *
 * @param {Object<string, number>} settings
 * @returns {{chancePercent: number, trySeconds: string, canFill: boolean}}
 */
export function summarizeLinkSettings(settings) {
    const chancePercent = Math.round(computeHeraldProbability(toLinkPhysics(settings)) * PERCENT);
    const trySeconds = (computeTryDurationMs(settings) / MS_PER_SECOND).toFixed(1);
    return { chancePercent, trySeconds, canFill: canFillMemory(settings) };
}


/**
 * How much of the screen the fiber spans for this distance: MIN_LINK_WIDTH_FRACTION at the shortest setting, the
 * full width at the longest, in a straight line between.
 *
 * @param {number} internodeDistanceKm
 * @returns {number} a fraction in [MIN_LINK_WIDTH_FRACTION, 1].
 */
export function findLinkWidthFraction(internodeDistanceKm) {
    const distanceSpec = LINK_SETTINGS.find((spec) => spec.id === "internodeDistanceKm");
    const shareOfRange = (internodeDistanceKm - distanceSpec.min) / (distanceSpec.max - distanceSpec.min);
    return MIN_LINK_WIDTH_FRACTION + shareOfRange * (1 - MIN_LINK_WIDTH_FRACTION);
}


/**
 * How bright a photon is when it reaches the BSM: the share of its light the fiber lets through
 * (computePhotonTransmission), which the page shows as the photon fading on its way.
 *
 * @param {Object<string, number>} settings
 * @returns {number} a fraction in (0, 1].
 */
export function computeArrivalBrightness(settings) {
    return computePhotonTransmission(toLinkPhysics(settings));
}


/**
 * How worn the detectors look for this efficiency: "new", "chipped" or "damaged", like a Minecraft anvil.
 *
 * @param {number} efficiencyPercent
 * @returns {"new" | "chipped" | "damaged"}
 */
export function findDetectorWear(efficiencyPercent) {
    if (efficiencyPercent >= LIKE_NEW_FROM_PERCENT) {
        return "new";
    }
    if (efficiencyPercent >= CHIPPED_FROM_PERCENT) {
        return "chipped";
    }
    return "damaged";
}


/**
 * A setting's value as the panel shows it, with as many decimals as its step has.
 *
 * @param {{step: number, unit: string}} spec
 * @param {number} value
 * @returns {string} e.g. "0.20 dB/km".
 */
export function formatSettingValue(spec, value) {
    const stepText = String(spec.step);
    const decimalCount = stepText.includes(".") ? stepText.split(".")[1].length : 0;
    return `${value.toFixed(decimalCount)}${spec.unit}`;
}
