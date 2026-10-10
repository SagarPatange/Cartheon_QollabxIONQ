/**
 * Level 3's rules, pure: the build rounds (one per Hadamard qubit, in steane.py's order q4, q2, q1), the encoder
 * circuit to draw, what to say after each CNOT, how to read a syndrome, and which keys do what in each phase. No DOM,
 * so node tests can call it; steane_block_main.js plays the level.
 *
 * Every quantum result (what a check reads, the syndromes, whether a fix worked) comes from the backend
 * (POST /api/steane-block and /api/steane-errors); this file only puts it into words.
 */

import { listSteaneCheckPositions } from "../hut/qec_codes.js";

// steane.py's ENCODER_HADAMARD_POSITIONS: H on these qubits before any CNOT puts each in |+⟩.
export const HADAMARD_POSITIONS = [1, 2, 4];
export const QUBIT_POSITIONS = [1, 2, 3, 4, 5, 6, 7];
export const FIX_PAULIS = ["X", "Z", "Y"];
export const CHECK_COUNT_PER_TYPE = 3;
// The textbook encoder built here uses 9 CNOTs; the paper's (Fig. 3, Paetznick–Reichardt) makes the same block with
// 8 (backend test: test_the_papers_8_cnot_encoder_makes_the_same_block).
export const TEXTBOOK_CNOT_COUNT = 9;
export const PAPER_CNOT_COUNT = 8;
// The paper's one-ancilla check on a fresh |0̄⟩ measures the parity Z1 Z6 Z7 (ZIIIIZZ; Goto 2016, as in steane.py).
export const VERIFICATION_POSITIONS = [1, 6, 7];
export const ANCILLA_WIRE_ID = "anc";
// Room for the H column, 9 CNOTs, the cursor's ghost CNOT and the ancilla check (3 CNOTs and a measurement).
export const CIRCUIT_MIN_COLUMN_COUNT = 15;

export const HADAMARD_PHASE = "hadamard";
export const BUILD_PHASE = "build";
export const ROUND_DONE_PHASE = "round-done";
export const VERIFY_PHASE = "verify";
export const VERIFIED_PHASE = "verified";
export const ZAP_PHASE = "zap";
export const MEASURE_PHASE = "measure";
export const PICK_PHASE = "pick";
export const FIXED_PHASE = "fixed";
export const CLEAR_PHASE = "clear";

const PAULI_EFFECTS = { X: "a bit flip", Z: "a phase flip", Y: "a bit flip and a phase flip at once" };


/**
 * The three build rounds: each Hadamard qubit spreads along its own check, the row of the parity-check matrix that
 * starts at it (4567 from q4, 2367 from q2, 1357 from q1).
 *
 * @returns {{checkIndex: number, control: number, checkPositions: number[]}[]}
 */
export function listBuildRounds() {
    const rounds = [];
    const checkPositions = listSteaneCheckPositions();
    for (let i = 0; i < checkPositions.length; i++) {
        rounds.push({ checkIndex: i, control: checkPositions[i][0], checkPositions: checkPositions[i] });
    }
    return rounds;
}


/**
 * The qubits a CNOT from this control can target: every other qubit.
 *
 * @param {number} control - 1-7.
 * @returns {number[]}
 */
export function listTargetChoices(control) {
    return QUBIT_POSITIONS.filter((position) => position !== control);
}


/**
 * Move a cursor one step through a list of choices, wrapping round at either end.
 *
 * @param {Array} choices
 * @param {*} current - one of the choices.
 * @param {number} step - +1 or -1.
 * @returns {*} the choice after (or before) current.
 */
export function moveThroughChoices(choices, current, step) {
    const currentIndex = Math.max(choices.indexOf(current), 0);
    const nextIndex = (currentIndex + step + choices.length) % choices.length;
    return choices[nextIndex];
}


/**
 * The check's name as the circles show it, e.g. "4567".
 *
 * @param {number[]} checkPositions
 * @returns {string}
 */
export function nameCheck(checkPositions) {
    return checkPositions.join("");
}


