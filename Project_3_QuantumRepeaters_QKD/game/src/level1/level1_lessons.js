/**
 * The lessons Level 1 pauses for, the first time each thing happens: a detector click, and a pair decohering.
 *
 * Pure functions with no DOM, so they can be tested in node; render_level1.js shows the text in a note.
 */

import { MARIO_SIDE, MINUS_DETECTOR } from "./level1_protocol.js";

export const CLICK_LESSON = "click";
export const DECOHERENCE_LESSON = "decoherence";
const MS_PER_SECOND = 1000;


/**
 * What a detector click means.
 *
 * @param {string} detector - "D+" or "D-".
 * @returns {string}
 */
export function describeClickLesson(detector) {
    const detectorLabel = detector === MINUS_DETECTOR ? "D−" : "D+";
    return (
        `CLICK! Detector ${detectorLabel} caught one photon. The beam splitter mixed both fibers, so nobody can ` +
        "tell if it came from Mario or Luigi. Not knowing links their qubits: a Bell pair Ψ+!"
    );
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
    return (
        `Decoherence! After ${lifetimeSeconds} s, ${ownerName}'s qubit leaked its quantum state into its ` +
        "surroundings. That Bell pair is gone: use pairs fast!"
    );
}
