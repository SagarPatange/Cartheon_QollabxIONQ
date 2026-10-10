/**
 * Level 2 page entry point: build one logical Bell pair between Alice and Bob, one phase per Space press (a mouse
 * click does nothing; the first press heralds all 7 pairs in a row); R starts a new run. The goal types itself out
 * first and the level starts once it has. Keycap hints under the goal say what Space does next.
 *
 * The backend runs the whole protocol on Stim when the page opens (and on every new run); the page then plays back
 * what it did: 7 Barrett–Kok pairs, encoding, the teleported CNOT and a final check. Reads level2.html.
 */

import { requestLogicalPair } from "./level2_client.js";
import {
    CHECK_STEP, ENCODE_STEP, HERALD_STEP, PAIRS_PER_BLOCK, TELEPORT_STEP, buildPlaybackSteps, describeCheckResult,
    describeStepAction,
} from "./level2_plan.js";
import {
    buildLevel2Track, playCheck, playEncoding, playHeraldAllPairs, playTeleport, resetScene,
} from "./render_level2.js";
import { findElementsById, fitTrackToWorld, playGoalIntro, renderKeyHints } from "../page_helpers.js";

const HUD_DIGIT_COUNT = 3;
// Natural size of the scene (styles/level2.css); below it the ground (64 px), above it the goal line and key hints.
const TRACK_SIZE = { trackHeightPx: 400, trackMinWidthPx: 760, reservedHeightPx: 64 + 150 };


/**
 * Build the scene, wire the controls and fetch the first run. Game state lives in one object (no globals).
 */
function startLevel2() {
    const elements = findElementsById({
        trackElement: "track",
        worldElement: "world",
        scrollerElement: "track-scroller",
        statusElement: "status-banner",
        keyHintsElement: "key-hints",
        triesElement: "hud-tries",
        pairsElement: "hud-pairs",
        logicalElement: "hud-logical",
    });
    elements.scene = buildLevel2Track(elements.trackElement);
    fitTrackToWorld(elements, TRACK_SIZE);
    window.addEventListener("resize", () => fitTrackToWorld(elements, TRACK_SIZE));

    // isStarted stays false until the goal has typed itself out; until then keys do nothing.
    const game = {
        response: null, steps: [], stepIndex: 0, tryCount: 0, pairCount: 0, isBusy: false, isStarted: false,
    };
    document.addEventListener("keydown", (keyEvent) => handleLevel2Key(game, elements, keyEvent));
    renderLevel2(game, elements);
    playGoalIntro(elements.statusElement).then(() => {
        game.isStarted = true;
        startNewRun(game, elements);
    });
}


/**
 * Space plays the next step; R starts a new run.
 */
function handleLevel2Key(game, elements, keyEvent) {
    const keyActions = {
        " ": () => playNextStep(game, elements),
        r: () => startNewRun(game, elements),
        R: () => startNewRun(game, elements),
    };
    const action = keyActions[keyEvent.key];
    if (action === undefined) {
        return;
    }
    keyEvent.preventDefault();
    action();
}


/**
 * Fetch a fresh run from the backend and reset the scene. If the backend is down, say so in the sky line.
 */
async function startNewRun(game, elements) {
    if (game.isBusy || !game.isStarted) {
        return;
    }
    game.isBusy = true;
    Object.assign(game, { response: null, steps: [], stepIndex: 0, tryCount: 0, pairCount: 0 });
    resetScene(elements.scene);
    renderLevel2(game, elements);
    try {
        game.response = await requestLogicalPair();
        game.steps = buildPlaybackSteps(game.response);
        hideProblem(elements);
    } catch (error) {
        showProblem(elements, `Can't reach the simulator: ${error.message}`);
    }
    game.isBusy = false;
    renderLevel2(game, elements);
}


/**
 * Animate the next step of the run, then move on. Ignored while something is still playing.
 */
async function playNextStep(game, elements) {
    const hasNextStep = game.stepIndex < game.steps.length;
    if (game.isBusy || !game.isStarted || !hasNextStep) {
        return;
    }
    game.isBusy = true;
    renderLevel2(game, elements);
    await playStep(game, elements, game.steps[game.stepIndex]);
    game.stepIndex += 1;
    game.isBusy = false;
    renderLevel2(game, elements);
}


/**
 * Hand one step to its animation.
 */
async function playStep(game, elements, step) {
    const scene = elements.scene;
    const response = game.response;
    if (step.kind === HERALD_STEP) {
        await playHeraldAllPairs(scene, step.pairAttempts, {
            onAttempt: () => {
                game.tryCount += 1;
                renderLevel2(game, elements);
            },
            onPairLanded: () => {
                game.pairCount += 1;
                renderLevel2(game, elements);
            },
        });
    } else if (step.kind === ENCODE_STEP) {
        await playEncoding(scene, response);
    } else if (step.kind === TELEPORT_STEP) {
        await playTeleport(scene, response);
    } else if (step.kind === CHECK_STEP) {
        playCheck(scene, describeCheckResult(response), response.check_basis);
    }
}


/**
 * HUD counters and the key hints.
 */
function renderLevel2(game, elements) {
    elements.triesElement.textContent = String(game.tryCount).padStart(HUD_DIGIT_COUNT, "0");
    elements.pairsElement.textContent = `${game.pairCount}/${PAIRS_PER_BLOCK}`;
    const hasLogicalPair = game.stepIndex > game.steps.findIndex((step) => step.kind === TELEPORT_STEP);
    elements.logicalElement.textContent = game.steps.length > 0 && hasLogicalPair ? "YES" : "NO";

    renderKeyHints(elements.keyHintsElement, listLevel2KeyHints(game));
}


/**
 * Space does the next step (named), R starts a new run. Nothing to press before the level starts or while the
 * backend is loading.
 */
function listLevel2KeyHints(game) {
    if (!game.isStarted) {
        return [];
    }
    const newRunHint = { key: "R", action: "New run" };
    if (game.response === null) {
        return [{ key: "…", action: "Loading" }];
    }
    const hasNextStep = game.stepIndex < game.steps.length;
    if (!hasNextStep) {
        return [newRunHint];
    }
    return [{ key: "Space", action: describeStepAction(game.steps[game.stepIndex]) }, newRunHint];
}


/**
 * Bring the sky line back, in red, saying what went wrong.
 */
function showProblem(elements, problemText) {
    elements.statusElement.textContent = problemText;
    elements.statusElement.classList.remove("is-faded");
    elements.statusElement.classList.add("is-problem");
}


/**
 * Once things work again, put a problem away (the goal itself is only shown at the start).
 */
function hideProblem(elements) {
    if (elements.statusElement.classList.contains("is-problem")) {
        elements.statusElement.classList.remove("is-problem");
        elements.statusElement.classList.add("is-faded");
    }
}


startLevel2();
