/**
 * Level 2 (teleportation) page entry point. Mario teleports a qubit to Luigi using one of the 3 Bell pairs their
 * towers share (a used pair is refilled from Level 1's repeater before its next turn): Space
 * makes the Bell measurement, the two bits ride a pipe to Luigi, the player sets Luigi's fix with the X and Z keys
 * (toggles) and confirms with Space, and Luigi reads the result.
 *
 * Stage 2-1 is a tutorial: |1⟩ and then |+⟩, pausing with a lesson at each step (locked for a moment so it gets
 * read). A wrong fix gets explained and the same state is teleported again from a fresh run. The cheat sheet (C or
 * the HUD button) opens by itself the first time Luigi has to choose a fix. Stage 2-2 teleports the word "HI", 10
 * bits; it is cleared only when Luigi reads exactly HI. R retries with a fresh run; S skips the tutorial.
 *
 * Every outcome comes from POST /api/teleport: what Luigi reads is the response's luigi_reads for the fix the player
 * chose. Reads teleport.html.
 */

import { BACKEND_HINT, requestTeleports } from "./teleport_client.js";
import { computeTrackScale } from "./teleport_layout.js";
import { findNeededFix, findPairSlot, formatBellBits, formatKet, readLuigiResult } from "./teleport_rules.js";
import {
    ARRIVED_PHASE, CHALLENGE_LESSON, FIX_LESSON, LINK_ANCHOR, MEASURED_PHASE, READY_PHASE, READ_PHASE, SENDING_PHASE,
    TUTORIAL_DONE_LESSON, TUTORIAL_STATES, describeLesson, findTutorialStep, isRepeatedLesson, pickTutorialTeleport,
} from "./teleport_tutorial.js";
import {
    CHALLENGE_WORD, encodeWord, formatWordProgress, isWordCleared, isWordComplete,
} from "./teleport_word.js";
import {
    buildTeleportTrack, loadPipe, playBellMeasurement, playCheer, playLuigiReading, playPipeFlight, prepareTeleport,
    renderFixPanel, renderFixTable, renderWordBoard, showBanner, showLessonNote, showWordBoard, unlockLessonNote,
} from "./render_teleport.js";
import { findElementsById, playGoalIntro, renderKeyHints } from "../page_helpers.js";

const TUTORIAL_STAGE = "2-1";
const CHALLENGE_STAGE = "2-2";
// The tutorial asks for this many teleports of its state and plays the one whose bits show its fix best.
const TUTORIAL_BATCH_SIZE = 8;
// A lesson note stays up at least this long before Space can put it away, so it gets read (as in Level 1).
const LESSON_READ_MS = 1000;
// In Stage 2-2, Luigi's reading stays on screen this long before the next bit is set up.
const READING_HOLD_MS = 1000;
const HUD_DIGIT_COUNT = 3;
// Natural size of the scene (styles/teleport.css .teleport-track).
const TRACK_SIZE = { trackHeightPx: 340, trackMinWidthPx: 940 };
// Below the scene the brick ground; around it the scroller's side padding and a gap under the sky (teleport.css).
const GROUND_HEIGHT_PX = 64;
const SCROLLER_SIDE_PADDING_PX = 16;
// The sky's fixed height: room for its tallest content (the goal line, the key hints and a lesson note at once,
// measured at 271 px), so the scene never resizes when the sky's content changes.
const SKY_RESERVED_HEIGHT_PX = 280;
const SKY_GAP_PX = 16;
const NO_TOGGLES = { isXOn: false, isZOn: false };


/**
 * Build the scene, wire the controls, and start the tutorial once the goal has typed itself out.
 */
