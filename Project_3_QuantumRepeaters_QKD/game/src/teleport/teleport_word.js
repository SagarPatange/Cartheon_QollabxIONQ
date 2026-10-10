/**
 * Stage 2-2's letter code: each letter is 5 bits (A = 00000 … Z = 11001), so Luigi's word "HI" takes 10 teleports.
 * Turns the word into the states to teleport and assembles what Luigi reads back into letters.
 *
 * Pure functions and data with no DOM, so they can be tested in node.
 */

export const CHALLENGE_WORD = "HI";
// 5 bits count 0 to 31, enough for the 26 letters.
export const BITS_PER_LETTER = 5;
const LETTER_COUNT = 26;
const FIRST_LETTER_CODE = "A".charCodeAt(0);
const BINARY = 2;
// A 5-bit code past Z (26 to 31) is no letter.
export const UNKNOWN_LETTER = "?";
// A letter still on its way.
export const PENDING_LETTER = "_";


/**
 * A letter's 5-bit code: "A" → "00000", "H" → "00111", "Z" → "11001".
 *
 * @param {string} letter - one capital letter A to Z.
 * @returns {string}
 */
export function encodeLetter(letter) {
    const letterIndex = letter.charCodeAt(0) - FIRST_LETTER_CODE;
    const isCapitalLetter = letter.length === 1 && letterIndex >= 0 && letterIndex < LETTER_COUNT;
    if (!isCapitalLetter) {
        throw new Error(`only one capital letter A to Z can be encoded, got "${letter}"`);
    }
    return letterIndex.toString(BINARY).padStart(BITS_PER_LETTER, "0");
}


/**
 * A 5-bit code back to its letter: "01000" → "I". Codes past Z give UNKNOWN_LETTER.
 *
 * @param {string} bits - exactly 5 characters, each "0" or "1".
 * @returns {string}
 */
export function decodeLetter(bits) {
    const isFiveBits = bits.length === BITS_PER_LETTER && /^[01]+$/.test(bits);
    if (!isFiveBits) {
        throw new Error(`a letter is ${BITS_PER_LETTER} bits of 0 and 1, got "${bits}"`);
    }
    const letterIndex = Number.parseInt(bits, BINARY);
    if (letterIndex >= LETTER_COUNT) {
        return UNKNOWN_LETTER;
    }
    return String.fromCharCode(FIRST_LETTER_CODE + letterIndex);
}


/**
 * The states Mario teleports for a word, one "0" or "1" per bit: "HI" → 10 states.
 *
 * @param {string} word
 * @returns {string[]}
 */
export function encodeWord(word) {
    const states = [];
    for (const letter of word) {
        for (const bit of encodeLetter(letter)) {
            states.push(bit);
        }
    }
    return states;
}


/**
 * What Luigi has so far: the letters of every complete 5-bit group, and the bits of the letter still arriving.
 *
 * @param {string[]} bitsRead - Luigi's readings in order, each "0" or "1".
 * @returns {{letters: string, pendingBits: string}}
 */
export function assembleWord(bitsRead) {
    let letters = "";
    const completeLetterCount = Math.floor(bitsRead.length / BITS_PER_LETTER);
    for (let i = 0; i < completeLetterCount; i++) {
        const start = i * BITS_PER_LETTER;
        letters += decodeLetter(bitsRead.slice(start, start + BITS_PER_LETTER).join(""));
    }
    const pendingBits = bitsRead.slice(completeLetterCount * BITS_PER_LETTER).join("");
    return { letters, pendingBits };
}


/**
 * Luigi's word as the HUD shows it, a PENDING_LETTER for each letter not complete yet: "H_".
 *
 * @param {string[]} bitsRead
 * @param {string} targetWord - sets how many letters there are.
 * @returns {string}
 */
export function formatWordProgress(bitsRead, targetWord) {
    const { letters } = assembleWord(bitsRead);
    return letters.padEnd(targetWord.length, PENDING_LETTER);
}


/**
 * Has Luigi read every bit of the word?
 *
 * @param {string[]} bitsRead
 * @param {string} targetWord
 * @returns {boolean}
 */
export function isWordComplete(bitsRead, targetWord) {
    return bitsRead.length === targetWord.length * BITS_PER_LETTER;
}


/**
 * The level is cleared only when Luigi has read exactly the target word.
 *
 * @param {string[]} bitsRead
 * @param {string} targetWord
 * @returns {boolean}
 */
export function isWordCleared(bitsRead, targetWord) {
    if (!isWordComplete(bitsRead, targetWord)) {
        return false;
    }
    return assembleWord(bitsRead).letters === targetWord;
}
