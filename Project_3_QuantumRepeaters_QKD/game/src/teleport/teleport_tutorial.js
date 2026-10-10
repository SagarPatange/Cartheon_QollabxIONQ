/**
 * The phases every teleport goes through, and Stage 2-1's tutorial: which lesson pauses the game at which phase of
 * which teleport, and what each lesson says. The tutorial teleports |1⟩ (the X fix matters) and then |+⟩ (the Z fix
 * matters, read in the +/− basis).
 *
 * Every number a lesson quotes (the bits, what Luigi reads) comes from the simulator's response; the texts only put
 * it into words. Pure functions and data with no DOM, so they can be tested in node; teleport_main.js shows them.
 */

import { CHALLENGE_WORD, encodeLetter } from "./teleport_word.js";
import { describeFix, findNeededFix, formatBellBits, formatKet, formatReading, isXBasisState } from "./teleport_rules.js";

// One teleport, in order: Mario waits for Space, measures, the bits ride the pipe, Luigi sets the fix, Luigi reads.
export const READY_PHASE = "ready";
export const MEASURED_PHASE = "measured";
export const SENDING_PHASE = "sending";
export const ARRIVED_PHASE = "arrived";
export const READ_PHASE = "read";
export const TELEPORT_PHASES = [READY_PHASE, MEASURED_PHASE, SENDING_PHASE, ARRIVED_PHASE, READ_PHASE];

// The tutorial's two messages: |1⟩ shows the X fix, |+⟩ the Z fix.
export const TUTORIAL_STATES = ["1", "+"];

export const PAIR_LESSON = "pair";
export const BELL_LESSON = "bell-measurement";
export const PIPE_LESSON = "pipe";
export const FIX_LESSON = "fix";
export const RESULT_LESSON = "result";
export const PLUS_LESSON = "plus";
export const PLUS_FIX_LESSON = "plus-fix";
export const TUTORIAL_DONE_LESSON = "tutorial-done";
export const CHALLENGE_LESSON = "challenge";

// Where a lesson note hangs: over Mario's tower, over the link between the towers, or over Luigi's tower.
export const MARIO_ANCHOR = "mario";
export const LINK_ANCHOR = "link";
export const LUIGI_ANCHOR = "luigi";

// The tutorial in order. The result lesson shows after every tutorial teleport, right or wrong; the others once.
export const TUTORIAL_STEPS = [
    { teleportIndex: 0, phase: READY_PHASE, lessonId: PAIR_LESSON, anchor: MARIO_ANCHOR },
    { teleportIndex: 0, phase: MEASURED_PHASE, lessonId: BELL_LESSON, anchor: MARIO_ANCHOR },
    { teleportIndex: 0, phase: SENDING_PHASE, lessonId: PIPE_LESSON, anchor: LINK_ANCHOR },
    { teleportIndex: 0, phase: ARRIVED_PHASE, lessonId: FIX_LESSON, anchor: LUIGI_ANCHOR },
    { teleportIndex: 0, phase: READ_PHASE, lessonId: RESULT_LESSON, anchor: LUIGI_ANCHOR },
    { teleportIndex: 1, phase: READY_PHASE, lessonId: PLUS_LESSON, anchor: MARIO_ANCHOR },
    { teleportIndex: 1, phase: ARRIVED_PHASE, lessonId: PLUS_FIX_LESSON, anchor: LUIGI_ANCHOR },
    { teleportIndex: 1, phase: READ_PHASE, lessonId: RESULT_LESSON, anchor: LUIGI_ANCHOR },
];


/**
 * The phase after this one; READ_PHASE is the last.
 *
 * @param {string} phase
 * @returns {string | null} the next phase, or null after READ_PHASE.
 */
export function findNextPhase(phase) {
    const phaseIndex = TELEPORT_PHASES.indexOf(phase);
    if (phaseIndex === -1) {
        throw new Error(`unknown phase ${phase}`);
    }
    return TELEPORT_PHASES[phaseIndex + 1] ?? null;
}


/**
 * The tutorial step (lesson and where it hangs) for this teleport and phase, or null when the game does not pause.
 *
 * @param {number} teleportIndex - 0 for |1⟩, 1 for |+⟩.
 * @param {string} phase
 * @returns {{teleportIndex: number, phase: string, lessonId: string, anchor: string} | null}
 */
export function findTutorialStep(teleportIndex, phase) {
    const step = TUTORIAL_STEPS.find((candidate) => {
        return candidate.teleportIndex === teleportIndex && candidate.phase === phase;
    });
    return step ?? null;
}


/**
 * Is this lesson shown every time its step comes round (not only the first time)?
 *
 * @param {string} lessonId
 * @returns {boolean}
 */
export function isRepeatedLesson(lessonId) {
    return lessonId === RESULT_LESSON;
}