function startTeleportLevel() {
    const elements = findTeleportElements();
    elements.scene = buildTeleportTrack(elements.trackElement, {
        noteElement: elements.noteElement, bannerElement: elements.bannerElement,
    });
    // The sky keeps one fixed height whatever it shows, so the scene stays the same size through every stage; only
    // the window (or the cheat sheet narrowing the world) refits it.
    elements.skyPanel.style.height = `${SKY_RESERVED_HEIGHT_PX}px`;
    const resizeObserver = new ResizeObserver(() => fitTeleportTrack(elements));
    resizeObserver.observe(elements.worldElement);

    // isStarted stays false until the goal has typed itself out; until then keys and clicks do nothing.
    const game = {
        isStarted: false, stage: TUTORIAL_STAGE, teleportIndex: 0, teleport: null, wordTeleports: [], seed: null,
        teleportsStarted: 0,
        phase: READY_PHASE, toggles: { ...NO_TOGGLES }, bitsRead: [], tryCount: 0, isBusy: false, problem: null,
        lessonsSeen: new Set(), openLesson: null, isLessonLocked: false, isCheatSheetOpen: false,
        hasShownCheatSheet: false, banner: null,
    };
    elements.worldElement.addEventListener("click", () => handleSpace(game, elements));
    elements.cheatButton.addEventListener("click", (clickEvent) => {
        toggleCheatSheet(game, elements);
        // After a mouse click, hand Space back to the game; a keyboard press keeps the focus where it is.
        const isMouseClick = clickEvent.detail > 0;
        if (isMouseClick) {
            elements.cheatButton.blur();
        }
    });
    elements.cheatCloseButton.addEventListener("click", () => toggleCheatSheet(game, elements));
    document.addEventListener("keydown", (keyEvent) => handleTeleportKey(game, elements, keyEvent));
    renderTeleport(game, elements);
    playGoalIntro(elements.statusElement).then(() => {
        game.isStarted = true;
        startTutorialTeleport(game, elements);
    });
}


/**
 * Every element teleport.html must have, failing fast if one is missing.
 */
function findTeleportElements() {
    return findElementsById({
        trackElement: "track",
        worldElement: "world",
        scrollerElement: "track-scroller",
        skyPanel: "sky-panel",
        statusElement: "status-banner",
        problemElement: "problem-line",
        bannerElement: "teleport-banner",
        noteElement: "lesson-note",
        keyHintsElement: "key-hints",
        summaryElement: "scene-summary",
        triesElement: "hud-tries",
        stageElement: "hud-stage",
        wordElement: "hud-word",
        seedElement: "hud-seed",
        cheatButton: "cheat-button",
        cheatSheet: "cheat-sheet",
        cheatCloseButton: "cheat-close",
        fixTableBody: "fix-table-body",
    });
}


/**
 * Zoom the scene to fill the height the sky's fixed reserve leaves free (and no wider than the world), so the two
 * never overlap and the scene does not change size as lessons and banners come and go.
 */
function fitTeleportTrack(elements) {
    const worldStyle = getComputedStyle(elements.worldElement);
    const worldPaddingTopPx = Number.parseFloat(worldStyle.paddingTop);
    const freeHeightPx = elements.worldElement.clientHeight - worldPaddingTopPx - SKY_RESERVED_HEIGHT_PX - SKY_GAP_PX
        - GROUND_HEIGHT_PX;
    const freeWidthPx = elements.scrollerElement.clientWidth - 2 * SCROLLER_SIDE_PADDING_PX;
    const scale = computeTrackScale({ ...TRACK_SIZE, freeHeightPx, freeWidthPx });
    elements.trackElement.style.zoom = String(scale);
    elements.trackElement.style.width = `${Math.max(freeWidthPx / scale, TRACK_SIZE.trackMinWidthPx)}px`;
}


/**
 * Space or Enter continues a lesson; otherwise Space plays, X and Z flip the fix switches, C opens the cheat sheet,
 * Esc closes it, R retries with a fresh run, S skips the tutorial.
 */
function handleTeleportKey(game, elements, keyEvent) {
    if (!game.isStarted || keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey) {
        return;
    }
    const isOnButton = keyEvent.target instanceof HTMLButtonElement || keyEvent.target instanceof HTMLAnchorElement;
    const isActivationKey = keyEvent.key === " " || keyEvent.key === "Enter";
    if (isOnButton && isActivationKey) {
        return;
    }
    const keyActions = {
        " ": () => handleSpace(game, elements),
        Enter: () => closeLesson(game, elements),
        x: () => flipFixSwitch(game, elements, "isXOn"),
        z: () => flipFixSwitch(game, elements, "isZOn"),
        c: () => toggleCheatSheet(game, elements),
        Escape: () => closeCheatSheet(game, elements),
        r: () => retry(game, elements),
        s: () => skipTutorial(game, elements),
    };
    const action = keyActions[keyEvent.key.toLowerCase()] ?? keyActions[keyEvent.key];
    if (action === undefined) {
        return;
    }
    keyEvent.preventDefault();
    action();
}


