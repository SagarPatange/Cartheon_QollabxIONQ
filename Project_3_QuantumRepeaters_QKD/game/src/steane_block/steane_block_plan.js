/**
 * Level 3's rules, pure: the build rounds of the Error Correction Zoo's Steane encoder
 * (errorcorrectionzoo.org/c/steane: q0 copies |ψ⟩ onto q1 and q2, then q6, q5 and q4 each spread along their
 * circle), the circuit to draw, what to say after each CNOT, how to read a syndrome, and which keys do what in each
 * phase. No DOM, so node tests can call it; steane_block_main.js plays the level.
 *
 * Every quantum result (what a check reads, the syndromes, whether a fix worked) comes from the backend
 * (POST /api/steane-block and /api/steane-errors, steane_block.py); this file only puts it into words.
 */

// Qubits q0-q6, numbered as in the Zoo's figure. q0 holds |ψ⟩ (|0⟩ here, so the block is logical |0⟩).
export const QUBIT_POSITIONS = [0, 1, 2, 3, 4, 5, 6];
export const DATA_POSITION = 0;
// H on these qubits before any CNOT puts each in |+⟩.
export const HADAMARD_POSITIONS = [4, 5, 6];
// The three circles (checks), in the order the build spreads them: q6's, q5's, q4's (steane_block.CHECK_POSITIONS).
export const CHECK_POSITIONS = [[0, 1, 3, 6], [0, 2, 3, 5], [1, 2, 3, 4]];
// The encoder's CNOTs in order (steane_block.ENCODER_CNOTS).
export const ENCODER_CNOTS = [[0, 1], [0, 2], [6, 0], [6, 1], [6, 3], [5, 0], [5, 2], [5, 3], [4, 1], [4, 2], [4, 3]];
// The paper's encoder (Fig. 3, Paetznick–Reichardt) makes |0̄⟩ alone with 8 CNOTs.
export const PAPER_CNOT_COUNT = 8;
export const FIX_PAULIS = ["X", "Z", "Y"];
export const CHECK_COUNT_PER_TYPE = 3;
// The ancilla checks logical Z = Z0 Z1 Z2 on a fresh block: 0 means |0̄⟩.
export const VERIFICATION_POSITIONS = [0, 1, 2];
export const ANCILLA_WIRE_ID = "anc";
// Room for the H column, 11 CNOTs, the cursor's ghost CNOT and the ancilla check (3 CNOTs and a measurement).
export const CIRCUIT_MIN_COLUMN_COUNT = 17;

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
 * The four build rounds: q0 copies |ψ⟩ onto q1 and q2 (no circle), then each H qubit spreads onto the other qubits
 * of its circle (q6 along 0136, q5 along 0235, q4 along 1234).
 *
 * @returns {{control: number, targets: number[], checkIndex: number | null, checkPositions: number[] | null}[]}
 */
export function listBuildRounds() {
    const rounds = [{ control: DATA_POSITION, targets: [1, 2], checkIndex: null, checkPositions: null }];
    CHECK_POSITIONS.forEach((checkPositions, checkIndex) => {
        const control = checkPositions.find((position) => HADAMARD_POSITIONS.includes(position));
        const targets = checkPositions.filter((position) => position !== control);
        rounds.push({ control, targets, checkIndex, checkPositions });
    });
    return rounds;
}


/**
 * The qubits a CNOT from this control can target: every other qubit.
 *
 * @param {number} control - 0-6.
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
 * The check's name as the circles show it, e.g. "0136".
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
    for (let i = 0; i < roundTargets.length; i++) {
        const target = roundTargets[i];
        if (!round.targets.includes(target)) {
            return { index: i, message: describeWrongTarget(round, target) };
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
 * Why a target is wrong: outside the round's circle, or not one of the qubits |ψ⟩ is copied onto.
 */
function describeWrongTarget(round, target) {
    if (round.checkPositions === null) {
        return `Wrong: q0 copies |ψ⟩ only onto q1 and q2 (logical X̄ is X0 X1 X2). Backspace undoes it.`;
    }
    return `Wrong circle: q${target} is not in circle ${nameCheck(round.checkPositions)}. q${round.control} spreads `
        + `only to ${listQubitNames(round.targets)}. Backspace undoes it.`;
}


/**
 * Qubit names in words: "q0, q2 and q3".
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
    const round = listBuildRounds()[roundIndex];
    const wrongCnot = findWrongCnot(roundIndex, roundTargets);
    if (wrongCnot !== null) {
        return {
            isComplete: false, isWrong: true, wrongTargetIndex: wrongCnot.index, brokenCheckIndices: [],
            message: wrongCnot.message,
        };
    }
    const rightJudgement = { isWrong: false, wrongTargetIndex: null };
    if (round.checkIndex === null) {
        return { ...rightJudgement, brokenCheckIndices: [], ...judgeCopyRound(roundTargets) };
    }
    const brokenCheckIndices = [];
    for (let i = 0; i < round.checkIndex; i++) {
        if (report.x_checks[i] !== 1) {
            brokenCheckIndices.push(i);
        }
    }
    const isRoundCheckLit = report.x_checks[round.checkIndex] === 1;
    const isComplete = isRoundCheckLit && brokenCheckIndices.length === 0;
    const checkName = nameCheck(round.checkPositions);
    if (brokenCheckIndices.length > 0) {
        const brokenNames = brokenCheckIndices.map((i) => nameCheck(CHECK_POSITIONS[i])).join(" and ");
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
 * The copy round, judged by its rule alone: with |ψ⟩ = |0⟩ the two CNOTs change nothing a check can read.
 */
