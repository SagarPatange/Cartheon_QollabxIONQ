/**
 * The lessons Level 1 pauses for. The level opens like a story: first the memories, then (after the player's first
 * Space) the photons the atoms emit. Each detector outcome gets a lesson the first time it happens: no click, one
 * click (followed by a tour of the link settings) and two clicks. The first
 * decoherence gets a lesson too. Every text is kept as short as it can be.
 *
 * Pure functions and data with no DOM, so they can be tested in node; render_level1.js and level1_main.js show them.
 */

import { MARIO_SIDE, MINUS_DETECTOR } from "./level1_protocol.js";

export const MEMORY_LESSON = "memory";
export const EMISSION_LESSON = "emission";
export const NO_CLICK_LESSON = "no-click";
export const CLICK_LESSON = "click";
export const TWO_CLICK_LESSON = "two-clicks";
export const DECOHERENCE_LESSON = "decoherence";
const MS_PER_SECOND = 1000;

// What the sky asks for whenever Space would zap the atoms (from the end of the memory lesson on).
export const FIRST_SEND_PROMPT = "Press Space: zap both atoms!";

// The settings tour after the first Bell pair: one tip per setting (settingId matches LINK_SETTINGS in
// level1_settings.js), then a last tip with no setting.
export const SETTINGS_TOUR = [
    { settingId: "detectorEfficiencyPercent", text: "How often a detector catches a photon." },
    { settingId: "attenuationDbPerKm", text: "How fast photons fade in the fiber." },
    { settingId: "internodeDistanceKm", text: "Longer fiber: more lost photons, slower tries." },
    { settingId: "memoryLifetimeSeconds", text: "How long an atom keeps its qubit." },
    { settingId: null, text: "Change these anytime with Esc." },
];


/**
 * The story's first stop: what the towers' memory slots are.
 *
 * @returns {string}
 */
export function describeMemoryLesson() {
    return "Each tower has 3 memory slots. Each holds one qubit: a Rydberg atom.";
}


/**
 * The story's second stop, frozen just after the player's first Space: each atom has sent out a photon.
 *
 * @returns {string}
 */
export function describeEmissionLesson() {
    return "ZAP! Each atom emits a photon and is now entangled with it. The two atoms are not linked yet.";
}


/**
 * What no click means: a photon was lost on the way.
 *
 * @returns {string}
 */
export function describeNoClickLesson() {
    return "No click: a photon was lost in the fiber. No pair this time, so try again.";
}


/**
 * What one detector click means.
 *
 * @param {string} detector - "D+" or "D-".
 * @returns {string}
 */
export function describeClickLesson(detector) {
    const detectorLabel = detector === MINUS_DETECTOR ? "D−" : "D+";
    return `ONE CLICK at ${detectorLabel}! Nobody can tell whose photon it was, so the atoms are linked: Bell pair Ψ+!`;
}


/**
 * What two clicks mean: both atoms emitted.
 *
 * @returns {string}
 */
export function describeTwoClickLesson() {
    return "TWO CLICKS! Both atoms emitted, one photon in each detector. That links nothing: a miss.";
}


/**
 * What decoherence means, for the tower where it happened.
 *
 * @param {string} side - MARIO_SIDE or LUIGI_SIDE.
 * @param {number} lifetimeMs - the memory lifetime the pair ran out of.
 * @returns {string}
 */
export function describeDecoherenceLesson(side, lifetimeMs) {
    const ownerName = side === MARIO_SIDE ? "Mario" : "Luigi";
    const lifetimeSeconds = Math.round(lifetimeMs / MS_PER_SECOND);
    return `Decoherence! After ${lifetimeSeconds} s, ${ownerName}'s atom lost its qubit. That pair is gone.`;
}
