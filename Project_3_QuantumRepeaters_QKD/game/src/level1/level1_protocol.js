/**
 * Level 1 as pure state updates: Mario and Luigi each send a photon to the BSM in the middle; each attempt that clicks
 * heralds one Bell pair Ψ⁺, stored in the next free memory slot of both towers (3 slots). A stored pair decoheres a
 * memory lifetime after it was made. Mario can use the oldest pair to teleport a 1-qubit signal (|0⟩ or |1⟩) to
 * Luigi. The round has two goals: fill all 3 slots at once, and teleport both a |0⟩ and a |1⟩.
 *
 * The chance that an attempt clicks comes from the link settings (computeHeraldProbability); the channel is otherwise
 * noiseless. Times are game milliseconds (the page's clock, which stops while the game is paused). Reads and writes
 * nothing; each function returns a new state.
 */

// Each tower stores this many halves of Bell pairs; filling every slot at once is the round's first goal.
export const MEMORY_SLOT_COUNT = 3;
export const PAIRS_TO_CLEAR = MEMORY_SLOT_COUNT;
// Default memory lifetime: how long a stored pair survives before its memory qubits decohere.
export const PAIR_LIFETIME_MS = 10_000;
// Converts dB of loss to a power ratio: 10^(-dB/10).
const DECIBELS_PER_DECADE = 10;

// The BSM's two detectors; a successful attempt clicks one of them, at random.
export const PLUS_DETECTOR = "D+";
export const MINUS_DETECTOR = "D-";

// Which tower's memory qubit gives out first when a pair decoheres.
export const MARIO_SIDE = "mario";
export const LUIGI_SIDE = "luigi";


/**
 * A fresh level: empty memories, nothing sent.
 *
 * Each slot holds null or a pair {pairNumber, createdAtMs, decoheringSide}.
 *
 * @returns {{attemptCount: number, lastAttemptSucceeded: boolean | null, clickedDetector: string | null,
 *            slots: (object | null)[], nextPairNumber: number, teleport: object | null, decoherenceCount: number,
 *            hasFilledMemory: boolean, teleportedBits: number[]}}
 */
export function createLevel1State() {
    return {
        attemptCount: 0,
        lastAttemptSucceeded: null,
        clickedDetector: null,
        slots: new Array(MEMORY_SLOT_COUNT).fill(null),
        nextPairNumber: 1,
        teleport: null,
        decoherenceCount: 0,
        hasFilledMemory: false,
        teleportedBits: [],
    };
}


/**
 * The chance that one attempt heralds a pair: both photons must cross half the link to the BSM and be detected.
 *
 * Each photon arrives with transmission 10^(−α·(L/2)/10) and is caught with the detector efficiency η, so the chance
 * is (η · 10^(−α·L/20))². With η = 90 %, α = 0.2 dB/km and L = 20 km that is about 32 %.
 *
 * @param {{detectorEfficiency: number, attenuationDbPerKm: number, internodeDistanceKm: number}} link
 *     detectorEfficiency in [0, 1].
 * @returns {number} a probability in [0, 1].
 */
export function computeHeraldProbability(link) {
    const lossPerPhotonDb = link.attenuationDbPerKm * (link.internodeDistanceKm / 2);
    const transmission = 10 ** (-lossPerPhotonDb / DECIBELS_PER_DECADE);
    const photonArrives = link.detectorEfficiency * transmission;
    return photonArrives * photonArrives;
}


/**
 * One heralding attempt. On success one of the BSM's detectors clicks (D+ or D-, equally likely) and a new Ψ⁺ pair
 * goes into the first free slot. The first goal is met (for good) once PAIRS_TO_CLEAR pairs are stored at once.
 *
 * @param {object} state - from createLevel1State or an earlier update.
 * @param {number} nowMs - the game clock when the photons arrive.
 * @param {() => number} nextRandomFloat - uniform draws in [0, 1).
 * @param {number} heraldProbability - from computeHeraldProbability.
 * @returns {object} the new state.
 */
export function sendPhotons(state, nowMs, nextRandomFloat, heraldProbability) {
    const freeSlot = state.slots.indexOf(null);
    if (freeSlot === -1) {
        throw new Error("every memory slot holds a pair; use or lose one first");
    }
    const attemptCount = state.attemptCount + 1;
    const isSuccess = nextRandomFloat() < heraldProbability;
    if (!isSuccess) {
        return { ...state, attemptCount, lastAttemptSucceeded: false, clickedDetector: null };
    }
    const clickedDetector = drawFromPair(nextRandomFloat, PLUS_DETECTOR, MINUS_DETECTOR);
    const pair = {
        pairNumber: state.nextPairNumber,
        createdAtMs: nowMs,
        decoheringSide: drawFromPair(nextRandomFloat, MARIO_SIDE, LUIGI_SIDE),
    };
    const slots = [...state.slots];
    slots[freeSlot] = pair;
    const storedPairCount = slots.filter((slotPair) => slotPair !== null).length;
    return {
        ...state, attemptCount, lastAttemptSucceeded: true, clickedDetector, slots,
        nextPairNumber: state.nextPairNumber + 1,
        hasFilledMemory: state.hasFilledMemory || storedPairCount >= PAIRS_TO_CLEAR,
    };
}


