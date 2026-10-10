/**
 * Level 4's rules, pure: the four rounds and their steps in the paper's order (Fig. 4 on one pair, then phase 3 on two
 * Steane blocks; docs/qre_cec_protocol.md), the one-pair circuit to draw, and what Toad says after each step. No DOM,
 * so node tests can call it; teleported_cnot_main.js plays the level.
 *
 * Every bit and reading comes from the backend (POST /api/teleported-cnot); this file only puts it into words. The
 * circuit: CNOT d_A → c_A, measure c_A in Z (m, sent to Luigi); CNOT c_B → d_B, measure c_B in X (n, sent to Mario);
 * X^m on d_B, Z^n on d_A. The data end up as CNOT|α⟩|β⟩ = |α⟩|β ⊕ α⟩.
 */

import { readSyndromePosition } from "../steane_block/steane_block_plan.js";

export const CLASSICAL_ROUND = "classical";
export const BELL_ROUND = "bell";
export const BLOCK_ROUND = "block";
export const BAD_BLOCK_ROUND = "bad-block";
export const ROUND_KINDS = [CLASSICAL_ROUND, BELL_ROUND, BLOCK_ROUND, BAD_BLOCK_ROUND];

// One-pair steps. "choose" is where the player picks the fixes (Enter applies them); "done" waits for Space to move on.
const PAIR_STEPS = ["pair", "cnotA", "measureA", "sendM", "cnotB", "measureB", "sendN", "choose", "done"];
const BLOCK_STEPS = ["encode", "pairs", "mario", "sendM", "luigi", "sendN", "marioFix", "check", "done"];
const BAD_BLOCK_STEPS = [
    "encode", "pairs", "turtle", "mario", "sendM", "luigi", "sendN", "marioFix", "check", "syndrome", "luigiFix",
    "recheck", "done",
];
const STEPS_BY_ROUND = {
    [CLASSICAL_ROUND]: PAIR_STEPS, [BELL_ROUND]: PAIR_STEPS, [BLOCK_ROUND]: BLOCK_STEPS,
    [BAD_BLOCK_ROUND]: BAD_BLOCK_STEPS,
};

// How many of the one-pair circuit's columns have happened once each step is done (see buildPairCircuit).
const PAIR_COLUMNS_DONE_AFTER_STEP = {
    pair: 0, cnotA: 1, measureA: 2, sendM: 2, cnotB: 3, measureB: 4, sendN: 4, choose: 6, done: 6,
};

// The fixes as the backend names them: "x" = X on Luigi's d_B, "z" = Z on Mario's d_A.
export const FIX_NAMES = { none: [false, false], x: [true, false], z: [false, true], xz: [true, true] };

const SPACE_ACTIONS = {
    pair: "Bell pair", cnotA: "Mario: CNOT", measureA: "Mario: measure", sendM: "Send m", cnotB: "Luigi: CNOT",
    measureB: "Luigi: measure", sendN: "Send n", choose: "Apply fixes", encode: "Encode blocks",
    pairs: "7 Bell pairs", turtle: "Turtle!", mario: "Mario: 7 CNOTs", luigi: "Luigi: 7 CNOTs",
    marioFix: "Mario: Z fixes", check: "Check the pair", syndrome: "Luigi's checks", luigiFix: "Luigi: fix it",
    recheck: "Check again",
};


/**
 * The steps of a round, in order.
 *
 * @param {string} roundKind - one of ROUND_KINDS.
 * @returns {string[]}
 */
export function listRoundSteps(roundKind) {
    return STEPS_BY_ROUND[roundKind];
}


/**
 * Is this a one-pair round (rounds 1 and 2)?
 *
 * @param {string} roundKind
 * @returns {boolean}
 */
export function isPairRound(roundKind) {
    return roundKind === CLASSICAL_ROUND || roundKind === BELL_ROUND;
}


/**
 * The backend's name for a choice of fixes.
 *
 * @param {boolean} hasLuigiX - X on Luigi's d_B.
 * @param {boolean} hasMarioZ - Z on Mario's d_A.
 * @returns {"none" | "x" | "z" | "xz"}
 */