/**
 * Space (or a click on the scene): put a lesson away, make the Bell measurement, or confirm the fix.
 */
function handleSpace(game, elements) {
    if (!game.isStarted || game.isBusy) {
        return;
    }
    if (game.openLesson !== null) {
        closeLesson(game, elements);
        return;
    }
    if (game.teleport === null) {
        return;
    }
    if (game.phase === READY_PHASE) {
        makeBellMeasurement(game, elements);
    } else if (game.phase === ARRIVED_PHASE) {
        confirmFix(game, elements);
    }
}


/**
 * Ask the simulator for the tutorial's next state (a batch, to pick a teleport whose bits make the fix matter) and
 * set it up.
 */
async function startTutorialTeleport(game, elements) {
    const state = TUTORIAL_STATES[game.teleportIndex];
    const response = await fetchTeleports(game, elements, Array(TUTORIAL_BATCH_SIZE).fill(state));
    if (response === null) {
        return;
    }
    beginTeleport(game, elements, pickTutorialTeleport(response.teleports));
}


/**
 * Ask the simulator for the whole word, one teleport per bit, and set up its first bit.
 */
async function startChallengeWord(game, elements) {
    Object.assign(game, { stage: CHALLENGE_STAGE, teleportIndex: 0, bitsRead: [], wordTeleports: [] });
    showBanner(elements.scene, "", "");
    showWordBoard(elements.scene, true);
    const response = await fetchTeleports(game, elements, encodeWord(CHALLENGE_WORD));
    if (response === null) {
        return;
    }
    game.wordTeleports = response.teleports;
    beginTeleport(game, elements, game.wordTeleports[0]);
    openLessonOnce(game, elements, CHALLENGE_LESSON, LINK_ANCHOR, () => {});
}


/**
 * Call the backend, keeping the page busy meanwhile. On failure, say how to start the backend and return null.
 */
async function fetchTeleports(game, elements, states) {
    game.isBusy = true;
    game.teleport = null;
    renderTeleport(game, elements);
    try {
        const response = await requestTeleports(states);
        game.seed = response.seed;
        game.problem = null;
        return response;
    } catch (error) {
        const message = error.message.startsWith(BACKEND_HINT) ? error.message : `${BACKEND_HINT} (${error.message})`;
        game.problem = message;
        return null;
    } finally {
        game.isBusy = false;
        renderTeleport(game, elements);
    }
}


/**
 * Put a teleport on the scene: fresh pair, the message in the mystery block, switches off.
 */
function beginTeleport(game, elements, teleport) {
    game.teleport = teleport;
    game.toggles = { ...NO_TOGGLES };
    prepareTeleport(elements.scene, teleport.state, findPairSlot(game.teleportsStarted));
    game.teleportsStarted += 1;
    enterPhase(game, elements, READY_PHASE);
}


/**
 * Move to a phase. In the tutorial, pause there with its lesson if it has one; then carry on with the phase.
 */
function enterPhase(game, elements, phase) {
    game.phase = phase;
    renderTeleport(game, elements);
    const step = game.stage === TUTORIAL_STAGE ? findTutorialStep(game.teleportIndex, phase) : null;
    const isLessonDue = step !== null && (isRepeatedLesson(step.lessonId) || !game.lessonsSeen.has(step.lessonId));
    if (!isLessonDue) {
        continuePhase(game, elements);
        return;
    }
    openLessonOnce(game, elements, step.lessonId, step.anchor, () => continuePhase(game, elements));
}


/**
 * What happens once a phase (and its lesson) is through: measured bits go into the pipe, the pipe delivers, a read
 * bit moves the game on. Ready and arrived wait for the player.
 */
function continuePhase(game, elements) {
    if (game.phase === MEASURED_PHASE) {
        loadPipe(elements.scene, game.teleport);
        enterPhase(game, elements, SENDING_PHASE);
    } else if (game.phase === SENDING_PHASE) {
        sendBitsToLuigi(game, elements);
    } else if (game.phase === ARRIVED_PHASE) {
        openCheatSheetFirstTime(game, elements);
    } else if (game.phase === READ_PHASE) {
        moveOnAfterReading(game, elements);
    }
}