/**
 * Teleport one qubit from Mario to Luigi, using up the oldest stored pair.
 *
 * Mario's Bell measurement gives two random classical bits; he sends them to Luigi, who applies X and Z corrections
 * and ends up with exactly the qubit Mario sent.
 *
 * @param {object} state - must hold at least one pair.
 * @param {number} sentBit - 0 for |0⟩, 1 for |1⟩.
 * @param {() => number} nextRandomFloat - uniform draws in [0, 1).
 * @returns {object} the new state, with the pair's slot freed and the teleport recorded.
 */
export function teleportQubit(state, sentBit, nextRandomFloat) {
    const slotIndex = findOldestSlot(state);
    if (slotIndex === -1) {
        throw new Error("there is no Bell pair yet; send photons first");
    }
    if (sentBit !== 0 && sentBit !== 1) {
        throw new Error(`a qubit signal is |0⟩ or |1⟩, got ${sentBit}`);
    }
    const zCorrectionBit = drawFromPair(nextRandomFloat, 0, 1);
    const xCorrectionBit = drawFromPair(nextRandomFloat, 0, 1);
    const slots = [...state.slots];
    slots[slotIndex] = null;
    const teleport = { sentBit, receivedBit: sentBit, zCorrectionBit, xCorrectionBit, slotIndex };
    const isNewBit = !state.teleportedBits.includes(sentBit);
    const teleportedBits = isNewBit ? [...state.teleportedBits, sentBit] : state.teleportedBits;
    return { ...state, lastAttemptSucceeded: null, clickedDetector: null, slots, teleport, teleportedBits };
}


/**
 * Lose every pair that has lived a memory lifetime or longer.
 *
 * @param {object} state
 * @param {number} nowMs - the game clock.
 * @param {number} lifetimeMs - how long a stored pair lasts.
 * @returns {{state: object, decohered: {slotIndex: number, side: string}[]}} the new state, and which slots just
 *     lost their pair and on whose side the decoherence happened.
 */
export function decohereExpiredPairs(state, nowMs, lifetimeMs) {
    const slots = [...state.slots];
    const decohered = [];
    for (let i = 0; i < slots.length; i++) {
        const pair = slots[i];
        if (pair !== null && nowMs - pair.createdAtMs >= lifetimeMs) {
            decohered.push({ slotIndex: i, side: pair.decoheringSide });
            slots[i] = null;
        }
    }
    const decoherenceCount = state.decoherenceCount + decohered.length;
    return { state: { ...state, slots, decoherenceCount }, decohered };
}


/**
 * Both goals met: all 3 slots were full at once, and both a |0⟩ and a |1⟩ have been teleported.
 *
 * @param {object} state
 * @returns {boolean}
 */
export function isRoundCleared(state) {
    return state.hasFilledMemory && state.teleportedBits.includes(0) && state.teleportedBits.includes(1);
}


/**
 * How many Bell pairs are stored right now.
 *
 * @param {object} state
 * @returns {number}
 */
export function countPairs(state) {
    return state.slots.filter((pair) => pair !== null).length;
}


/**
 * How much of a pair's life is left, from 1 (just made) down to 0 (decohering now).
 *
 * @param {{createdAtMs: number}} pair
 * @param {number} nowMs - the game clock.
 * @param {number} lifetimeMs - how long a stored pair lasts.
 * @returns {number}
 */
export function findLifeLeft(pair, nowMs, lifetimeMs) {
    const lifeLeft = 1 - (nowMs - pair.createdAtMs) / lifetimeMs;
    return Math.min(1, Math.max(0, lifeLeft));
}


/**
 * The slot holding the oldest pair, or -1 if there is none.
 */
function findOldestSlot(state) {
    let oldestSlot = -1;
    for (let i = 0; i < state.slots.length; i++) {
        const pair = state.slots[i];
        if (pair === null) {
            continue;
        }
        const isOlder = oldestSlot === -1 || pair.createdAtMs < state.slots[oldestSlot].createdAtMs;
        if (isOlder) {
            oldestSlot = i;
        }
    }
    return oldestSlot;
}


/**
 * One of two outcomes, equally likely.
 */
function drawFromPair(nextRandomFloat, firstOutcome, secondOutcome) {
    return nextRandomFloat() < 0.5 ? firstOutcome : secondOutcome;
}
