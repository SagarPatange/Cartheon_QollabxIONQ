/**
 * Level 4 page entry point: the teleported CNOT of the paper's Fig. 4, in four rounds: one pair from |1⟩ (it acts
 * as a CNOT), one pair from |+⟩ (it makes a Bell pair), two Steane blocks over 7 pairs (a logical Bell pair), and the
 * same with one pair spoiled by a turtle (Luigi's checks find and fix it). Space plays each step; in the one-pair
 * rounds X and Z choose the fixes; R starts over with a fresh run; mouse clicks do nothing.
 *
 * Every bit and reading comes from the Stim backend (POST /api/teleported-cnot), fetched once per run with every
 * possible fix already tried. Reads teleported_cnot.html.
 */

import {
    BAD_BLOCK_ROUND, ROUND_KINDS, buildPairCircuit, describeBlockStep, describePairStep, describeRoundIntro, isPairRound,
    judgePairFix, listKeyHints, listRoundSteps,
} from "./teleported_cnot_plan.js";
import {
    buildCnotScene, playTurtle, renderBlocks, renderCheckCard, renderFixCard, renderPairCircuit, showBanner,
    showMessage,
} from "./render_teleported_cnot.js";
import { fitBoardToStage, hideSkyProblem, postToSimulator, showSkyProblem } from "../lesson_stage.js";
import { findElementsById, playGoalIntro, renderKeyHints } from "../page_helpers.js";

const LESSON_API_PATH = "/api/teleported-cnot";
const NEXT_STOP_URL = "start.html#map-level2";
const BLOCK_PAIR_COUNT = 7;


/**
 * Build the scene, wire the keys, fetch a run and wait for the goal to type itself out.
 */
function startTeleportedCnotLevel() {
    const elements = findElementsById({
        worldElement: "world",
        stageElement: "stage",
        contentElement: "lesson-content",
        statusElement: "status-banner",
        keyHintsElement: "key-hints",
        roundElement: "hud-round",
        pairsElement: "hud-pairs",
        doneElement: "hud-done",
        leftTitleElement: "left-card-title",
        leftBodyElement: "left-card-body",
        rightTitleElement: "right-card-title",
        rightBodyElement: "right-card-body",
        messageToadElement: "message-toad",
        messageElement: "lesson-message",
        bannerElement: "banner",
        castElement: "cast",
        turtleElement: "turtle",
    });
    const scene = buildCnotScene(elements);
    const game = createGame();
    document.addEventListener("keydown", (keyEvent) => handleKey(game, scene, keyEvent));
    window.addEventListener("resize", () => fitBoardToStage(scene.stageElement, scene.contentElement));
    document.fonts.ready.then(() => fitBoardToStage(scene.stageElement, scene.contentElement));
    render(game, scene);
    playGoalIntro(scene.statusElement).then(() => {
        game.isStarted = true;
        startNewRun(game, scene);
    });
}


/**
 * A fresh game: round 1, nothing played, no fixes chosen.
 */
function createGame() {
    return {
        isStarted: false, isBusy: false, response: null, roundIndex: 0, stepIndex: 0, hasLuigiX: false,
        hasMarioZ: false, verdict: null, isCleared: false,
    };
}


/**
 * Fetch a fresh run from the backend and start round 1. If the backend is down, say so in the sky line.
 */
async function startNewRun(game, scene) {
    if (game.isBusy || !game.isStarted) {
        return;
    }
    game.isBusy = true;
    Object.assign(game, createGame(), { isStarted: true, isBusy: true });
    showBanner(scene, null);
    render(game, scene);
    try {
        game.response = await postToSimulator(LESSON_API_PATH, {});
        hideSkyProblem(scene.statusElement);
    } catch (error) {
        showSkyProblem(scene.statusElement, `Can't reach the simulator: ${error.message}`);
    }
    game.isBusy = false;
    if (game.response !== null) {
        startRound(game, scene, 0);
    }
}


/**
 * Start a round: Toad says what it shows.
 */
function startRound(game, scene, roundIndex) {
    Object.assign(game, { roundIndex, stepIndex: 0, hasLuigiX: false, hasMarioZ: false, verdict: null });
    showMessage(scene, describeRoundIntro(ROUND_KINDS[roundIndex]));
    render(game, scene);
}


/**
 * Space plays the next step; X and Z toggle the fixes while choosing; R starts over.
 */