/**
 * The round's first wrong CNOT, by the round's rule: from its qubit onto each other qubit of its circle, once each.
 * A rule, not a reading: CNOT q2 → q1 is wrong though q1 is |+⟩ and the CNOT changes nothing the checks can see.
 *
 * @param {number} roundIndex - 0, 1 or 2.
 * @param {number[]} roundTargets - the targets of this round's CNOTs, in the order placed.
 * @returns {{index: number, message: string} | null} index into roundTargets, or null when every CNOT is right.
 */
export function findWrongCnot(roundIndex, roundTargets) {
    const round = listBuildRounds()[roundIndex];
    const checkName = nameCheck(round.checkPositions);
    const rightTargets = round.checkPositions.filter((position) => position !== round.control);
    for (let i = 0; i < roundTargets.length; i++) {
        const target = roundTargets[i];
        if (!rightTargets.includes(target)) {
            const rightText = listQubitNames(rightTargets);
            const message = `Wrong circle: q${target} is not in circle ${checkName}. q${round.control} spreads only to`
                + ` ${rightText}. Backspace undoes it.`;
            return { index: i, message };
        }
        if (roundTargets.indexOf(target) < i) {
            const message = `Wrong: q${target} already has a CNOT from q${round.control}, and a second one cancels it.`
                + " Backspace undoes it.";
            return { index: i, message };
        }
    }
    return null;
}


/**
 * Qubit names in words: "q3, q6 and q7".
 */
function listQubitNames(positions) {
    const names = positions.map((position) => `q${position}`);
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}


/**
 * What the build round's checks say after the backend's latest answer. A wrong CNOT comes first: the round stays
 * open until it is undone, whatever the checks read.
 *
 * @param {{x_checks: number[]}} report - the /api/steane-block response.
 * @param {number} roundIndex - 0, 1 or 2.
 * @param {number[]} roundTargets - the targets of this round's CNOTs so far, in the order placed.
 * @returns {{isComplete: boolean, isWrong: boolean, wrongTargetIndex: number | null, brokenCheckIndices: number[],
 *     message: string}}
 */
export function judgeBuildRound(report, roundIndex, roundTargets) {
    const rounds = listBuildRounds();
    const round = rounds[roundIndex];
    const wrongCnot = findWrongCnot(roundIndex, roundTargets);
    if (wrongCnot !== null) {
        return {
            isComplete: false, isWrong: true, wrongTargetIndex: wrongCnot.index, brokenCheckIndices: [],
            message: wrongCnot.message,
        };
    }
    const rightJudgement = { isWrong: false, wrongTargetIndex: null };
    const brokenCheckIndices = [];
    for (let i = 0; i < roundIndex; i++) {
        if (report.x_checks[i] !== 1) {
            brokenCheckIndices.push(i);
        }
    }
    const isRoundCheckLit = report.x_checks[roundIndex] === 1;
    const isComplete = isRoundCheckLit && brokenCheckIndices.length === 0;
    const checkName = nameCheck(round.checkPositions);
    if (brokenCheckIndices.length > 0) {
        const brokenNames = brokenCheckIndices.map((i) => nameCheck(rounds[i].checkPositions)).join(" and ");
        const message = `That broke circle ${brokenNames}. Backspace undoes it.`;
        return { ...rightJudgement, isComplete, brokenCheckIndices, message };
    }
    if (isComplete) {
        const message = `Circle ${checkName} holds: X${checkName} now reads +1!`;
        return { ...rightJudgement, isComplete, brokenCheckIndices, message };
    }
    const message = `Circle ${checkName} still reads ? (random). q${round.control} must reach every other qubit in it.`;
    return { ...rightJudgement, isComplete, brokenCheckIndices, message };
}


/**
 * What to say once all three circles hold: the block is |0̄⟩ only if the Z checks and Z̄ hold too.
 *
 * @param {{is_encoded: boolean}} report
 * @returns {string}
 */
export function describeBuiltBlock(report) {
    if (!report.is_encoded) {
        return "The X circles hold, but a Z check doesn't. An extra CNOT broke it: Backspace undoes.";
    }
    const checkText = VERIFICATION_POSITIONS.map((position) => `Z${position}`).join(" ");
    return `All 6 checks and logical Z read +1: the block is logical |0⟩! The paper checks it with one ancilla:`
        + ` ${checkText}.`;
}


/**
 * What the ancilla check says.
 *
 * @param {number} verificationBit - 0 keeps the block, 1 throws it away.
 * @returns {string}
 */
