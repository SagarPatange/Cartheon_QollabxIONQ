/**
 * Level 1's link settings: what the settings panel offers, their defaults, and what each one does to the game.
 *
 * Pure functions with no DOM, so they can be tested in node; src/settings_panel.js draws the sliders.
 */

// Photons and the herald signal take this long per km of link, in game time, so a longer link means slower tries.
// 35 ms per km makes the default 20 km link take 0.7 s, the photon animation's original length.
const GAME_MS_PER_KM = 35;
const MS_PER_SECOND = 1000;
const PERCENT = 100;

export const LINK_SETTINGS = [
    {
        id: "detectorEfficiencyPercent", label: "Detector efficiency", unit: "%",
        min: 50, max: 100, step: 1, defaultValue: 90,
    },
    {
        id: "attenuationDbPerKm", label: "Fiber attenuation", unit: " dB/km",
        min: 0.15, max: 0.5, step: 0.01, defaultValue: 0.2,
    },
    {
        id: "internodeDistanceKm", label: "Internode distance", unit: " km",
        min: 5, max: 60, step: 1, defaultValue: 20,
    },
    {
        id: "memoryLifetimeSeconds", label: "Memory lifetime", unit: " s",
        min: 5, max: 30, step: 1, defaultValue: 10,
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