function handleKey(game, scene, keyEvent) {
    const keyActions = {
        " ": () => handleSpace(game, scene),
        x: () => toggleFix(game, scene, "hasLuigiX"),
        X: () => toggleFix(game, scene, "hasLuigiX"),
        z: () => toggleFix(game, scene, "hasMarioZ"),
        Z: () => toggleFix(game, scene, "hasMarioZ"),
        r: () => startNewRun(game, scene),
        R: () => startNewRun(game, scene),
    };
    const action = keyActions[keyEvent.key];
    if (action === undefined || !game.isStarted) {
        return;
    }
    keyEvent.preventDefault();
    if (game.isBusy || game.response === null) {
        return;
    }
    action();
}


/**
 * The step under Space: play it, apply the fixes, move to the next round, or leave for the map.
 */
async function handleSpace(game, scene) {
    if (game.isCleared) {
        window.location.assign(NEXT_STOP_URL);
        return;
    }
    const roundKind = ROUND_KINDS[game.roundIndex];
    const stepId = listRoundSteps(roundKind)[game.stepIndex];
    if (stepId === "choose") {
        applyFixes(game, scene, roundKind);
    } else if (stepId === "done") {
        finishRound(game, scene);
    } else {
        await playStep(game, scene, roundKind, stepId);
    }
}


/**
 * Play one step: say what happened, with the turtle's flight first when it is his step.
 */
async function playStep(game, scene, roundKind, stepId) {
    const roundData = findRoundData(game.response, game.roundIndex);
    if (stepId === "turtle") {
        game.isBusy = true;
        render(game, scene);
        await playTurtle(scene, roundData.bad_pair);
        game.isBusy = false;
    }
    const message = isPairRound(roundKind) ? describePairStep(stepId, roundData) : describeBlockStep(stepId, roundData);
    game.stepIndex += 1;
    showMessage(scene, message);
    render(game, scene);
}


/**
 * Toggle one of the fixes, only while choosing.
 */
function toggleFix(game, scene, fixKey) {
    const stepId = listRoundSteps(ROUND_KINDS[game.roundIndex])[game.stepIndex];
    if (stepId !== "choose") {
        return;
    }
    game[fixKey] = !game[fixKey];
    game.verdict = null;
    render(game, scene);
}


/**
 * Apply the chosen fixes and judge them from the backend's reading; a wrong choice can be changed and tried again.
 */
function applyFixes(game, scene, roundKind) {
    const roundData = findRoundData(game.response, game.roundIndex);
    const judgement = judgePairFix(roundKind, roundData, game.hasLuigiX, game.hasMarioZ);
    game.verdict = judgement.isRight ? "Right fixes!" : "Not yet: change the fixes and try again.";
    if (judgement.isRight) {
        game.stepIndex += 1;
    }
    showMessage(scene, judgement.message);
    render(game, scene);
}


/**
 * On to the next round, or the end of the level.
 */
function finishRound(game, scene) {
    const hasNextRound = game.roundIndex + 1 < ROUND_KINDS.length;
    if (hasNextRound) {
        startRound(game, scene, game.roundIndex + 1);
        return;
    }
    game.isCleared = true;
    showBanner(scene, "LEVEL CLEAR!");
    showMessage(scene, "You ran the paper's teleported CNOT: on one pair, then on all 7 between two Steane blocks, and"
        + " one bad pair got fixed. Next, Level 5: build a logical Bell pair yourself.");
    render(game, scene);
}


/**
 * A round's data in the response: the two one-pair rounds, then the two block rounds.
 */
function findRoundData(response, roundIndex) {
    const roundsInOrder = [response.classical_round, response.bell_round, ...response.block_rounds];
    return roundsInOrder[roundIndex];
}


/**
 * Redraw the board, the HUD and the key hints from the game state.
 */
function render(game, scene) {
    const roundKind = ROUND_KINDS[game.roundIndex];
    if (game.response !== null) {
        if (isPairRound(roundKind)) {
            renderPairRound(game, scene, roundKind);
        } else {
            renderBlockRound(game, scene, roundKind);
        }
    }
    renderHud(game, scene, roundKind);
    renderKeyHints(scene.keyHintsElement, listCurrentHints(game, roundKind));
    fitBoardToStage(scene.stageElement, scene.contentElement);
}