export function describeVerification(verificationBit) {
    if (verificationBit === 0) {
        return `Ancilla reads 0: keep the block! (The paper's encoder makes the same block with ${PAPER_CNOT_COUNT}`
            + ` CNOTs instead of ${TEXTBOOK_CNOT_COUNT}.)`;
    }
    return "Ancilla reads 1: the block is bad. Throw it away and build again.";
}


/**
 * The circuit to draw: q1-q7 from |0⟩, the H column, the player's CNOTs (a wrong one in red), the cursor's ghost
 * CNOT, and the ancilla check once it has run.
 *
 * @param {{hasHadamards: boolean, cnots: number[][], ghost: {control: number, target: number} | null,
 *     hasVerification: boolean, wrongCnotIndex?: number | null}} buildState - wrongCnotIndex indexes cnots.
 * @returns {{wires: object[], columns: object[][]}}
 */
export function buildEncoderCircuit(buildState) {
    const wires = [];
    for (const position of QUBIT_POSITIONS) {
        wires.push({ id: findWireId(position), label: findWireId(position), start: "|0⟩" });
    }
    const columns = [];
    if (buildState.hasHadamards) {
        columns.push(HADAMARD_POSITIONS.map((position) => ({ gate: "h", wire: findWireId(position) })));
    }
    for (let i = 0; i < buildState.cnots.length; i++) {
        const [control, target] = buildState.cnots[i];
        const cnot = { gate: "cnot", control: findWireId(control), target: findWireId(target) };
        columns.push([i === buildState.wrongCnotIndex ? { ...cnot, look: "wrong" } : cnot]);
    }
    if (buildState.ghost !== null) {
        const ghost = buildState.ghost;
        const ghostCnot = { gate: "cnot", control: findWireId(ghost.control), target: findWireId(ghost.target) };
        columns.push([{ ...ghostCnot, look: "ghost" }]);
    }
    if (buildState.hasVerification) {
        wires.push({ id: ANCILLA_WIRE_ID, label: ANCILLA_WIRE_ID, start: "|0⟩" });
        for (const position of VERIFICATION_POSITIONS) {
            columns.push([{ gate: "cnot", control: findWireId(position), target: ANCILLA_WIRE_ID }]);
        }
        columns.push([{ gate: "measure", wire: ANCILLA_WIRE_ID, basis: "Z" }]);
    }
    return { wires, columns };
}


/**
 * A data qubit's wire id: position 4 is "q4".
 *
 * @param {number} position
 * @returns {string}
 */
export function findWireId(position) {
    return `q${position}`;
}


/**
 * A syndrome read as a binary number, most significant bit first: the flipped qubit's position, 0 for none
 * (steane.py's decoder rule; the rows of the parity-check matrix are the qubit positions in binary).
 *
 * @param {number[]} syndrome - three bits.
 * @returns {number}
 */
export function readSyndromePosition(syndrome) {
    let position = 0;
    for (const bit of syndrome) {
        position = position * 2 + bit;
    }
    return position;
}


/**
 * How the turtle's zap is announced: the Pauli and what it does, never which qubit.
 *
 * @param {string} pauli - "X", "Z" or "Y".
 * @returns {string}
 */
export function describeZap(pauli) {
    return `A cloud turtle zaps one qubit with ${pauli}: ${PAULI_EFFECTS[pauli]}. Which one? Ask the checks.`;
}


/**
 * How to read the measured syndromes: each row, top to bottom, as a binary number.
 *
 * @param {number[]} zSyndrome - the Z checks: they catch X flips.
 * @param {number[]} xSyndrome - the X checks: they catch Z flips.
 * @returns {string}
 */
export function describeSyndromes(zSyndrome, xSyndrome) {
    return `Z checks: ${zSyndrome.join("")}. X checks: ${xSyndrome.join("")}. Read each as a binary number: it names`
        + " the qubit. Z checks catch X flips, X checks catch Z flips.";
}


/**
 * The worked answer, shown after a wrong fix: which qubit each syndrome names, and which fix that means.
 *
 * @param {number[]} zSyndrome
 * @param {number[]} xSyndrome
 * @returns {string}
 */
