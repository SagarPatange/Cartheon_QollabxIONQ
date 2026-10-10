/**
 * Tests for src/level1/level1_protocol.js: heralding pairs into memory slots, decoherence, and the round's goal.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    LUIGI_SIDE, MARIO_SIDE, MEMORY_SLOT_COUNT, MINUS_DETECTOR, PAIRS_TO_CLEAR, PAIR_LIFETIME_MS, PLUS_DETECTOR,
    computeHeraldProbability, countPairs, createLevel1State, decohereExpiredPairs, findLifeLeft, isRoundCleared,
    sendPhotons,
} from "../../src/level1/level1_protocol.js";

const HERALD_PROBABILITY = 0.3;
const ALWAYS_SUCCEED = () => 0;
const ALWAYS_FAIL = () => HERALD_PROBABILITY;
const LIFETIME_MS = PAIR_LIFETIME_MS;


/**
 * A state holding pairs made at the given game times.
 */
function stateWithPairsAt(creationTimesMs) {
    let state = createLevel1State();
    for (const createdAtMs of creationTimesMs) {
        state = sendPhotons(state, createdAtMs, ALWAYS_SUCCEED, HERALD_PROBABILITY);
    }
    return state;
}


test("a lost photon stores nothing and counts the attempt", () => {
    const state = sendPhotons(createLevel1State(), 0, ALWAYS_FAIL, HERALD_PROBABILITY);
    assert.equal(state.attemptCount, 1);
    assert.equal(state.lastAttemptSucceeded, false);
    assert.equal(state.clickedDetector, null);
    assert.equal(countPairs(state), 0);
});


test("each click stores a new pair in the next free slot, until all 3 are full", () => {
    const state = stateWithPairsAt([0, 100, 200]);
    assert.equal(countPairs(state), MEMORY_SLOT_COUNT);
    assert.deepEqual(state.slots.map((pair) => pair.pairNumber), [1, 2, 3]);
    assert.throws(() => sendPhotons(state, 500, ALWAYS_SUCCEED, HERALD_PROBABILITY), /every memory slot/);
});


test("a click lights D+ or D- and picks which side will decohere, each at random", () => {
    const plusDraws = [0, 0.2, 0.2];
    const minusDraws = [0, 0.7, 0.7];
    const plusState = sendPhotons(createLevel1State(), 0, () => plusDraws.shift(), HERALD_PROBABILITY);
    const minusState = sendPhotons(createLevel1State(), 0, () => minusDraws.shift(), HERALD_PROBABILITY);
    assert.equal(plusState.clickedDetector, PLUS_DETECTOR);
    assert.equal(plusState.slots[0].decoheringSide, MARIO_SIDE);
    assert.equal(minusState.clickedDetector, MINUS_DETECTOR);
    assert.equal(minusState.slots[0].decoheringSide, LUIGI_SIDE);
});


test("pairs decohere once they are PAIR_LIFETIME_MS old, freeing their slot", () => {
    const state = stateWithPairsAt([0, 4000]);
    const early = decohereExpiredPairs(state, PAIR_LIFETIME_MS - 1, LIFETIME_MS);
    assert.deepEqual(early.decohered, []);
    const late = decohereExpiredPairs(state, PAIR_LIFETIME_MS, LIFETIME_MS);
    assert.deepEqual(late.decohered, [{ slotIndex: 0, side: state.slots[0].decoheringSide }]);
    assert.equal(countPairs(late.state), 1);
    assert.equal(late.state.decoherenceCount, 1);
});


test("life left runs from 1 down to 0 over the pair's lifetime", () => {
    const pair = { createdAtMs: 1000 };
    assert.equal(findLifeLeft(pair, 1000, LIFETIME_MS), 1);
    assert.equal(findLifeLeft(pair, 1000 + PAIR_LIFETIME_MS / 2, LIFETIME_MS), 0.5);
    assert.equal(findLifeLeft(pair, 1000 + 2 * PAIR_LIFETIME_MS, LIFETIME_MS), 0);
});


test("filling all 3 slots at once meets the goal, and it stays met", () => {
    assert.equal(stateWithPairsAt([0, 100]).hasFilledMemory, false);
    const filled = stateWithPairsAt([0, 100, 200]);
    assert.equal(PAIRS_TO_CLEAR, 3);
    assert.equal(filled.hasFilledMemory, true);
    assert.equal(decohereExpiredPairs(filled, 2 * PAIR_LIFETIME_MS, LIFETIME_MS).state.hasFilledMemory, true);
});


test("the round clears once all 3 slots are full at once", () => {
    assert.equal(isRoundCleared(stateWithPairsAt([0, 100])), false);
    assert.equal(isRoundCleared(stateWithPairsAt([0, 100, 200])), true);
});


test("3 pairs made too slowly never sit together, so they do not clear the round", () => {
    let state = stateWithPairsAt([0, 4000]);
    state = decohereExpiredPairs(state, PAIR_LIFETIME_MS, LIFETIME_MS).state;
    state = sendPhotons(state, PAIR_LIFETIME_MS, ALWAYS_SUCCEED, HERALD_PROBABILITY);
    assert.equal(countPairs(state), 2);
    assert.equal(state.hasFilledMemory, false);
});


test("the herald chance is (η · 10^(−α·L/20))², about 32 % with the default link", () => {
    const defaultLink = { detectorEfficiency: 0.9, attenuationDbPerKm: 0.2, internodeDistanceKm: 20 };
    assert.ok(Math.abs(computeHeraldProbability(defaultLink) - 0.3226) < 0.001);
    const perfectLink = { detectorEfficiency: 1, attenuationDbPerKm: 0.2, internodeDistanceKm: 0 };
    assert.equal(computeHeraldProbability(perfectLink), 1);
    const longerLink = { ...defaultLink, internodeDistanceKm: 40 };
    const worseDetectors = { ...defaultLink, detectorEfficiency: 0.5 };
    assert.ok(computeHeraldProbability(longerLink) < computeHeraldProbability(defaultLink));
    assert.ok(computeHeraldProbability(worseDetectors) < computeHeraldProbability(defaultLink));
});


test("a longer memory lifetime keeps pairs alive longer", () => {
    const state = stateWithPairsAt([0]);
    assert.deepEqual(decohereExpiredPairs(state, 12_000, 20_000).decohered, []);
    assert.equal(decohereExpiredPairs(state, 12_000, 10_000).decohered.length, 1);
});