function judgeCopyRound(roundTargets) {
    if (roundTargets.length === 2) {
        return { isComplete: true, message: "q0 has copied |ψ⟩ onto q1 and q2: logical X̄ is now X0 X1 X2. (|ψ⟩ is |0⟩ "
            + "here, so no check can see it yet.)" };
    }
    const missing = [1, 2].filter((target) => !roundTargets.includes(target));
    return { isComplete: false, message: `q0 copies |ψ⟩ onto q1 and q2: q${missing[0]} still needs its CNOT.` };
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
    return `All 6 checks and logical Z read +1: |ψ⟩ = |0⟩ is now logical |0̄⟩! One ancilla checks logical Z: `
        + `${checkText}.`;
}


/**
 * What the ancilla check says.
 *
 * @param {number} verificationBit - 0 keeps the block, 1 throws it away.
 * @returns {string}
 */
export function describeVerification(verificationBit) {
    if (verificationBit === 0) {
        return `Ancilla reads 0: keep the block! This encoder takes ${ENCODER_CNOTS.length} CNOTs because it can encode`
            + ` any |ψ⟩; the paper's makes |0̄⟩ alone with ${PAPER_CNOT_COUNT}.`;
    }
    return "Ancilla reads 1: the block is bad. Throw it away and build again.";
}


/**
 * The circuit to draw: q0 from |ψ⟩ and q1-q6 from |0⟩, the H column, the player's CNOTs (a wrong one in red), the
 * cursor's ghost CNOT, and the ancilla check once it has run.
 *
 * @param {{hasHadamards: boolean, cnots: number[][], ghost: {control: number, target: number} | null,
 *     hasVerification: boolean, wrongCnotIndex?: number | null}} buildState - wrongCnotIndex indexes cnots.
 * @returns {{wires: object[], columns: object[][]}}
 */
export function buildEncoderCircuit(buildState) {
    const wires = [];
    for (const position of QUBIT_POSITIONS) {
        const start = position === DATA_POSITION ? "|ψ⟩" : "|0⟩";
        wires.push({ id: findWireId(position), label: findWireId(position), start });
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
 * The qubit inside exactly the circles whose checks fired, or null when none fired (Level 3's layout: each qubit
 * sits in a different set of circles, so the fired circles name it).
 *
 * @param {number[]} syndrome - one bit per circle, in CHECK_POSITIONS order.
 * @returns {number | null}
 */
export function findFlippedPosition(syndrome) {
    const position = QUBIT_POSITIONS.find((candidate) =>
        CHECK_POSITIONS.every((check, index) => Number(check.includes(candidate)) === syndrome[index]));
    return position ?? null;
}


/**
 * Level 4's textbook numbering (steane.py): a syndrome read as a binary number, most significant bit first, is the
 * flipped qubit's position, 0 for none (the rows of the parity-check matrix are the positions in binary).
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
 * How to read the measured syndromes: the qubit inside exactly the circles that fired.
 *
 * @param {number[]} zSyndrome - the Z checks: they catch X flips.
 * @param {number[]} xSyndrome - the X checks: they catch Z flips.
 * @returns {string}
 */
export function describeSyndromes(zSyndrome, xSyndrome) {
    return `Z checks: ${zSyndrome.join("")}. X checks: ${xSyndrome.join("")}. A 1 means that circle fired: the hit `
        + "qubit is inside exactly the circles that fired. Z checks catch X flips, X checks catch Z flips.";
}


/**
 * The worked answer, shown after a wrong fix: which qubit each syndrome names, and which fix that means.
 *
 * @param {number[]} zSyndrome
 * @param {number[]} xSyndrome
 * @returns {string}
 */
export function explainSyndromes(zSyndrome, xSyndrome) {
    const zPosition = findFlippedPosition(zSyndrome);
    const xPosition = findFlippedPosition(xSyndrome);
    if (zPosition !== null && zPosition === xPosition) {
        return `Both checks point at q${zPosition} (${describeFiredCircles(zSyndrome)}): X and Z on q${zPosition}, `
            + "which is Y.";
    }
    if (zPosition !== null) {
        return `Z checks: ${describeFiredCircles(zSyndrome)}. Only q${zPosition} sits in exactly those: an X flip on `
            + `q${zPosition}.`;
    }
    return `X checks: ${describeFiredCircles(xSyndrome)}. Only q${xPosition} sits in exactly those: a Z flip on `
        + `q${xPosition}.`;
}


/**
 * Which circles fired, in words: "0136 and 0235 fired".
 */
function describeFiredCircles(syndrome) {
    const fired = CHECK_POSITIONS.filter((_, index) => syndrome[index] === 1).map(nameCheck);
    const firedText = fired.length > 1 ? `${fired.slice(0, -1).join(", ")} and ${fired.at(-1)}` : fired[0];
    return `${firedText} fired`;
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
 * The key for a fix in the backend's fixes table: X on q6 is "X6", Z on q0 is "Z0".
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
        return [{ key: "Space", action: `H on ${HADAMARD_POSITIONS.map((position) => `q${position}`).join(", ")}` }];
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
