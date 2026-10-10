/**
 * The cheat sheet's circuit follows the teleport: each step lights up as the game reaches it. Steps are the groups
 * in teleport.html's circuit (data-step): the Bell pair from Level 1, Mario's Bell measurement (CNOT and H), the two
 * meters, the classical wires, and Luigi's X and Z fixes.
 *
 * Each step is "done" (already happened), "current" (happening now or next), or "pending" (still to come); the fix
 * gates are "on" or "off" while Luigi sets them, then "applied" (it acted on his qubit) or "off" once he confirms.
 * Pure functions with no DOM, so they can be tested in node; renderCircuit draws the result.
 */

import { ARRIVED_PHASE, MEASURED_PHASE, READY_PHASE, READ_PHASE, SENDING_PHASE } from "./teleport_tutorial.js";

export const CIRCUIT_STEPS = ["pair", "bell", "measure", "send", "fixX", "fixZ"];
// The classes renderCircuit sets; a step's other classes (such as is-fix on the fix gates) are left alone.
const STEP_STATE_CLASSES = ["is-done", "is-current", "is-pending", "is-on", "is-off", "is-applied"];

/**
 * The state of every step for the teleport's phase and Luigi's fix switches.
 *
 * @param {string | null} phase - a phase from teleport_tutorial.js, or null with no teleport under way.
 * @param {{isXOn: boolean, isZOn: boolean}} toggles - Luigi's fix switches.
 * @returns {Object<string, string>} by step name.
 */
export function circuitStepStates(phase, toggles) {
    const states = { pair: "done", bell: "pending", measure: "pending", send: "pending", fixX: "pending",
        fixZ: "pending" };
    if (phase === READY_PHASE) {
        return { ...states, bell: "current", measure: "current" };
    }
    if (phase === MEASURED_PHASE) {
        return { ...states, bell: "done", measure: "current" };
    }
    if (phase === SENDING_PHASE) {
        return { ...states, bell: "done", measure: "done", send: "current" };
    }
    const afterPipe = { ...states, bell: "done", measure: "done", send: "done" };
    if (phase === ARRIVED_PHASE) {
        return { ...afterPipe, fixX: toggles.isXOn ? "on" : "off", fixZ: toggles.isZOn ? "on" : "off" };
    }
    if (phase === READ_PHASE) {
        return { ...afterPipe, fixX: toggles.isXOn ? "applied" : "off", fixZ: toggles.isZOn ? "applied" : "off" };
    }
    return states;
}

/** Whether the two bits are known yet: from Mario's measurement on. */
export function areBitsMeasured(phase) {
    return phase === MEASURED_PHASE || phase === SENDING_PHASE || phase === ARRIVED_PHASE || phase === READ_PHASE;
}

/**
 * Light the circuit's steps and write the measured bits beside their wires ("z_fix=1"), or the plain names
 * before the measurement.
 *
 * @param {SVGElement} circuitElement - teleport.html's #teleport-circuit.
 * @param {Object<string, string>} states - from circuitStepStates.
 * @param {{z_fix: number, x_fix: number} | null} bellBits - the teleport's bits, or null before the measurement.
 */
export function renderCircuit(circuitElement, states, bellBits) {
    for (const step of CIRCUIT_STEPS) {
        const stepElement = circuitElement.querySelector(`[data-step="${step}"]`);
        stepElement.classList.remove(...STEP_STATE_CLASSES);
        stepElement.classList.add(`is-${states[step]}`);
    }
    const zLabel = circuitElement.querySelector("#circuit-z-label");
    const xLabel = circuitElement.querySelector("#circuit-x-label");
    // No spaces: "x_fix=1" has to end before the z_fix wire that comes down beside it.
    zLabel.textContent = bellBits === null ? "z_fix" : `z_fix=${bellBits.z_fix}`;
    xLabel.textContent = bellBits === null ? "x_fix" : `x_fix=${bellBits.x_fix}`;
}