export function nameFixChoice(hasLuigiX, hasMarioZ) {
    for (const [fixName, [appliesX, appliesZ]] of Object.entries(FIX_NAMES)) {
        if (appliesX === hasLuigiX && appliesZ === hasMarioZ) {
            return fixName;
        }
    }
    throw new Error("unreachable: every pair of booleans names a fix");
}


/**
 * The one-pair circuit (paper Fig. 4) with d_A, c_A, c_B, d_B, the measured bits written after each measurement, and
 * the fix boxes the player chose (both shown faded before they choose).
 *
 * @param {{roundKind: string, stepIndex: number, m: number | null, n: number | null, hasLuigiX: boolean,
 *     hasMarioZ: boolean}} pairView - stepIndex is the next step to play; m and n are null until measured.
 * @returns {{circuit: {wires: object[], columns: object[][]}, doneColumnCount: number,
 *     endNotes: Object<string, string>}}
 */
export function buildPairCircuit(pairView) {
    const marioStart = pairView.roundKind === CLASSICAL_ROUND ? "|1⟩" : "|+⟩";
    const wires = [
        { id: "dA", label: "dA", start: marioStart },
        { id: "cA", label: "cA", start: "Φ⁺" },
        { id: "cB", label: "cB", start: "Φ⁺" },
        { id: "dB", label: "dB", start: "|0⟩" },
    ];
    const steps = PAIR_STEPS;
    const isChoosing = steps[pairView.stepIndex] === "choose";
    const hasChosen = pairView.stepIndex > steps.indexOf("choose");
    const columns = [
        [{ gate: "cnot", control: "dA", target: "cA" }],
        [{ gate: "measure", wire: "cA", basis: "Z" }],
        [{ gate: "cnot", control: "cB", target: "dB" }],
        [{ gate: "measure", wire: "cB", basis: "X" }],
    ];
    const showsBothFixes = !isChoosing && !hasChosen;
    if (showsBothFixes || pairView.hasLuigiX) {
        columns.push([{ gate: "x", wire: "dB" }]);
    }
    if (showsBothFixes || pairView.hasMarioZ) {
        columns.push([{ gate: "z", wire: "dA" }]);
    }
    const endNotes = {};
    if (pairView.m !== null) {
        endNotes.cA = `m=${pairView.m}`;
    }
    if (pairView.n !== null) {
        endNotes.cB = `n=${pairView.n}`;
    }
    const playedStep = steps[Math.max(pairView.stepIndex - 1, 0)];
    let doneColumnCount = pairView.stepIndex === 0 ? 0 : PAIR_COLUMNS_DONE_AFTER_STEP[playedStep];
    if (isChoosing) {
        doneColumnCount = columns.length;
    }
    return { circuit: { wires, columns }, doneColumnCount, endNotes };
}


/**
 * What Toad says when a round starts.
 *
 * @param {string} roundKind
 * @returns {string}
 */
export function describeRoundIntro(roundKind) {
    const intros = {
        [CLASSICAL_ROUND]: "Round 1, one Bell pair (paper Fig. 4). Mario's data dA is |1⟩, Luigi's dB is |0⟩. A CNOT"
            + " from dA to dB must flip dB to 1, though the two are far apart.",
        [BELL_ROUND]: "Round 2: now Mario's dA is |+⟩. A CNOT from |+⟩ onto |0⟩ makes a Bell pair. Make one across the"
            + " fiber!",
        [BLOCK_ROUND]: "Round 3, the paper's way: Mario and Luigi each hold a Steane block, and 7 Bell pairs join them."
            + " Do the same move on all 7 pairs at once: transversal.",
        [BAD_BLOCK_ROUND]: "Round 4: the same again, but a cloud turtle is about. Watch what one bad Bell pair can do.",
    };
    return intros[roundKind];
}


/**
 * What Toad says after a one-pair step (not "choose": see judgePairFix).
 *
 * @param {string} stepId
 * @param {{m: number, n: number}} pairRound - from the response.
 * @returns {string}
 */