/**
 * Space at the ready phase: Mario's Bell measurement.
 */
async function makeBellMeasurement(game, elements) {
    game.isBusy = true;
    renderTeleport(game, elements);
    await playBellMeasurement(elements.scene, game.teleport);
    game.isBusy = false;
    enterPhase(game, elements, MEASURED_PHASE);
}


/**
 * The bits ride the pipe; only once they arrive can Luigi act.
 */
async function sendBitsToLuigi(game, elements) {
    game.isBusy = true;
    renderTeleport(game, elements);
    await playPipeFlight(elements.scene);
    game.isBusy = false;
    enterPhase(game, elements, ARRIVED_PHASE);
}


/**
 * X or Z: flip one of Luigi's fix switches, only while he has the bits and has not measured yet.
 */
function flipFixSwitch(game, elements, toggleName) {
    const canFix = game.phase === ARRIVED_PHASE && !game.isBusy && game.openLesson === null;
    if (!canFix) {
        return;
    }
    game.toggles[toggleName] = !game.toggles[toggleName];
    renderTeleport(game, elements);
}


/**
 * Space at the arrived phase: Luigi applies the chosen fix and measures. The reading is the simulator's.
 */
async function confirmFix(game, elements) {
    game.isBusy = true;
    game.result = readLuigiResult(game.teleport, game.toggles);
    game.tryCount += 1;
    renderTeleport(game, elements);
    await playLuigiReading(elements.scene, game.result, game.toggles);
    if (game.stage === CHALLENGE_STAGE) {
        game.bitsRead.push(game.result.reading);
    }
    game.isBusy = false;
    enterPhase(game, elements, READ_PHASE);
}


/**
 * After Luigi reads: in the tutorial, the next state (or the same one again after a miss, or Stage 2-2 after the
 * last); in the challenge, the next bit or the verdict on the word.
 */
function moveOnAfterReading(game, elements) {
    if (game.stage === CHALLENGE_STAGE) {
        moveOnInChallenge(game, elements);
        return;
    }
    if (!game.result.isRightState) {
        startTutorialTeleport(game, elements);
        return;
    }
    game.teleportIndex += 1;
    if (game.teleportIndex < TUTORIAL_STATES.length) {
        startTutorialTeleport(game, elements);
        return;
    }
    finishTutorial(game, elements);
}


/**
 * Both tutorial states made it: celebrate, explain what comes next, then start Stage 2-2.
 */
function finishTutorial(game, elements) {
    playCheer(elements.scene);
    showBanner(elements.scene, "STAGE 2-1 CLEAR!", "is-win");
    openLessonOnce(game, elements, TUTORIAL_DONE_LESSON, LINK_ANCHOR, () => startChallengeWord(game, elements));
}


/**
 * After a short look at Luigi's reading: the next bit of the word, or, once all 10 are in, cleared (exactly HI) or
 * garbled.
 */
async function moveOnInChallenge(game, elements) {
    game.isBusy = true;
    await new Promise((resolve) => setTimeout(resolve, READING_HOLD_MS));
    game.isBusy = false;
    if (!isWordComplete(game.bitsRead, CHALLENGE_WORD)) {
        game.teleportIndex += 1;
        beginTeleport(game, elements, game.wordTeleports[game.teleportIndex]);
        return;
    }
    const luigiWord = formatWordProgress(game.bitsRead, CHALLENGE_WORD);
    if (isWordCleared(game.bitsRead, CHALLENGE_WORD)) {
        playCheer(elements.scene);
        showBanner(elements.scene, `COURSE CLEAR! Luigi reads ${luigiWord}`, "is-win");
    } else {
        showBanner(elements.scene, `✖ Luigi reads ${luigiWord}, not ${CHALLENGE_WORD}. R: try again`, "is-lose");
    }
    game.teleport = null;
    renderTeleport(game, elements);
}


/**
 * R: a fresh run from the simulator. In the tutorial the current state again; in the challenge the whole word.
 */
