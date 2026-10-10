/**
 * A small seeded random number generator, so a run can be replayed exactly from its seed.
 *
 * Reads and writes nothing; every draw comes from the generator returned by createSeededRandom.
 */

// Constants of the mulberry32 generator (Tommy Ettinger, public domain); changing them changes every run.
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_SHIFT_C = 14;
const MULBERRY_ODD_MIXER = 61;
const TWO_TO_THE_32 = 4294967296;


/**
 * Make a generator that returns floats in [0, 1).
 *
 * @param {number} seed - any integer; the same seed gives the same sequence.
 * @returns {() => number} a function that returns the next random float.
 */
export function createSeededRandom(seed) {
    if (!Number.isInteger(seed)) {
        throw new Error(`seed must be an integer, got ${seed}`);
    }
    let generatorState = seed >>> 0;

    return function nextRandomFloat() {
        generatorState = (generatorState + MULBERRY_INCREMENT) >>> 0;
        let mixed = generatorState;
        mixed = Math.imul(mixed ^ (mixed >>> MULBERRY_SHIFT_A), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> MULBERRY_SHIFT_B), mixed | MULBERRY_ODD_MIXER);
        const unsignedResult = (mixed ^ (mixed >>> MULBERRY_SHIFT_C)) >>> 0;
        return unsignedResult / TWO_TO_THE_32;
    };
}


/**
 * Draw true with the given probability.
 *
 * @param {() => number} nextRandomFloat - a generator from createSeededRandom.
 * @param {number} probability - chance of true, between 0 and 1.
 * @returns {boolean}
 */
export function drawWithProbability(nextRandomFloat, probability) {
    return nextRandomFloat() < probability;
}


/**
 * Pick one item from a list, each equally likely.
 *
 * @param {() => number} nextRandomFloat - a generator from createSeededRandom.
 * @param {Array} items - a non-empty list.
 * @returns the chosen item.
 */
export function pickOne(nextRandomFloat, items) {
    if (items.length === 0) {
        throw new Error("pickOne needs at least one item");
    }
    const chosenIndex = Math.floor(nextRandomFloat() * items.length);
    return items[chosenIndex];
}
