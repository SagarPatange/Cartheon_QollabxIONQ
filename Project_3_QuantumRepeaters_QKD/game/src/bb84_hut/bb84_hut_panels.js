/**
 * Toad's BB84 hut: what Toad says, one short panel at a time, and the small worked example the panels'
 * pictures show. Pure; bb84_hut_pictures.js draws the pictures and hut_pager.js pages through the panels.
 *
 * BB84 is the protocol of C. H. Bennett and G. Brassard, "Quantum cryptography: Public key distribution and coin
 * tossing", Proc. IEEE Int. Conf. on Computers, Systems and Signal Processing, Bangalore, 1984, pp. 175-179.
 * The award line is from ACM's announcement of March 18, 2026 (acm.org/media-center/2026/march/turing-award-2025).
 */

// Bennett & Brassard 1984: Eve guesses the basis, and is wrong half the time.
const WRONG_BASIS_CHANCE = 0.5;
// A photon read in the wrong basis gives a random bit, so Bob's bit is then wrong half the time.
const WRONG_BIT_CHANCE_AFTER_WRONG_BASIS = 0.5;
const PERCENT = 100;
// How many kept bits Alice and Bob compare in the "Catch her" picture.
export const SAMPLE_SIZE = 20;

export const BB84_SOURCE =
    "Bennett & Brassard, \"Quantum cryptography: Public key distribution and coin tossing\", 1984.";
export const AWARD_SOURCE = "ACM, \"2025 ACM A.M. Turing Award\", announced March 18, 2026.";
export const AWARD_SOURCE_URL = "https://www.acm.org/media-center/2026/march/turing-award-2025";
export const WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/BB84";

export const PLUS_BASIS = "+";
export const CROSS_BASIS = "x";
// A bit Bob reads in the wrong basis: a coin flip, so the picture shows "?".
export const RANDOM_BIT = "?";

// A worked example of eight photons for the pictures: Alice's bits and bases, Bob's bases, Eve's bases, and which
// kept bit Eve's wrong guess happened to flip. Hand-picked to show each case once; not a simulation result.
export const BB84_EXAMPLE = {
    aliceBits: [0, 1, 1, 0, 1, 0, 0, 1],
    aliceBases: ["+", "x", "+", "+", "x", "x", "+", "x"],
    bobBases: ["+", "+", "+", "x", "x", "+", "+", "x"],
    eveBases: ["+", "x", "x", "+", "x", "+", "x", "x"],
    eveFlippedPositions: [2],
};


/**
 * The share of sifted bits Alice and Bob disagree on when Eve measures every photon in a random basis and sends on
 * what she saw (intercept-resend; Bennett & Brassard 1984).
 *
 * @returns {number} a fraction between 0 and 1 (0.25).
 */
export function findInterceptResendErrorRate() {
    return WRONG_BASIS_CHANCE * WRONG_BIT_CHANCE_AFTER_WRONG_BASIS;
}


/**
 * What Bob reads: Alice's bit when he measures in her basis, otherwise a coin flip (Bennett & Brassard 1984).
 *
 * @param {number} aliceBit - 0 or 1.
 * @param {string} aliceBasis - PLUS_BASIS or CROSS_BASIS.
 * @param {string} bobBasis - PLUS_BASIS or CROSS_BASIS.
 * @returns {number | string} the bit, or RANDOM_BIT.
 */
export function predictBobBit(aliceBit, aliceBasis, bobBasis) {
    if (aliceBasis === bobBasis) {
        return aliceBit;
    }
    return RANDOM_BIT;
}


/**
 * Sifting: the positions where Alice's and Bob's bases match. Only these bits are kept.
 *
 * @param {string[]} aliceBases
 * @param {string[]} bobBases
 * @returns {number[]} positions, in order.
 */
export function listSiftedPositions(aliceBases, bobBases) {
    const keptPositions = [];
    for (let i = 0; i < aliceBases.length; i++) {
        if (aliceBases[i] === bobBases[i]) {
            keptPositions.push(i);
        }
    }
    return keptPositions;
}


/**
 * The kept positions where Eve measured in the wrong basis: the only bits her meddling can spoil.
 *
 * @param {{aliceBases: string[], bobBases: string[], eveBases: string[]}} example
 * @returns {number[]} positions, in order.
 */
export function listEveRiskPositions(example) {
    const riskPositions = [];
    for (const position of listSiftedPositions(example.aliceBases, example.bobBases)) {
        if (example.eveBases[position] !== example.aliceBases[position]) {
            riskPositions.push(position);
        }
    }
    return riskPositions;
}


/**
 * How many of a sample of kept bits come out wrong at a given error rate, rounded to whole bits.
 *
 * @param {number} sampleSize - how many kept bits are compared.
 * @param {number} errorRate - a fraction between 0 and 1.
 * @returns {number}
 */
export function countSampleErrors(sampleSize, errorRate) {
    return Math.round(sampleSize * errorRate);
}


const INTERCEPT_ERROR_PERCENT = findInterceptResendErrorRate() * PERCENT;

// Each panel: a short heading, a few short lines, and which picture goes with it (bb84_hut_pictures.js).
// | - / \ stand for the photon's polarization; plain ASCII, because the pixel font has no arrows.
export const BB84_PANELS = [
    {
        heading: "Two bases",
        picture: "bases",
        lines: [
            "A photon carries a bit two ways. + basis: | is 0, - is 1. x basis: / is 0, \\ is 1.",
            "Read it in the right basis: you get the bit. The wrong basis: a coin flip.",
        ],
    },
    {
        heading: "Random picks",
        picture: "picks",
        lines: [
            "Alice sends each bit in a random basis.",
            "Bob can't know hers, so he measures each photon in a random basis too.",
        ],
    },
    {
        heading: "Sifting",
        picture: "sifting",
        lines: [
            "Then they say their bases out loud. Never the bits!",
            "They keep only the bits where the bases matched, about half. Those match: a shared secret key.",
        ],
    },
    {
        heading: "An eavesdropper",
        picture: "eavesdropper",
        lines: [
            "Eve can't copy a photon; she has to measure it. Half the time she picks the wrong basis.",
            "Then Bob's bit is a coin flip.",
            `If she grabs every photon, about ${INTERCEPT_ERROR_PERCENT}% of the kept bits come out wrong.`,
        ],
    },
    {
        heading: "Catch her",
        picture: "sample",
        lines: [
            "So Alice and Bob compare a random sample of kept bits in public, then throw those away.",
            `Near 0% errors: the key is safe. Near ${INTERCEPT_ERROR_PERCENT}%: someone listened!`,
            "You'll need this in Level 6, to send Peach her secret message.",
        ],
    },
    {
        heading: "The inventors",
        picture: "inventors",
        lines: [
            "BB84 is named for Charles Bennett and Gilles Brassard, who published it in 1984.",
            "They won the 2025 ACM A.M. Turing Award (announced in 2026) for founding quantum information science.",
        ],
    },
];

