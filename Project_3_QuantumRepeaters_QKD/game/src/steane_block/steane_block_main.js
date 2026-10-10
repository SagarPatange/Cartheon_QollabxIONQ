/**
 * Level 3 page entry point: build a Steane |0̄⟩ block, check it with the paper's ancilla, then find and fix three
 * errors (X, Z, Y) from their syndromes. Space moves the level on, ↑↓ and ←→ pick, Backspace undoes a CNOT, R starts
 * over; mouse clicks do nothing. The goal types itself out first and the level starts once it has.
 *
 * Every check and syndrome comes from the Stim backend: POST /api/steane-block after each CNOT, POST
 * /api/steane-errors for the three error rounds (with every possible fix already tried). Reads steane_block.html.
 */

import {
    BUILD_PHASE, CHECK_COUNT_PER_TYPE, CLEAR_PHASE, FIXED_PHASE, FIX_PAULIS, HADAMARD_PHASE, MEASURE_PHASE,
    PICK_PHASE, QUBIT_POSITIONS, ROUND_DONE_PHASE, VERIFIED_PHASE, VERIFY_PHASE, ZAP_PHASE, buildEncoderCircuit,
    countCleanChecks, describeBuiltBlock, describeFixResult, describeSyndromes, describeVerification, describeZap,
    judgeBuildRound, listBuildRounds, listKeyHints, listTargetChoices, moveThroughChoices, nameCheck, nameFix,
} from "./steane_block_plan.js";
import {
    buildSteaneScene, playZap, renderBuildCircles, renderCursorDot, renderEncoderCard, renderErrorCircles,
    renderSyndromeCard, showBanner, showMessage,
} from "./render_steane_block.js";
import {
    fitBoardToStage, hideSkyProblem, postToSimulator, showSkyProblem,
} from "../lesson_stage.js";
import { findElementsById, playGoalIntro, renderKeyHints } from "../page_helpers.js";

const BUILD_API_PATH = "/api/steane-block";
const ERRORS_API_PATH = "/api/steane-errors";
const NEXT_STOP_URL = "start.html#map-teleported-cnot";
const CHECK_TOTAL = 2 * CHECK_COUNT_PER_TYPE;
const HUD_DIGIT_COUNT = 2;
const INTRO_MESSAGE = "Mario's 7 qubits start in |0⟩. First, H on q1, q2 and q4 puts each of them in |+⟩.";


/**
 * Build the scene, wire the keys and wait for the goal to type itself out. Game state lives in one object.
 */
function startSteaneBlockLevel() {
    const elements = findElementsById({
        worldElement: "world",
        stageElement: "stage",
        contentElement: "lesson-content",
        statusElement: "status-banner",
        keyHintsElement: "key-hints",
        cnotsElement: "hud-cnots",
        checksElement: "hud-checks",
        blockElement: "hud-block",
        leftTitleElement: "left-card-title",
        leftBodyElement: "left-card-body",
        diagramElement: "diagram",
        messageToadElement: "message-toad",
        messageElement: "lesson-message",
        bannerElement: "banner",
        castElement: "cast",
        turtleElement: "turtle",
    });
    const scene = buildSteaneScene(elements);
    const game = createGame();
    resetLevel(game, scene);
    document.addEventListener("keydown", (keyEvent) => handleKey(game, scene, keyEvent));
    window.addEventListener("resize", () => fitBoardToStage(scene.stageElement, scene.contentElement));
    // The pixel font loads after the first layout and changes the board's size, so fit it again then.
    document.fonts.ready.then(() => fitBoardToStage(scene.stageElement, scene.contentElement));
    playGoalIntro(scene.statusElement).then(() => {
        game.isStarted = true;
        render(game, scene);
    });
}


/**
 * A fresh game: nothing built, no errors yet.
 */
function createGame() {
    return {
        isStarted: false, isBusy: false, phase: HADAMARD_PHASE, roundIndex: 0, cnots: [], roundStartIndex: 0,
        cursorTarget: 1, report: null, hasVerification: false, errorRounds: null, errorIndex: 0, hasMeasured: false,
        fixPauli: FIX_PAULIS[0], fixPosition: QUBIT_POSITIONS[0], isBlockHit: false,
    };
}


/**
 * Back to the start: seven |0⟩ qubits.
 */
function resetLevel(game, scene) {
    const isStarted = game.isStarted;
    Object.assign(game, createGame(), { isStarted });
    showBanner(scene, null);
    showMessage(scene, INTRO_MESSAGE);
    renderBuildCircles(scene, null, null);
    renderCursorDot(scene, null);
    render(game, scene);
}