function retry(game, elements) {
    if (game.isBusy || game.openLesson !== null) {
        return;
    }
    if (game.stage === CHALLENGE_STAGE) {
        startChallengeWord(game, elements);
        return;
    }
    showBanner(elements.scene, "", "");
    startTutorialTeleport(game, elements);
}


/**
 * S: straight to Stage 2-2 (for players who have done the tutorial before).
 */
function skipTutorial(game, elements) {
    const canSkip = game.stage === TUTORIAL_STAGE && !game.isBusy;
    if (!canSkip) {
        return;
    }
    closeOpenLesson(game, elements);
    startChallengeWord(game, elements);
}


/**
 * The first time something comes up, pause with its lesson, locked for LESSON_READ_MS. onClose runs when the player
 * puts it away. A lesson already seen (and not a repeated one) runs onClose straight away.
 */
function openLessonOnce(game, elements, lessonId, anchor, onClose) {
    if (game.lessonsSeen.has(lessonId) && !isRepeatedLesson(lessonId)) {
        onClose();
        return;
    }
    game.lessonsSeen.add(lessonId);
    game.openLesson = { lessonId, onClose };
    game.isLessonLocked = true;
    showLessonNote(elements.scene, anchor, describeLesson(lessonId, game));
    renderTeleport(game, elements);
    const openedLesson = game.openLesson;
    setTimeout(() => {
        if (game.openLesson !== openedLesson) {
            return;
        }
        game.isLessonLocked = false;
        unlockLessonNote(elements.scene);
        renderTeleport(game, elements);
    }, LESSON_READ_MS);
}


/**
 * Put the open lesson away (once unlocked) and carry on.
 */
function closeLesson(game, elements) {
    if (game.openLesson === null || game.isLessonLocked) {
        return;
    }
    const onClose = game.openLesson.onClose;
    closeOpenLesson(game, elements);
    onClose();
}


/**
 * Hide the lesson note without carrying on (used when skipping ahead).
 */
function closeOpenLesson(game, elements) {
    game.openLesson = null;
    game.isLessonLocked = false;
    showLessonNote(elements.scene, null);
    renderTeleport(game, elements);
}


/**
 * The first time Luigi has bits to fix (in the fix lesson's wake), slide the cheat sheet in.
 */
function openCheatSheetFirstTime(game, elements) {
    const isFixLessonSeen = game.lessonsSeen.has(FIX_LESSON);
    if (game.hasShownCheatSheet || !isFixLessonSeen) {
        return;
    }
    game.hasShownCheatSheet = true;
    if (!game.isCheatSheetOpen) {
        toggleCheatSheet(game, elements);
    }
}


/**
 * C or the HUD button: slide the cheat sheet in or out. The game keeps going beside it.
 */
function toggleCheatSheet(game, elements) {
    if (!game.isStarted) {
        return;
    }
    game.isCheatSheetOpen = !game.isCheatSheetOpen;
    game.hasShownCheatSheet = true;
    elements.cheatSheet.classList.toggle("is-open", game.isCheatSheetOpen);
    elements.cheatButton.setAttribute("aria-expanded", String(game.isCheatSheetOpen));
    renderTeleport(game, elements);
}


/**
 * Esc: close the cheat sheet if it is open.
 */
function closeCheatSheet(game, elements) {
    if (game.isCheatSheetOpen) {
        toggleCheatSheet(game, elements);
    }
}


/**
 * HUD, sky line, fix panel, word board, cheat sheet table, key hints and the screen-reader summary.
 */
function renderTeleport(game, elements) {
    elements.triesElement.textContent = String(game.tryCount).padStart(HUD_DIGIT_COUNT, "0");
    elements.stageElement.textContent = game.stage;
    elements.wordElement.textContent = game.stage === CHALLENGE_STAGE
        ? formatWordProgress(game.bitsRead, CHALLENGE_WORD)
        : "--";
    elements.seedElement.textContent = game.seed === null ? "--" : String(game.seed);
    renderProblem(game, elements);
    renderFixPanel(elements.scene, describeFixView(game));
    if (game.stage === CHALLENGE_STAGE) {
        renderWordBoard(elements.scene, describeWordView(game));
    }
    const isTutorialFix = game.stage === TUTORIAL_STAGE && hasBitsArrived(game);
    renderFixTable(elements.fixTableBody, isTutorialFix ? formatBellBits(game.teleport.bell_bits) : "");
    renderKeyHints(elements.keyHintsElement, listKeyHints(game));
    const summaryText = describeScene(game);
    if (elements.summaryElement.textContent !== summaryText) {
        elements.summaryElement.textContent = summaryText;
    }
}