/**
 * From a batch of teleports of one state, the one that shows the tutorial's point best: for 0/1 one whose bits ask
 * for X, for +/− one whose bits ask for Z. Bits are random, so this falls back to the first teleport when none does;
 * the lessons then describe whatever the bits were.
 *
 * @param {{state: string, bell_bits: {z_fix: number, x_fix: number}}[]} teleports - all of the same state.
 * @returns {object} one of the teleports.
 */
export function pickTutorialTeleport(teleports) {
    if (teleports.length === 0) {
        throw new Error("no teleports to pick from");
    }
    for (const teleport of teleports) {
        const isZShown = isXBasisState(teleport.state) && teleport.bell_bits.z_fix === 1;
        const isXShown = !isXBasisState(teleport.state) && teleport.bell_bits.x_fix === 1;
        if (isZShown || isXShown) {
            return teleport;
        }
    }
    return teleports[0];
}


/**
 * One lesson's text.
 *
 * @param {string} lessonId - one of the *_LESSON ids.
 * @param {{teleport?: object, result?: object}} context - the current teleport (from the response) and, for the
 *     result lesson, Luigi's result (from readLuigiResult).
 * @returns {string}
 */
export function describeLesson(lessonId, context) {
    const describers = {
        [PAIR_LESSON]: () => describePairLesson(context.teleport),
        [BELL_LESSON]: () => describeBellLesson(context.teleport),
        [PIPE_LESSON]: () => "The bits ride a pipe: a normal channel. Luigi can't act before they arrive, so "
            + "nothing goes faster than light.",
        [FIX_LESSON]: () => describeFixLesson(context.teleport),
        [RESULT_LESSON]: () => describeResultLesson(context.teleport, context.result),
        [PLUS_LESSON]: () => `Now the block holds ${formatKet(context.teleport.state)}. Luigi reads it in the +/− `
            + "basis, so the Z fix will matter.",
        [PLUS_FIX_LESSON]: () => describeFixLesson(context.teleport),
        [TUTORIAL_DONE_LESSON]: () => "STAGE 2-1 CLEAR! A shared pair plus two bits moved a whole qubit. Next: "
            + `send Luigi the word ${CHALLENGE_WORD}.`,
        [CHALLENGE_LESSON]: () => describeChallengeLesson(),
    };
    const describe = describers[lessonId];
    if (describe === undefined) {
        throw new Error(`unknown lesson ${lessonId}`);
    }
    return describe();
}


/**
 * The first stop: the shared Bell pairs and the qubit to teleport.
 */
function describePairLesson(teleport) {
    return "Mario and Luigi share 3 Bell pairs from Level 1 (gold, numbered). Mario's mystery block holds "
        + `${formatKet(teleport.state)}. Space: teleport it!`;
}


/**
 * After the Bell measurement: the two random bits it gave.
 */
function describeBellLesson(teleport) {
    return "Bell measurement! Mario measures his qubit together with his half of the pair. Out come 2 random "
        + `bits: ${formatBellBits(teleport.bell_bits)}.`;
}


/**
 * Once the bits are at Luigi: look them up and set the fix.
 */
function describeFixLesson(teleport) {
    return `Luigi got bits ${formatBellBits(teleport.bell_bits)}. Find them in the cheat sheet (C), set the fix `
        + "with the X and Z keys, then press Space.";
}


/**
 * What Luigi read, whether it worked, and what no fix would have given (from the same simulated run).
 */
function describeResultLesson(teleport, result) {
    const readingLabel = formatReading(result.reading);
    const neededFix = describeFix(findNeededFix(teleport.bell_bits));
    if (!result.isRightState) {
        return `Luigi reads ${readingLabel}, not ${formatReading(teleport.state)}: bits `
            + `${formatBellBits(teleport.bell_bits)} need ${neededFix}. Space: try a fresh teleport.`;
    }
    const noFixReading = teleport.luigi_reads.none;
    let fixNote = `With no fix he'd read ${formatReading(noFixReading)}.`;
    if (noFixReading === teleport.state) {
        fixNote = "This time no fix was needed to read it.";
    }
    return `Luigi reads ${readingLabel}: ${formatKet(teleport.state)} made it! ${fixNote} Mario's block is `
        + "empty: teleporting moves a qubit, never copies it.";
}


/**
 * Stage 2-2's goal: the word, its letter codes, and the keys per bit.
 */
function describeChallengeLesson() {
    const letterCodes = [];
    for (const letter of CHALLENGE_WORD) {
        letterCodes.push(`${letter} = ${encodeLetter(letter)}`);
    }
    return `STAGE 2-2: Luigi needs the word ${CHALLENGE_WORD}, 5 bits a letter: ${letterCodes.join(", ")}. `
        + "Each bit: Space, set the fix, Space.";
}