/**
 * Space moves on; arrows pick; Backspace undoes a CNOT; R starts over. Ignored while the simulator is answering.
 */
function handleKey(game, scene, keyEvent) {
    const keyActions = {
        " ": () => handleSpace(game, scene),
        ArrowUp: () => moveCursor(game, scene, -1),
        ArrowDown: () => moveCursor(game, scene, 1),
        ArrowLeft: () => changeFixPauli(game, scene, -1),
        ArrowRight: () => changeFixPauli(game, scene, 1),
        Backspace: () => undoCnot(game, scene),
        r: () => resetLevel(game, scene),
        R: () => resetLevel(game, scene),
    };
    const action = keyActions[keyEvent.key];
    if (action === undefined || !game.isStarted) {
        return;
    }
    keyEvent.preventDefault();
    if (game.isBusy) {
        return;
    }
    action();
}


/**
 * What Space does in each phase.
 */
function handleSpace(game, scene) {
    const spaceActions = {
        [HADAMARD_PHASE]: () => applyHadamards(game, scene),
        [BUILD_PHASE]: () => placeCnot(game, scene),
        [ROUND_DONE_PHASE]: () => startRound(game, scene, game.roundIndex + 1),
        [VERIFY_PHASE]: () => runVerification(game, scene),
        [VERIFIED_PHASE]: () => startErrorRounds(game, scene),
        [ZAP_PHASE]: () => zapBlock(game, scene),
        [MEASURE_PHASE]: () => measureChecks(game, scene),
        [PICK_PHASE]: () => applyFix(game, scene),
        [FIXED_PHASE]: () => finishErrorRound(game, scene),
        [CLEAR_PHASE]: () => window.location.assign(NEXT_STOP_URL),
    };
    spaceActions[game.phase]();
}


/**
 * H on q1, q2 and q4, then the first round.
 */
async function applyHadamards(game, scene) {
    game.isBusy = true;
    const isOk = await refreshChecks(game, scene);
    game.isBusy = false;
    if (isOk) {
        startRound(game, scene, 0);
    }
}


/**
 * Start a build round: its Hadamard qubit, its circle, and the cursor on the next qubit down.
 */
function startRound(game, scene, roundIndex) {
    const round = listBuildRounds()[roundIndex];
    game.phase = BUILD_PHASE;
    game.roundIndex = roundIndex;
    game.roundStartIndex = game.cnots.length;
    game.cursorTarget = listTargetChoices(round.control)[0];
    const checkName = nameCheck(round.checkPositions);
    showMessage(scene, `q${round.control} spreads along circle ${checkName}: put a CNOT from q${round.control} onto `
        + "each other qubit in that circle.");
    render(game, scene);
}


/**
 * Move the build cursor (target qubit) or, while picking a fix, the qubit to fix.
 */
function moveCursor(game, scene, step) {
    if (game.phase === BUILD_PHASE) {
        const control = listBuildRounds()[game.roundIndex].control;
        game.cursorTarget = moveThroughChoices(listTargetChoices(control), game.cursorTarget, step);
    } else if (game.phase === PICK_PHASE) {
        game.fixPosition = moveThroughChoices(QUBIT_POSITIONS, game.fixPosition, step);
    }
    render(game, scene);
}


/**
 * While picking a fix: cycle X, Z, Y.
 */
function changeFixPauli(game, scene, step) {
    if (game.phase !== PICK_PHASE) {
        return;
    }
    game.fixPauli = moveThroughChoices(FIX_PAULIS, game.fixPauli, step);
    render(game, scene);
}


/**
 * Place a CNOT from the round's qubit onto the cursor's, then ask the backend what the checks read now.
 */
async function placeCnot(game, scene) {
    const control = listBuildRounds()[game.roundIndex].control;
    game.isBusy = true;
    game.cnots.push([control, game.cursorTarget]);
    const isOk = await refreshChecks(game, scene);
    if (!isOk) {
        game.cnots.pop();
    }
    game.isBusy = false;
    if (isOk) {
        judgeRound(game, scene);
    }
}


/**
 * Take back this round's last CNOT.
 */
async function undoCnot(game, scene) {
    const hasRoundCnot = game.cnots.length > game.roundStartIndex;
    if (game.phase !== BUILD_PHASE || !hasRoundCnot) {
        return;
    }
    game.isBusy = true;
    const removedCnot = game.cnots.pop();
    const isOk = await refreshChecks(game, scene);
    if (!isOk) {
        game.cnots.push(removedCnot);
    }
    game.isBusy = false;
    if (isOk) {
        judgeRound(game, scene);
    }
}