export function explainSyndromes(zSyndrome, xSyndrome) {
    const zPosition = readSyndromePosition(zSyndrome);
    const xPosition = readSyndromePosition(xSyndrome);
    const zText = zSyndrome.join("");
    const xText = xSyndrome.join("");
    if (zPosition !== 0 && zPosition === xPosition) {
        return `Z ${zText} and X ${xText} are both ${zPosition}: X and Z on q${zPosition}, which is Y.`;
    }
    if (zPosition !== 0) {
        return `Z checks ${zText} is ${zPosition} in binary: an X flip on q${zPosition}.`;
    }
    return `X checks ${xText} is ${xPosition} in binary: a Z flip on q${xPosition}.`;
}


/**
 * What to say after the player's fix.
 *
 * @param {{is_fixed: boolean, z_syndrome: number[], x_syndrome: number[]}} fixResult - from the error round's fixes.
 * @param {{z_syndrome: number[], x_syndrome: number[]}} errorRound - the syndromes before the fix.
 * @returns {string}
 */
export function describeFixResult(fixResult, errorRound) {
    if (fixResult.is_fixed) {
        return "Fixed! Every check reads 0 again, and logical Z still reads +1: the block is logical |0⟩ again.";
    }
    const afterText = `Z ${fixResult.z_syndrome.join("")}, X ${fixResult.x_syndrome.join("")}`;
    const hint = explainSyndromes(errorRound.z_syndrome, errorRound.x_syndrome);
    return `Not fixed: the checks now read ${afterText}. Toad undoes it. Hint: ${hint}`;
}


/**
 * The key for a fix in the backend's fixes table: X on q6 is "X6".
 *
 * @param {string} pauli
 * @param {number} position
 * @returns {string}
 */
export function nameFix(pauli, position) {
    return `${pauli}${position}`;
}


/**
 * How many of the six checks read clean: +1 while building, a 0 syndrome bit once errors start.
 *
 * @param {number[]} values - the six readings.
 * @param {number} cleanValue - 1 for build expectations, 0 for syndrome bits.
 * @returns {number}
 */
export function countCleanChecks(values, cleanValue) {
    let cleanCount = 0;
    for (const value of values) {
        if (value === cleanValue) {
            cleanCount += 1;
        }
    }
    return cleanCount;
}


/**
 * The keys that do something now, for the key-hint line.
 *
 * @param {{phase: string, roundIndex: number, roundCnotCount: number, cursorTarget: number, errorIndex: number,
 *     errorRoundCount: number, fixPauli: string, fixPosition: number}} view
 * @returns {{key: string, action: string}[]}
 */
export function listKeyHints(view) {
    const rounds = listBuildRounds();
    const restartHint = { key: "R", action: "Start over" };
    if (view.phase === HADAMARD_PHASE) {
        return [{ key: "Space", action: "H on q1, q2, q4" }];
    }
    if (view.phase === BUILD_PHASE) {
        const control = rounds[view.roundIndex].control;
        const placeAction = `CNOT q${control} → q${view.cursorTarget}`;
        const hints = [{ key: "↑↓", action: "Pick target" }, { key: "Enter", action: placeAction }];
        if (view.roundCnotCount > 0) {
            hints.push({ key: "Bksp", action: "Undo" });
        }
        return [...hints, restartHint];
    }
    const spaceActions = {
        [ROUND_DONE_PHASE]: () => `Next: spread q${rounds[view.roundIndex + 1].control}`,
        [VERIFY_PHASE]: () => "Ancilla check",
        [VERIFIED_PHASE]: () => "Bring on the turtle",
        [ZAP_PHASE]: () => "Turtle zaps!",
        [MEASURE_PHASE]: () => "Measure the checks",
        [FIXED_PHASE]: () => (view.errorIndex + 1 < view.errorRoundCount ? "Next zap" : "Finish"),
        [CLEAR_PHASE]: () => "Back to the map",
    };
    if (view.phase === PICK_PHASE) {
        return [
            { key: "↑↓", action: "Pick qubit" }, { key: "←→", action: "Pick fix" },
            { key: "Enter", action: `${view.fixPauli} on q${view.fixPosition}` }, restartHint,
        ];
    }
    return [{ key: "Space", action: spaceActions[view.phase]() }, restartHint];
}
