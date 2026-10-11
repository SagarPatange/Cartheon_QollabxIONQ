/**
 * The qubit slots in Level 6's castles, shared by the swap tutorial and the messages: the chain runs on the 3-qubit
 * repetition code, so Alice holds 6 qubits (a, b), Bob 12 (c, d and a2, b2) and Charlie 6 (c2, d2), named as in
 * QRECEC_3QubitRepetition.ipynb. Here: the registers, what a slot can look like, and the slots during a message.
 *
 * Pure data and functions with no DOM, so they can be tested in node; render_swap_tutorial.js draws them.
 */

// Must match QUBITS_PER_BLOCK in backend/src/quantum_bros/protocol/repetition_code.py.
export const QUBITS_PER_BLOCK = 3;

// The registers in each castle, in groups (one per link the castle serves), left to right. Communication qubits
// (b, c, b2, c2) stand on the side facing the fiber they share.
export const TOWER_REGISTER_GROUPS = [[["a", "b"]], [["c", "d"], ["a2", "b2"]], [["c2", "d2"]]];
// Data blocks are drawn square: each is one logical qubit of the code, not a photon's partner.
export const DATA_REGISTERS = ["a", "d", "a2", "d2"];
export const COMMUNICATION_REGISTERS = ["b", "c", "b2", "c2"];
// Each link's registers in notebook order: left data, left communication, right communication, right data.
export const LINK_REGISTERS = [["a", "b", "c", "d"], ["a2", "b2", "c2", "d2"]];

// What a slot can look like; render_swap_tutorial.js maps each to a class.
export const WAITING = "waiting";
export const IDLE = "idle";
export const PAIR = "pair";
export const PLUS = "plus";
export const ZERO = "zero";
export const BELL = "bell";
export const MEASURED = "measured";
export const USED = "used";
export const FLIPPED = "flipped";
export const FIXED = "fixed";


/**
 * Give every qubit of the registers one look and no text.
 *
 * @param {Object<string, {look: string, text: string}[]>} qubits - filled in place.
 * @param {string[]} registers
 * @param {string} look
 */
export function fillRegisters(qubits, registers, look) {
    for (const register of registers) {
        qubits[register] = [];
        for (let i = 0; i < QUBITS_PER_BLOCK; i++) {
            qubits[register].push({ look, text: "" });
        }
    }
}


/**
 * The slots during a message: a message uses hundreds of logical pairs, and the castles show what one of them goes
 * through in the phases played so far (backend/src/quantum_bros/protocol/steps.py).
 *
 * @param {Set<string>} reachedPhases - every phase played so far; empty before a message.
 * @returns {Object<string, {look: string, text: string}[]>}
 */
export function describeMessageSlots(reachedPhases) {
    const qubits = {};
    fillRegisters(qubits, [...DATA_REGISTERS, ...COMMUNICATION_REGISTERS], IDLE);
    if (reachedPhases.has("heralding")) {
        fillRegisters(qubits, COMMUNICATION_REGISTERS, PAIR);
    }
    if (reachedPhases.has("encoding")) {
        fillRegisters(qubits, ["a", "a2"], PLUS);
        fillRegisters(qubits, ["d", "d2"], ZERO);
    }
    if (reachedPhases.has("teleported_cnot")) {
        fillRegisters(qubits, COMMUNICATION_REGISTERS, USED);
        fillRegisters(qubits, DATA_REGISTERS, BELL);
    }
    if (reachedPhases.has("encoded_swapping")) {
        fillRegisters(qubits, ["d", "a2"], MEASURED);
    }
    const haveEndsMeasured = reachedPhases.has("qkd_measure") || reachedPhases.has("deliver");
    const isPairUsed = reachedPhases.has("teleported_cnot");
    if (haveEndsMeasured && isPairUsed) {
        fillRegisters(qubits, ["a", "d2"], MEASURED);
    }
    return qubits;
}