/**
 * Have the bits reached Luigi in the current teleport (so his fix panel shows them)?
 */
function hasBitsArrived(game) {
    const isAfterPipe = game.phase === ARRIVED_PHASE || game.phase === READ_PHASE;
    return game.teleport !== null && isAfterPipe;
}


/**
 * What Luigi's fix panel shows.
 */
function describeFixView(game) {
    const bitsText = hasBitsArrived(game) ? formatBellBits(game.teleport.bell_bits) : "";
    const isActive = game.phase === ARRIVED_PHASE && game.teleport !== null && game.openLesson === null;
    return { bitsText, toggles: game.toggles, isActive };
}


/**
 * What the word board shows: the target bits, Luigi's bits, and the bit on its way.
 */
function describeWordView(game) {
    const isWordUnderWay = game.teleport !== null && !isWordComplete(game.bitsRead, CHALLENGE_WORD);
    const currentIndex = isWordUnderWay ? game.teleportIndex : -1;
    return {
        targetWord: CHALLENGE_WORD, targetBits: encodeWord(CHALLENGE_WORD), bitsRead: game.bitsRead, currentIndex,
    };
}


/**
 * Show the backend problem in its own red line in the sky (with a ✖, not only red), or hide it once things work.
 * It is a separate line because the goal line fades away on its own timer.
 */
function renderProblem(game, elements) {
    const hasProblem = game.problem !== null;
    elements.problemElement.hidden = !hasProblem;
    elements.problemElement.textContent = hasProblem ? `✖ ${game.problem}` : "";
}


/**
 * Which keys do something right now.
 */
function listKeyHints(game) {
    if (!game.isStarted) {
        return [];
    }
    const cheatHint = { key: "C", action: "Cheat sheet" };
    const retryHint = { key: "R", action: "Retry" };
    if (game.openLesson !== null) {
        return game.isLessonLocked ? [cheatHint] : [{ key: "Space", action: "Continue" }, cheatHint];
    }
    if (game.isBusy && game.teleport === null) {
        return [{ key: "…", action: "Loading" }];
    }
    if (game.isBusy) {
        return [cheatHint];
    }
    const hints = [];
    if (game.teleport !== null && game.phase === READY_PHASE) {
        hints.push({ key: "Space", action: "Bell measurement" });
    }
    if (game.teleport !== null && game.phase === ARRIVED_PHASE) {
        hints.push({ key: "X", action: "X fix" }, { key: "Z", action: "Z fix" }, { key: "Space", action: "Confirm" });
    }
    hints.push(cheatHint, retryHint);
    if (game.stage === TUTORIAL_STAGE) {
        hints.push({ key: "S", action: "Skip to 2-2" });
    }
    return hints;
}


/**
 * The scene in words, for screen readers (announced politely when it changes).
 */
function describeScene(game) {
    if (game.problem !== null) {
        return game.problem;
    }
    if (game.teleport === null) {
        return `Stage ${game.stage}. Luigi's word: ${formatWordProgress(game.bitsRead, CHALLENGE_WORD)}.`;
    }
    const sending = `Stage ${game.stage}: Mario sends ${formatKet(game.teleport.state)}.`;
    if (game.phase === READY_PHASE || game.phase === MEASURED_PHASE || game.phase === SENDING_PHASE) {
        return sending;
    }
    const bits = `Luigi has bits ${formatBellBits(game.teleport.bell_bits)}.`;
    const fix = `X fix ${game.toggles.isXOn ? "on" : "off"}, Z fix ${game.toggles.isZOn ? "on" : "off"}.`;
    if (game.phase === ARRIVED_PHASE) {
        return `${sending} ${bits} ${fix}`;
    }
    const verdict = game.result.isRightState ? "right" : "wrong";
    const needed = findNeededFix(game.teleport.bell_bits);
    return `${sending} ${bits} Luigi read ${game.result.reading}: ${verdict}. Needed fix: ${needed}.`;
}


startTeleportLevel();
