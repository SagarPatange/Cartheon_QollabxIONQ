/**
 * Level 2's teleportation rules: which fix Luigi needs for the two bits Mario's Bell measurement gives, how the
 * player's X and Z toggles name a fix, and what Luigi reads for the fix the player chose.
 *
 * The rule (docs/superpowers/specs/2026-10-10-teleportation-level-and-bb84-hut-design.md, "Simulation"): bits are
 * written z_fix x_fix; x_fix = 1 asks for X, z_fix = 1 asks for Z, and Luigi applies X before Z. What Luigi actually
 * reads always comes from the simulator's luigi_reads for that fix; this file only picks which branch to show.
 *
 * Pure functions and data with no DOM, so they can be tested in node.
 */

export const NO_FIX = "none";
export const X_FIX = "x";
export const Z_FIX = "z";
export const ZX_FIX = "zx";

// The cheat sheet's table, in the order bits count up (z_fix x_fix = 00, 01, 10, 11).
export const FIX_RULES = [
    { zFix: 0, xFix: 0, fixKey: NO_FIX, label: "nothing" },
    { zFix: 0, xFix: 1, fixKey: X_FIX, label: "X" },
    { zFix: 1, xFix: 0, fixKey: Z_FIX, label: "Z" },
    { zFix: 1, xFix: 1, fixKey: ZX_FIX, label: "Z and X" },
];

// The four states the backend teleports. 0/1 are read in the Z basis, +/− in the X basis.
export const TELEPORT_STATES = ["0", "1", "+", "-"];
const X_BASIS_STATES = ["+", "-"];


/**
 * The fix Luigi needs for the bits Mario sent.
 *
 * @param {{z_fix: number, x_fix: number}} bellBits - from a teleport's bell_bits.
 * @returns {string} NO_FIX, X_FIX, Z_FIX or ZX_FIX.
 */
export function findNeededFix(bellBits) {
    for (const rule of FIX_RULES) {
        const isMatch = rule.zFix === bellBits.z_fix && rule.xFix === bellBits.x_fix;
        if (isMatch) {
            return rule.fixKey;
        }
    }
    throw new Error(`bell bits must be 0 or 1, got ${JSON.stringify(bellBits)}`);
}


/**
 * The fix the player's toggles ask for.
 *
 * @param {{isXOn: boolean, isZOn: boolean}} toggles
 * @returns {string} NO_FIX, X_FIX, Z_FIX or ZX_FIX.
 */
export function toFixKey(toggles) {
    for (const rule of FIX_RULES) {
        const isMatch = (rule.xFix === 1) === toggles.isXOn && (rule.zFix === 1) === toggles.isZOn;
        if (isMatch) {
            return rule.fixKey;
        }
    }
    throw new Error(`toggles must be booleans, got ${JSON.stringify(toggles)}`);
}


/**
 * A fix in words, as the cheat sheet says it: "nothing", "X", "Z" or "Z and X".
 *
 * @param {string} fixKey
 * @returns {string}
 */
export function describeFix(fixKey) {
    const rule = FIX_RULES.find((candidate) => candidate.fixKey === fixKey);
    if (rule === undefined) {
        throw new Error(`unknown fix ${fixKey}`);
    }
    return rule.label;
}


/**
 * The two bits as the player sees them, z_fix first: {z_fix: 1, x_fix: 0} → "10".
 *
 * @param {{z_fix: number, x_fix: number}} bellBits
 * @returns {string}
 */
export function formatBellBits(bellBits) {
    return `${bellBits.z_fix}${bellBits.x_fix}`;
}


/**
 * A state as a ket, for the mystery block: "1" → "|1⟩", "-" → "|−⟩".
 *
 * @param {string} state - "0", "1", "+" or "-".
 * @returns {string}
 */
export function formatKet(state) {
    return `|${formatReading(state)}⟩`;
}


/**
 * A reading as shown on screen; the minus sign gets a real minus.
 *
 * @param {string} reading - "0", "1", "+" or "-".
 * @returns {string}
 */
export function formatReading(reading) {
    if (!TELEPORT_STATES.includes(reading)) {
        throw new Error(`unknown state ${reading}`);
    }
    return reading === "-" ? "−" : reading;
}


/**
 * Is this state read in the +/− basis (where the Z fix shows)?
 *
 * @param {string} state
 * @returns {boolean}
 */
export function isXBasisState(state) {
    return X_BASIS_STATES.includes(state);
}


/**
 * What Luigi reads after the player's fix, straight from the simulator's luigi_reads, and whether it worked.
 *
 * @param {{state: string, bell_bits: object, luigi_reads: Object<string, string>}} teleport - one teleport.
 * @param {{isXOn: boolean, isZOn: boolean}} toggles - the fix the player chose.
 * @returns {{reading: string, fixKey: string, neededFixKey: string, isRightFix: boolean, isRightState: boolean}}
 */
export function readLuigiResult(teleport, toggles) {
    const fixKey = toFixKey(toggles);
    const reading = teleport.luigi_reads[fixKey];
    if (reading === undefined) {
        throw new Error(`the response has no reading for fix ${fixKey}`);
    }
    const neededFixKey = findNeededFix(teleport.bell_bits);
    return {
        reading, fixKey, neededFixKey, isRightFix: fixKey === neededFixKey, isRightState: reading === teleport.state,
    };
}


/**
 * Fail fast if a /api/teleport response does not answer the states that were asked for, in order.
 *
 * @param {{seed: number, teleports: object[]}} response
 * @param {string[]} states - the states sent in the request.
 */
export function checkTeleportResponse(response, states) {
    if (!Array.isArray(response.teleports) || response.teleports.length !== states.length) {
        throw new Error(`expected ${states.length} teleports in the response`);
    }
    for (let i = 0; i < states.length; i++) {
        const teleport = response.teleports[i];
        if (teleport.state !== states[i]) {
            throw new Error(`teleport ${i + 1} is ${teleport.state}, expected ${states[i]}`);
        }
        for (const rule of FIX_RULES) {
            if (teleport.luigi_reads[rule.fixKey] === undefined) {
                throw new Error(`teleport ${i + 1} has no reading for fix ${rule.fixKey}`);
            }
        }
        findNeededFix(teleport.bell_bits);
    }
}


// Each tower holds 3 memory slots, each with one half of a Bell pair shared with the other tower (as in Level 1).
export const PAIR_SLOT_COUNT = 3;


/**
 * The memory slot whose Bell pair a teleport uses: the slots take turns, so teleport 0 uses slot 0, teleport 3
 * slot 0 again (a used slot is refilled with a fresh pair before its next turn).
 *
 * @param {number} teleportNumber - how many teleports were started before this one (0, 1, 2, …).
 * @returns {number} a slot index from 0 to PAIR_SLOT_COUNT - 1.
 */
export function findPairSlot(teleportNumber) {
    if (!Number.isInteger(teleportNumber) || teleportNumber < 0) {
        throw new Error(`teleportNumber must be a whole number 0 or more, got ${teleportNumber}`);
    }
    return teleportNumber % PAIR_SLOT_COUNT;
}
