/**
 * Level 1 as pure state updates: Mario and Luigi each send a photon to the BSM in the middle. A try ends one of three
 * ways: no click (a photon was lost), one click (it heralds one Bell pair Ψ⁺), or two clicks (both atoms emitted, so
 * it links nothing). A heralded pair is stored in the next free memory slot of both towers (3 slots). A stored pair decoheres a
 * memory lifetime after it was made. The round's goal: fill all 3 slots at once, before any pair decoheres.
 *
 * The chance that an attempt clicks comes from the link settings (computeHeraldProbability); the channel is otherwise
 * noiseless. Times are game milliseconds (the page's clock, which stops while the game is paused). Reads and writes
 * nothing; each function returns a new state.
 */

// Each tower stores this many halves of Bell pairs; filling every slot at once is the round's goal.
export const MEMORY_SLOT_COUNT = 3;
export const PAIRS_TO_CLEAR = MEMORY_SLOT_COUNT;
// Default memory lifetime: how long a stored pair survives before its memory qubits decohere.
export const PAIR_LIFETIME_MS = 10_000;
// Converts dB of loss to a power ratio: 10^(-dB/10).
const DECIBELS_PER_DECADE = 10;

// The BSM's two detectors; a successful attempt clicks one of them, at random.
export const PLUS_DETECTOR = "D+";
export const MINUS_DETECTOR = "D-";

// Both atoms emit in about a quarter of tries; when both of those photons also arrive, each detector clicks. So two
// clicks come TWO_CLICK_SHARE times as often as one click, taken out of the tries that would otherwise not click.
export const TWO_CLICK_SHARE = 0.25;

// How a try ends.
export const NO_CLICK = "no-click";
export const ONE_CLICK = "one-click";
export const TWO_CLICKS = "two-clicks";

// Which tower's memory qubit gives out first when a pair decoheres.
export const MARIO_SIDE = "mario";
export const LUIGI_SIDE = "luigi";


/**
 * A fresh level: empty memories, nothing sent.
 *
 * Each slot holds null or a pair {pairNumber, createdAtMs, decoheringSide}.
 *
 * @returns {{attemptCount: number, lastAttemptSucceeded: boolean | null, clickedDetector: string | null,
 *            hadTwoClicks: boolean, slots: (object | null)[], nextPairNumber: number, decoherenceCount: number,
 *            hasFilledMemory: boolean}}
 */
export function createLevel1State() {
    return {
        attemptCount: 0,
        lastAttemptSucceeded: null,
        clickedDetector: null,
        hadTwoClicks: false,
        slots: new Array(MEMORY_SLOT_COUNT).fill(null),
        nextPairNumber: 1,
        decoherenceCount: 0,
        hasFilledMemory: false,
    };
}


/**
 * How much of a photon's light survives the fiber from its tower to the BSM, half the link: 10^(−α·(L/2)/10).
 *
 * @param {{attenuationDbPerKm: number, internodeDistanceKm: number}} link
 * @returns {number} a fraction in (0, 1].
 */
export function computePhotonTransmission(link) {
    const lossPerPhotonDb = link.attenuationDbPerKm * (link.internodeDistanceKm / 2);
    return 10 ** (-lossPerPhotonDb / DECIBELS_PER_DECADE);
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
    const photonArrives = link.detectorEfficiency * computePhotonTransmission(link);
    return photonArrives * photonArrives;
}


/**
 * One heralding attempt, decided by one uniform draw u: u < p is one click, p ≤ u < p + p·TWO_CLICK_SHARE is two
 * clicks, anything else no click (p is the herald probability). On one click, D+ or D- clicks (equally likely) and a
 * new Ψ⁺ pair goes into the first free slot. The goal is met (for good) once PAIRS_TO_CLEAR pairs are stored at once.
 *
 * forcedOutcome (ONE_CLICK or TWO_CLICKS) makes this try end that way whatever u is; the story uses it to show each
 * case early on a weak link. u is drawn either way, so a forced try uses the same draws as a natural one.
 *
 * @param {object} state - from createLevel1State or an earlier update.
 * @param {number} nowMs - the game clock when the photons arrive.
 * @param {() => number} nextRandomFloat - uniform draws in [0, 1).
 * @param {number} heraldProbability - from computeHeraldProbability.
 * @param {string | null} [forcedOutcome=null] - ONE_CLICK, TWO_CLICKS, or null to let u decide.
 * @returns {object} the new state.
 */
export function sendPhotons(state, nowMs, nextRandomFloat, heraldProbability, forcedOutcome = null) {
    const freeSlot = state.slots.indexOf(null);
    if (freeSlot === -1) {
        throw new Error("every memory slot holds a pair; wait for one to decohere first");
    }
    const attemptCount = state.attemptCount + 1;
    const outcomeDraw = nextRandomFloat();
    const outcome = forcedOutcome ?? classifyOutcome(outcomeDraw, heraldProbability);
    if (outcome === TWO_CLICKS) {
        return { ...state, attemptCount, lastAttemptSucceeded: false, clickedDetector: null, hadTwoClicks: true };
    }
    if (outcome === NO_CLICK) {
        return { ...state, attemptCount, lastAttemptSucceeded: false, clickedDetector: null, hadTwoClicks: false };
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
        ...state, attemptCount, lastAttemptSucceeded: true, clickedDetector, hadTwoClicks: false, slots,
        nextPairNumber: state.nextPairNumber + 1,
        hasFilledMemory: state.hasFilledMemory || storedPairCount >= PAIRS_TO_CLEAR,
    };
}


/**
 * How a try ends for the draw u: one click below p, two clicks from p up to p·(1 + TWO_CLICK_SHARE), else no click.
 */
function classifyOutcome(outcomeDraw, heraldProbability) {
    if (outcomeDraw < heraldProbability) {
        return ONE_CLICK;
    }
    const twoClickLimit = heraldProbability * (1 + TWO_CLICK_SHARE);
    if (outcomeDraw < twoClickLimit) {
        return TWO_CLICKS;
    }
    return NO_CLICK;
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
 * The goal is met: all 3 slots were full at once.
 *
 * @param {object} state
 * @returns {boolean}
 */
export function isRoundCleared(state) {
    return state.hasFilledMemory;
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
 * One of two outcomes, equally likely.
 */
function drawFromPair(nextRandomFloat, firstOutcome, secondOutcome) {
    return nextRandomFloat() < 0.5 ? firstOutcome : secondOutcome;
}