export function describePairStep(stepId, pairRound) {
    const messages = {
        pair: () => "A Bell pair Φ⁺ links Mario's half cA and Luigi's half cB (Level 1 made these).",
        cnotA: () => "Mario CNOTs his data dA onto his half cA.",
        measureA: () => `Mario measures cA in Z: m = ${pairRound.m}.`,
        sendM: () => `m = ${pairRound.m} flies to Luigi: an ordinary bit, nothing quantum.`,
        cnotB: () => "Luigi CNOTs his half cB onto his data dB.",
        measureB: () => `Luigi measures cB in X: n = ${pairRound.n}.`,
        sendN: () => `n = ${pairRound.n} flies back to Mario. Your turn: choose the fixes with the X and Z keys,`
            + " then press Enter.",
    };
    return messages[stepId]();
}


/**
 * Judge the player's fixes from the backend's reading for them. Round 1 reads both qubits in Z and must give 1, 1;
 * round 2 measures the ZZ and XX parities and must give +1, +1 (bits 0, 0).
 *
 * @param {string} roundKind - CLASSICAL_ROUND or BELL_ROUND.
 * @param {{m: number, n: number, readings: Object<string, Object<string, number>>}} pairRound
 * @param {boolean} hasLuigiX
 * @param {boolean} hasMarioZ
 * @returns {{isRight: boolean, message: string}}
 */
export function judgePairFix(roundKind, pairRound, hasLuigiX, hasMarioZ) {
    const reading = pairRound.readings[nameFixChoice(hasLuigiX, hasMarioZ)];
    if (roundKind === CLASSICAL_ROUND) {
        return judgeClassicalReading(reading, pairRound, hasMarioZ);
    }
    return judgeBellReading(reading, pairRound);
}


/**
 * Round 1: Luigi must read 1. A phase (Z) fix can't show on 0 or 1, so a wrong Z choice passes here, and Toad says so.
 */
function judgeClassicalReading(reading, pairRound, hasMarioZ) {
    const readText = `Mario reads ${reading.mario_bit}, Luigi reads ${reading.luigi_bit}.`;
    const isRight = reading.mario_bit === 1 && reading.luigi_bit === 1;
    if (!isRight) {
        const xAdvice = pairRound.m === 1 ? "m was 1, so Luigi needs X." : "m was 0, so Luigi must not flip.";
        return { isRight, message: `${readText} A CNOT from 1 must turn Luigi's 0 into 1. ${xAdvice} Try again.` };
    }
    const isZChoiceWrong = hasMarioZ !== (pairRound.n === 1);
    const zNote = isZChoiceWrong
        ? ` Your Z choice was off (n was ${pairRound.n}), but on 0 or 1 a phase flip is invisible. Round 2 shows why`
            + " it matters."
        : "";
    return { isRight, message: `${readText} Luigi's qubit flipped: a CNOT, carried by one Bell pair!${zNote}` };
}


/**
 * Round 2: both parities must read +1. ZZ = -1 points at Luigi's X fix, XX = -1 at Mario's Z fix.
 */
function judgeBellReading(reading, pairRound) {
    const zzText = reading.zz_bit === 0 ? "+1" : "-1";
    const xxText = reading.xx_bit === 0 ? "+1" : "-1";
    const readText = `ZZ = ${zzText}, XX = ${xxText}.`;
    const isRight = reading.zz_bit === 0 && reading.xx_bit === 0;
    if (isRight) {
        const bellText = "That is the Bell pair Φ⁺: a CNOT from |+⟩ onto |0⟩, across the fiber!";
        return { isRight, message: `${readText} ${bellText}` };
    }
    const advice = [];
    if (reading.zz_bit === 1) {
        advice.push(`ZZ = -1 means their bits disagree: Luigi's X fix (m was ${pairRound.m}).`);
    }
    if (reading.xx_bit === 1) {
        advice.push(`XX = -1 means a phase is wrong: Mario's Z fix (n was ${pairRound.n}).`);
    }
    return { isRight, message: `${readText} ${advice.join(" ")} Try again.` };
}


/**
 * The positions (1-7) where a bit string has a 1, written out, e.g. "q2, q5" or "none".
 *
 * @param {number[]} bits
 * @returns {string}
 */