/**
 * After a CNOT or an undo: is the round's circle lit (and the earlier ones still)? The last round also needs the
 * Z checks and Z̄, so the block really is |0̄⟩.
 */
function judgeRound(game, scene) {
    const roundCnotCount = game.cnots.length - game.roundStartIndex;
    const judgement = judgeBuildRound(game.report, game.roundIndex, roundCnotCount);
    const isLastRound = game.roundIndex === listBuildRounds().length - 1;
    if (judgement.isComplete && isLastRound && game.report.is_encoded) {
        game.phase = VERIFY_PHASE;
        showMessage(scene, describeBuiltBlock(game.report));
    } else if (judgement.isComplete && isLastRound) {
        showMessage(scene, describeBuiltBlock(game.report));
    } else if (judgement.isComplete) {
        game.phase = ROUND_DONE_PHASE;
        showMessage(scene, judgement.message);
    } else {
        showMessage(scene, judgement.message);
    }
    render(game, scene);
}


/**
 * Ask the backend what every check reads after the H gates and the CNOTs so far. Returns false (and says so in the
 * sky) if the simulator can't be reached.
 */
async function refreshChecks(game, scene) {
    try {
        game.report = await postToSimulator(BUILD_API_PATH, { cnots: game.cnots });
        hideSkyProblem(scene.statusElement);
        return true;
    } catch (error) {
        showSkyProblem(scene.statusElement, `Can't reach the simulator: ${error.message}`);
        return false;
    }
}


/**
 * The paper's ancilla check: CNOTs from q1, q6 and q7 onto the ancilla, then measure it. The backend already ran it.
 */
function runVerification(game, scene) {
    game.hasVerification = true;
    game.phase = VERIFIED_PHASE;
    showMessage(scene, describeVerification(game.report.verification_bit));
    render(game, scene);
}


/**
 * Fetch the three error rounds (each with every fix already tried) and send in the first zap.
 */
async function startErrorRounds(game, scene) {
    game.isBusy = true;
    try {
        const response = await postToSimulator(ERRORS_API_PATH, {});
        game.errorRounds = response.rounds;
        hideSkyProblem(scene.statusElement);
    } catch (error) {
        showSkyProblem(scene.statusElement, `Can't reach the simulator: ${error.message}`);
    }
    game.isBusy = false;
    if (game.errorRounds !== null) {
        startErrorRound(game, scene, 0);
    }
}


/**
 * Announce the next zap: which Pauli, never which qubit.
 */
function startErrorRound(game, scene, errorIndex) {
    game.errorIndex = errorIndex;
    game.phase = ZAP_PHASE;
    game.hasMeasured = false;
    game.isBlockHit = false;
    showMessage(scene, describeZap(game.errorRounds[errorIndex].pauli));
    render(game, scene);
}


/**
 * The turtle flies over and zaps one qubit.
 */
async function zapBlock(game, scene) {
    game.isBusy = true;
    render(game, scene);
    await playZap(scene);
    game.isBusy = false;
    game.isBlockHit = true;
    game.phase = MEASURE_PHASE;
    showMessage(scene, "Zap! Measure all six checks with the ancilla to find out where it hit.");
    render(game, scene);
}


/**
 * Show the measured syndromes and start picking a fix.
 */
function measureChecks(game, scene) {
    const errorRound = game.errorRounds[game.errorIndex];
    game.hasMeasured = true;
    game.phase = PICK_PHASE;
    game.fixPauli = FIX_PAULIS[0];
    game.fixPosition = QUBIT_POSITIONS[0];
    showMessage(scene, describeSyndromes(errorRound.z_syndrome, errorRound.x_syndrome));
    render(game, scene);
}


/**
 * Apply the picked fix: the backend already knows what every fix does. A wrong fix is undone, so the player can try
 * again from the same syndromes.
 */
function applyFix(game, scene) {
    const errorRound = game.errorRounds[game.errorIndex];
    const fixResult = errorRound.fixes[nameFix(game.fixPauli, game.fixPosition)];
    showMessage(scene, describeFixResult(fixResult, errorRound));
    if (fixResult.is_fixed) {
        game.phase = FIXED_PHASE;
        game.isBlockHit = false;
    }
    render(game, scene);
}


