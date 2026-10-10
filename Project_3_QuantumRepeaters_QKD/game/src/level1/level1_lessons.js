/**
 * The lessons Level 1 pauses for. The level opens like a story: first the memories, then (after the player's first
 * Space) the photons the atoms emit. The first detector click is followed by a tour of the link settings; the first
 * decoherence gets a lesson too. Every text is kept as short as it can be.
 *
 * Pure functions and data with no DOM, so they can be tested in node; render_level1.js and level1_main.js show them.
 */

import { MARIO_SIDE, MINUS_DETECTOR } from "./level1_protocol.js";

export const MEMORY_LESSON = "memory";
export const EMISSION_LESSON = "emission";
export const CLICK_LESSON = "click";
export const DECOHERENCE_LESSON = "decoherence";
const MS_PER_SECOND = 1000;

// What the sky banner asks for once the memory lesson is done: the player's first move.
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
 * What a detector click means.
 *
 * @param {string} detector - "D+" or "D-".
 * @returns {string}
 */
export function describeClickLesson(detector) {
    const detectorLabel = detector === MINUS_DETECTOR ? "D−" : "D+";
    return `CLICK at ${detectorLabel}! Nobody can tell whose photon it was, so the atoms are linked: a Bell pair Ψ+!`;
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