/**
 * Rounds 1 and 2: the circuit so far, the measured bits once measured, and the fix toggles.
 */
function renderPairRound(game, scene, roundKind) {
    const roundData = findRoundData(game.response, game.roundIndex);
    const steps = listRoundSteps(roundKind);
    const hasPlayed = (stepId) => game.stepIndex > steps.indexOf(stepId);
    const pairView = {
        roundKind,
        stepIndex: game.stepIndex,
        m: hasPlayed("measureA") ? roundData.m : null,
        n: hasPlayed("measureB") ? roundData.n : null,
        hasLuigiX: game.hasLuigiX,
        hasMarioZ: game.hasMarioZ,
    };
    renderPairCircuit(scene, buildPairCircuit(pairView));
    const isChoosing = steps[game.stepIndex] === "choose";
    renderFixCard(scene, { hasLuigiX: game.hasLuigiX, hasMarioZ: game.hasMarioZ, isChoosing, verdict: game.verdict });
}


/**
 * Rounds 3 and 4: the tiles as far as the protocol has got, and Toad's check.
 */
function renderBlockRound(game, scene, roundKind) {
    const roundData = findRoundData(game.response, game.roundIndex);
    const steps = listRoundSteps(roundKind);
    const hasPlayed = (stepId) => steps.includes(stepId) && game.stepIndex > steps.indexOf(stepId);
    renderBlocks(scene, makeBlockView(roundData, hasPlayed));
    const isRechecked = hasPlayed("recheck");
    renderCheckCard(scene, {
        zzBit: pickCheckBit(roundData, "zz", hasPlayed("check"), isRechecked),
        xxBit: pickCheckBit(roundData, "xx", hasPlayed("check"), isRechecked),
        syndrome: hasPlayed("syndrome") ? roundData.luigi_z_syndrome : null,
        showsSyndrome: roundKind === BAD_BLOCK_ROUND,
    });
}


/**
 * What the block board shows once the steps so far have played.
 */
function makeBlockView(roundData, hasPlayed) {
    return {
        isEncoded: hasPlayed("encode"),
        hasPairs: hasPlayed("pairs"),
        badPair: hasPlayed("turtle") ? roundData.bad_pair : null,
        mBits: hasPlayed("mario") ? roundData.m_bits : null,
        isMSent: hasPlayed("sendM"),
        nBits: hasPlayed("luigi") ? roundData.n_bits : null,
        isNSent: hasPlayed("sendN"),
        luigiXFixes: hasPlayed("luigi") ? roundData.m_bits : null,
        marioZFixes: hasPlayed("marioFix") ? roundData.n_bits : null,
        flaggedPosition: hasPlayed("syndrome") ? roundData.bad_pair : null,
        isFlagFixed: hasPlayed("luigiFix"),
    };
}


/**
 * One logical parity bit as the check card shows it: after the recheck the fixed one, after the check the raw one.
 */
function pickCheckBit(roundData, parityName, isChecked, isRechecked) {
    if (isRechecked) {
        return roundData[`fixed_${parityName}_bit`];
    }
    if (isChecked) {
        return roundData[`raw_${parityName}_bit`];
    }
    return null;
}


/**
 * The HUD: the round, how many Bell pairs it uses, and whether the CNOT has been done.
 */
function renderHud(game, scene, roundKind) {
    scene.roundElement.textContent = `${game.roundIndex + 1}/${ROUND_KINDS.length}`;
    scene.pairsElement.textContent = String(isPairRound(roundKind) ? 1 : BLOCK_PAIR_COUNT);
    const steps = listRoundSteps(roundKind);
    const isDone = game.response !== null && steps[game.stepIndex] === "done";
    scene.doneElement.textContent = isDone || game.isCleared ? "YES" : "NO";
}


/**
 * The key hints for the step under Space.
 */
function listCurrentHints(game, roundKind) {
    if (!game.isStarted) {
        return [];
    }
    if (game.response === null) {
        return [{ key: "…", action: "Loading" }];
    }
    if (game.isCleared) {
        return [{ key: "Space", action: "Back to the map" }];
    }
    const stepId = listRoundSteps(roundKind)[game.stepIndex];
    return listKeyHints({ stepId, isLastRound: game.roundIndex === ROUND_KINDS.length - 1 });
}


startTeleportedCnotLevel();