/**
 * On to the next zap, or the end of the level.
 */
function finishErrorRound(game, scene) {
    const hasNextRound = game.errorIndex + 1 < game.errorRounds.length;
    if (hasNextRound) {
        startErrorRound(game, scene, game.errorIndex + 1);
        return;
    }
    game.phase = CLEAR_PHASE;
    showBanner(scene, "LEVEL CLEAR!");
    showMessage(scene, "You built a Steane block, checked it like the paper does, and fixed an X, a Z and a Y."
        + " Next, Level 4: link two blocks with a teleported CNOT.");
    render(game, scene);
}


/**
 * Redraw everything that depends on the game state: the left card, the circles, the cursor, the HUD and the hints.
 */
function render(game, scene) {
    const isErrorPart = game.errorRounds !== null && game.phase !== VERIFIED_PHASE;
    if (isErrorPart) {
        renderErrorPart(game, scene);
    } else {
        renderBuildPart(game, scene);
    }
    renderHud(game, scene);
    const hints = game.isStarted && !game.isBusy ? listKeyHints(makeHintView(game)) : [];
    renderKeyHints(scene.keyHintsElement, hints);
    fitBoardToStage(scene.stageElement, scene.contentElement);
}


/**
 * Part A: the encoder with the cursor's ghost CNOT, and the circles from the X checks.
 */
function renderBuildPart(game, scene) {
    const isBuilding = game.phase === BUILD_PHASE;
    const control = listBuildRounds()[game.roundIndex].control;
    const buildState = {
        hasHadamards: game.phase !== HADAMARD_PHASE,
        cnots: game.cnots,
        ghost: isBuilding ? { control, target: game.cursorTarget } : null,
        hasVerification: game.hasVerification,
    };
    renderEncoderCard(scene, buildEncoderCircuit(buildState), buildState);
    const xChecks = game.report === null ? null : game.report.x_checks;
    renderBuildCircles(scene, xChecks, isBuilding ? game.roundIndex : null);
    renderCursorDot(scene, null);
}


/**
 * Part B: the syndrome table and fix picker, and the circles from the measured syndromes.
 */
function renderErrorPart(game, scene) {
    const errorRound = game.errorRounds[game.errorIndex];
    let measuredSyndromes = null;
    if (game.hasMeasured) {
        measuredSyndromes = { zSyndrome: errorRound.z_syndrome, xSyndrome: errorRound.x_syndrome };
    }
    const isPicking = game.phase === PICK_PHASE;
    const fix = isPicking ? { pauli: game.fixPauli, position: game.fixPosition } : null;
    renderSyndromeCard(scene, measuredSyndromes, fix);
    // Once fixed, the table keeps what was measured but the circles are quiet again.
    renderErrorCircles(scene, isPicking ? measuredSyndromes : null);
    renderCursorDot(scene, isPicking ? game.fixPosition : null);
}


/**
 * The HUD: CNOTs placed, checks reading clean, and the block's state.
 */
function renderHud(game, scene) {
    scene.cnotsElement.textContent = String(game.cnots.length).padStart(HUD_DIGIT_COUNT, "0");
    // Between the zap and the measurement nobody knows yet which checks fire.
    let cleanText = "0";
    if (game.isBlockHit && !game.hasMeasured) {
        cleanText = "?";
    } else if (game.isBlockHit) {
        const errorRound = game.errorRounds[game.errorIndex];
        cleanText = String(countCleanChecks([...errorRound.z_syndrome, ...errorRound.x_syndrome], 0));
    } else if (game.report !== null) {
        cleanText = String(countCleanChecks([...game.report.x_checks, ...game.report.z_checks], 1));
    }
    scene.checksElement.textContent = `${cleanText}/${CHECK_TOTAL}`;
    let blockText = "NO";
    if (game.isBlockHit) {
        blockText = "HIT!";
    } else if (game.report !== null && game.report.is_encoded) {
        blockText = "YES";
    }
    scene.blockElement.textContent = blockText;
}


/**
 * What listKeyHints needs to know.
 */
function makeHintView(game) {
    const errorRoundCount = game.errorRounds === null ? 0 : game.errorRounds.length;
    return {
        phase: game.phase, roundIndex: game.roundIndex, roundCnotCount: game.cnots.length - game.roundStartIndex,
        cursorTarget: game.cursorTarget, errorIndex: game.errorIndex, errorRoundCount, fixPauli: game.fixPauli,
        fixPosition: game.fixPosition,
    };
}


startSteaneBlockLevel();
