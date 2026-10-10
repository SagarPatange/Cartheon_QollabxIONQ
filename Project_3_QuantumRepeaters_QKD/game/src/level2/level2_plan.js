/**
 * Level 2's playback plan: turn one /api/logical-pair response into the steps Space walks through, and label them.
 *
 * Pure functions with no DOM, so they can be tested in node; src/level2/level2_main.js plays the steps.
 */

export const HERALD_STEP = "herald";
export const ENCODE_STEP = "encode";
export const TELEPORT_STEP = "teleport";
export const CHECK_STEP = "check";

export const PAIRS_PER_BLOCK = 7;

// How long each part of one Barrett–Kok attempt shows on screen. The attempt that heralds a pair plays slowly enough
// to follow (photons fly, a lamp lights, the qubits flip, round two); the failed tries before it play as a quick
// burst, so the TRIES counter visibly climbs without making the player sit through every lost photon.
const HERALDING_ATTEMPT_TIMING = { photonFlightMs: 120, lampHoldMs: 120, flipMs: 80 };
const FAILED_ATTEMPT_TIMING = { photonFlightMs: 50, lampHoldMs: 40, flipMs: 30 };
// With reduced motion no photons fly and failed tries only count up (no lamp flicker); the heralding attempt still
// lights its lamps long enough to read.
const REDUCED_MOTION_HERALDING_TIMING = { photonFlightMs: 0, lampHoldMs: 300, flipMs: 0 };
const REDUCED_MOTION_FAILED_TIMING = { photonFlightMs: 0, lampHoldMs: 0, flipMs: 0 };
// Pause after each pair lands in both racks, so the pairs are seen arriving one by one.
export const PAIR_LANDED_PAUSE_MS = 120;


/**
 * The steps in protocol order: heralding all 7 physical pairs (one Space press plays them one after another), then
 * encoding, the teleported CNOT and the final check.
 *
 * @param {object} response - LogicalPairResponse JSON.
 * @returns {{kind: string, pairAttempts?: object[][]}[]}
 */
export function buildPlaybackSteps(response) {
    if (response.herald_attempts.length !== PAIRS_PER_BLOCK) {
        throw new Error(`expected ${PAIRS_PER_BLOCK} heralded pairs, got ${response.herald_attempts.length}`);
    }
    const steps = [];
    steps.push({ kind: HERALD_STEP, pairAttempts: response.herald_attempts });
    steps.push({ kind: ENCODE_STEP });
    steps.push({ kind: TELEPORT_STEP });
    steps.push({ kind: CHECK_STEP });
    return steps;
}


/**
 * What the Space key does next (shown in the key hints).
 *
 * @param {{kind: string}} step
 * @returns {string}
 */
export function describeStepAction(step) {
    const labels = {
        [HERALD_STEP]: () => `Herald ${PAIRS_PER_BLOCK} pairs`,
        [ENCODE_STEP]: () => "Encode blocks",
        [TELEPORT_STEP]: () => "Teleported CNOT",
        [CHECK_STEP]: () => "Check the pair",
    };
    const makeLabel = labels[step.kind];
    if (makeLabel === undefined) {
        throw new Error(`unknown step kind ${step.kind}`);
    }
    return makeLabel();
}


/**
 * How long to show each part of one attempt: the attempt that heralds its pair (the last one) plays at a readable
 * pace, the failed tries before it as a quick burst.
 *
 * @param {boolean} isHeraldingAttempt - whether this is the pair's last (successful) attempt.
 * @param {boolean} prefersReducedMotion - the player asked for reduced motion.
 * @returns {{photonFlightMs: number, lampHoldMs: number, flipMs: number}}
 */
export function chooseAttemptTiming(isHeraldingAttempt, prefersReducedMotion) {
    if (prefersReducedMotion) {
        return isHeraldingAttempt ? REDUCED_MOTION_HERALDING_TIMING : REDUCED_MOTION_FAILED_TIMING;
    }
    return isHeraldingAttempt ? HERALDING_ATTEMPT_TIMING : FAILED_ATTEMPT_TIMING;
}


/**
 * The positions (0-based) whose bit is 1: the qubits a correction acts on.
 *
 * @param {number[]} bits
 * @returns {number[]}
 */
export function listSetPositions(bits) {
    const positions = [];
    for (let i = 0; i < bits.length; i++) {
        if (bits[i] === 1) {
            positions.push(i);
        }
    }
    return positions;
}


/**
 * Did this Barrett–Kok attempt click in both rounds?
 *
 * @param {{round_one_detector: string | null, round_two_detector: string | null}} attempt
 * @returns {boolean}
 */
export function isHeraldSuccess(attempt) {
    return attempt.round_one_detector !== null && attempt.round_two_detector !== null;
}


/**
 * The Bell pair a successful attempt heralded, before the local fix turns it into Φ⁺.
 *
 * @param {{round_one_detector: string, round_two_detector: string}} attempt
 * @returns {string} "Ψ⁺" (same detector twice) or "Ψ⁻" (different detectors).
 */
export function describeHeraldedState(attempt) {
    return attempt.round_one_detector === attempt.round_two_detector ? "Ψ⁺" : "Ψ⁻";
}


/**
 * The final check: what each tower shows and whether the two agree. In the X basis a 0 reads "+" and a 1 "−".
 *
 * @param {{check_basis: string, alice_check: {logical_bit: number}, bob_check: {logical_bit: number}}} response
 * @returns {{aliceLabel: string, bobLabel: string, isMatch: boolean}}
 */
export function describeCheckResult(response) {
    const labelsByBasis = { Z: ["0", "1"], X: ["+", "−"] };
    const labels = labelsByBasis[response.check_basis];
    if (labels === undefined) {
        throw new Error(`unknown check basis ${response.check_basis}`);
    }
    const aliceBit = response.alice_check.logical_bit;
    const bobBit = response.bob_check.logical_bit;
    return { aliceLabel: labels[aliceBit], bobLabel: labels[bobBit], isMatch: aliceBit === bobBit };
}