export function listSetPositions(bits) {
    const positions = [];
    for (let i = 0; i < bits.length; i++) {
        if (bits[i] === 1) {
            positions.push(`q${i + 1}`);
        }
    }
    return positions.length === 0 ? "none" : positions.join(", ");
}


/**
 * The logical parities in words: +1 or -1 each.
 *
 * @param {number} zzBit - 0 means +1.
 * @param {number} xxBit
 * @returns {string}
 */
export function describeLogicalParities(zzBit, xxBit) {
    const zzText = zzBit === 0 ? "+1" : "-1";
    const xxText = xxBit === 0 ? "+1" : "-1";
    return `logical ZZ = ${zzText}, logical XX = ${xxText}`;
}


/**
 * What Toad says after a block step.
 *
 * @param {string} stepId
 * @param {object} blockRound - one of the response's block_rounds.
 * @returns {string}
 */
export function describeBlockStep(stepId, blockRound) {
    const mText = blockRound.m_bits.join("");
    const nText = blockRound.n_bits.join("");
    const syndromePosition = readSyndromePosition(blockRound.luigi_z_syndrome);
    const messages = {
        encode: () => "Mario encodes logical |+⟩ and Luigi logical |0⟩, as in Level 3, each kept by its ancilla check.",
        pairs: () => "7 Bell pairs arrive, one for each qubit position.",
        turtle: () => `The turtle flips Bell pair ${blockRound.bad_pair}: it is now Ψ⁺ instead of Φ⁺.`,
        mario: () => `Mario does CNOT d → c on all 7 pairs and measures his halves in Z: m = ${mText}.`,
        sendM: () => `m = ${mText} flies to Luigi.`,
        luigi: () => `Luigi does CNOT c → d on all 7, flips X where m is 1 (${listSetPositions(blockRound.m_bits)}),`
            + ` and measures his halves in X: n = ${nText}.`,
        sendN: () => `n = ${nText} flies back to Mario.`,
        marioFix: () => `Mario flips Z where n is 1 (${listSetPositions(blockRound.n_bits)}).`,
        check: () => describeBlockCheck(blockRound),
        syndrome: () => `Luigi measures his 3 Z checks: ${blockRound.luigi_z_syndrome.join("")} is ${syndromePosition}`
            + ` in binary. His qubit ${syndromePosition} took the hit, and only that one.`,
        luigiFix: () => `Luigi flips his qubit ${syndromePosition} back with X.`,
        recheck: () => {
            const parities = describeLogicalParities(blockRound.fixed_zz_bit, blockRound.fixed_xx_bit);
            return `Toad checks again: ${parities}. Steane fixed it: that is why the paper encodes before linking.`;
        },
    };
    return messages[stepId]();
}


/**
 * The first check after the transversal teleported CNOT: a logical Bell pair, or (with the turtle) a broken one.
 */
function describeBlockCheck(blockRound) {
    const parityText = describeLogicalParities(blockRound.raw_zz_bit, blockRound.raw_xx_bit);
    const isLogicalBellPair = blockRound.raw_zz_bit === 0 && blockRound.raw_xx_bit === 0;
    if (isLogicalBellPair) {
        return `Toad checks: ${parityText}. A logical Bell pair, Φ̄⁺, between two Steane blocks!`;
    }
    return `Toad checks: ${parityText}. Broken! But a transversal CNOT keeps one bad pair to one bad qubit.`;
}


/**
 * The keys that do something now, for the key-hint line.
 *
 * @param {{stepId: string, isLastRound: boolean}} view
 * @returns {{key: string, action: string}[]}
 */
export function listKeyHints(view) {
    const restartHint = { key: "R", action: "Start over" };
    if (view.stepId === "choose") {
        return [
            { key: "X", action: "X on Luigi's dB" }, { key: "Z", action: "Z on Mario's dA" },
            { key: "Enter", action: "Apply fixes" }, restartHint,
        ];
    }
    if (view.stepId === "done") {
        return [{ key: "Space", action: view.isLastRound ? "Finish" : "Next round" }, restartHint];
    }
    return [{ key: "Space", action: SPACE_ACTIONS[view.stepId] }, restartHint];
}
