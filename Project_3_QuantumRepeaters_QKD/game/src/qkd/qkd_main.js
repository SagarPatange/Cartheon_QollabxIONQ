/**
 * Level 6 page entry point. The goal types itself out first; then the level opens on the swap tutorial
 * (swap_tutorial_controller.js): Space walks through QRECEC_3QubitRepetition.ipynb's 11 steps and the lesson notes
 * between them, R starts a new run, Esc skips it. After the tutorial the messages unlock: read the settings, send a
 * message through the Python simulator when a button or key asks for one, and play back the steps the backend ran,
 * each with its card in the sky. T plays the tutorial again.
 *
 * Run the backend (npm run backend) and open http://localhost:8001/qkd.html. Reads qkd.html; writes nothing outside
 * the page.
 */

import { buildSendRequest, sendMessage } from "./backend_client.js";
import { findKeyAction, findTutorialCommand } from "./key_actions.js";
import {
    DEFAULT_PHYSICAL_ERROR,
    DEFAULT_QKD_SEED,
    DEFAULT_TAP_FRACTION,
    ENCRYPTED,
    LUIGI,
    MARIO,
    MAX_MESSAGE_BYTES,
    MAX_PHYSICAL_ERROR,
    NEW_RUN,
    NEXT_STEP,
    PHYSICAL_ERROR_DECIMALS,
    PHYSICAL_ERROR_STEP,
    REPLAY_TUTORIAL,
    SKIP_TUTORIAL,
    STEP_DELAY_MS,
    TAP_FRACTION_STEP,
} from "./qkd_constants.js";
import { renderIdle, renderStep } from "./render_qkd_state.js";
import { buildQkdTrack } from "./render_qkd_world.js";
import { buildSwapTutorialScene, showTutorialLayer } from "./render_swap_tutorial.js";
import { showStepCard } from "./step_card.js";
import {
    createTutorial, isTutorialBusy, isTutorialFinished, loadTutorialRun, showNextPage,
} from "./swap_tutorial_controller.js";
import {
    findElementsById, formatPercent, playGoalIntro, readSeed, renderKeyHints, setUpPercentSlider,
} from "../page_helpers.js";

// Until the goal has typed itself out nothing works; then the tutorial runs; then the messages.
const INTRO_MODE = "intro";
const TUTORIAL_MODE = "tutorial";
const MESSAGES_MODE = "messages";
const MESSAGES_KEY_HINTS = [{ key: "T", action: "Swap tutorial" }];


/**
 * Set up the page. The game state lives in one object passed to each handler (no globals).
 */
function startQkdApp() {
    const elements = findQkdElements();
    Object.assign(elements, buildQkdTrack(elements.trackElement));
    elements.tutorialScene = buildSwapTutorialScene(elements);
    elements.actionButtons = document.querySelectorAll(".action-button");
    elements.messageInputs = { [MARIO]: elements.marioInput, [LUIGI]: elements.luigiInput };
    setUpSettingControls(elements);

    const game = { mode: INTRO_MODE, playbackTimer: null, isBusy: false, tutorial: createTutorial() };
    for (const actionButton of elements.actionButtons) {
        const action = { sender: actionButton.dataset.sender, kind: actionButton.dataset.kind };
        actionButton.addEventListener("click", () => requestSend(game, elements, action));
    }
    for (const [sender, messageInput] of Object.entries(elements.messageInputs)) {
        messageInput.addEventListener("keydown", (keyEvent) => {
            if (keyEvent.key === "Enter") {
                requestSend(game, elements, { sender, kind: ENCRYPTED });
            }
        });
    }
    elements.turtleToggle.addEventListener("change", () => showTurtles(elements));
    elements.noiselessToggle.addEventListener("change", () => showNoiseSetting(elements));
    document.addEventListener("keydown", (keyEvent) => handleKey(game, elements, keyEvent));
    showTurtles(elements);
    renderIdle(elements);
    setButtonsEnabled(elements, false);
    // The sky line shows the goal once, at the start; afterwards it only comes back to say something failed.
    playGoalIntro(elements.statusElement).then(() => openTutorial(game, elements, readQkdSeed(elements)));
}


/**
 * Look up every element the page needs, failing fast if qkd.html is missing one.
 */
function findQkdElements() {
    const elements = findElementsById({
        trackElement: "track",
        marioInput: "mario-input",
        luigiInput: "luigi-input",
        turtleToggle: "turtle-toggle",
        tapSlider: "tap-slider",
        tapLabel: "tap-label",
        errorSlider: "error-slider",
        errorLabel: "error-label",
        noiselessToggle: "noiseless-toggle",
        seedInput: "seed-input",
        statusElement: "status-banner",
        keyHintsElement: "key-hints",
        keyElement: "hud-key",
        stepElement: "hud-step",
        qberElement: "hud-qber",
    });
    elements.stepCard = findElementsById({
        cardElement: "step-card",
        counterElement: "step-card-counter",
        titleElement: "step-card-title",
        bodyElement: "step-card-body",
    });
    return elements;
}


/**
 * Give the sliders, seed box and text boxes their starting values and limits.
 */
function setUpSettingControls(elements) {
    const errorRange = {
        max: MAX_PHYSICAL_ERROR, step: PHYSICAL_ERROR_STEP, value: DEFAULT_PHYSICAL_ERROR,
        decimalCount: PHYSICAL_ERROR_DECIMALS,
    };
    setUpPercentSlider(elements.errorSlider, elements.errorLabel, errorRange);
    const tapRange = { max: 1, step: TAP_FRACTION_STEP, value: DEFAULT_TAP_FRACTION };
    setUpPercentSlider(elements.tapSlider, elements.tapLabel, tapRange);
    elements.seedInput.value = String(DEFAULT_QKD_SEED);
    for (const messageInput of Object.values(elements.messageInputs)) {
        messageInput.maxLength = MAX_MESSAGE_BYTES;
    }
}


/**
 * The seed box's value (a broken one falls back to the default).
 */
function readQkdSeed(elements) {
    return readSeed(elements.seedInput, DEFAULT_QKD_SEED);
}


/**
 * The settings the controls show right now.
 */
function readSettings(elements) {
    return {
        seed: readQkdSeed(elements),
        physicalError: readPhysicalError(elements),
        areTurtlesOn: elements.turtleToggle.checked,
        tapFraction: Number(elements.tapSlider.value),
    };
}


/**
 * The error rate p every send uses: exactly 0 while Noiseless is ticked, otherwise the slider's value.
 */
function readPhysicalError(elements) {
    if (elements.noiselessToggle.checked) {
        return 0;
    }
    return Number(elements.errorSlider.value);
}


/**
 * Noiseless locks the slider and says p = 0; unticking it gives the slider's value back.
 */
function showNoiseSetting(elements) {
    const isNoiseless = elements.noiselessToggle.checked;
    elements.errorSlider.disabled = isNoiseless;
    const shownError = isNoiseless ? 0 : Number(elements.errorSlider.value);
    elements.errorLabel.textContent = formatPercent(shownError, PHYSICAL_ERROR_DECIMALS);
}


/**
 * The turtles float over the links whenever the toggle is on, between messages too (not during the tutorial).
 */
function showTurtles(elements) {
    elements.trackElement.classList.toggle("has-turtles", elements.turtleToggle.checked);
}


/**
 * Send each key press to whichever part of the level is on.
 */
function handleKey(game, elements, keyEvent) {
    if (game.mode === TUTORIAL_MODE) {
        handleTutorialKey(game, elements, keyEvent);
    } else if (game.mode === MESSAGES_MODE) {
        handleMessagesKey(game, elements, keyEvent);
    }
}


/**
 * Space shows the next page (after the last one, the messages); R fetches a new run; Esc skips to the messages.
 * Ignored while a page animates or a run loads.
 */
function handleTutorialKey(game, elements, keyEvent) {
    const command = findTutorialCommand(keyEvent, document.activeElement.tagName);
    const commandActions = {
        [NEXT_STEP]: () => advanceTutorial(game, elements),
        [NEW_RUN]: () => openTutorial(game, elements, null),
        [SKIP_TUTORIAL]: () => openMessages(game, elements),
    };
    const action = commandActions[command];
    if (action === undefined) {
        return;
    }
    keyEvent.preventDefault();
    if (!isTutorialBusy(game.tutorial)) {
        action();
    }
}


/**
 * Q W E / I O P fire a send unless the player is typing; T plays the tutorial again once no message is playing.
 */
function handleMessagesKey(game, elements, keyEvent) {
    const isReplay = findTutorialCommand(keyEvent, document.activeElement.tagName) === REPLAY_TUTORIAL;
    if (isReplay) {
        keyEvent.preventDefault();
        if (!game.isBusy) {
            openTutorial(game, elements, readQkdSeed(elements));
        }
        return;
    }
    const action = findKeyAction(keyEvent, document.activeElement.tagName);
    if (action === null) {
        return;
    }
    keyEvent.preventDefault();
    requestSend(game, elements, action);
}


/**
 * Put the tutorial on (sends locked, the castles show their qubit slots) and fetch a run. If the backend is down,
 * say so in the sky line; R tries again and Esc still reaches the messages.
 *
 * @param {number | null} seed - null lets the server pick one (a new run).
 */
async function openTutorial(game, elements, seed) {
    game.mode = TUTORIAL_MODE;
    setButtonsEnabled(elements, false);
    renderIdle(elements);
    showTutorialLayer(elements.tutorialScene, true);
    hideProblem(elements);
    try {
        await loadTutorialRun(game.tutorial, elements, seed);
    } catch (error) {
        showProblem(elements, `Can't reach the simulator: ${error.message}`);
    }
}


/**
 * The next tutorial page; after the last one, Space moves on to the messages. The goal line makes way for the card.
 */
async function advanceTutorial(game, elements) {
    if (isTutorialFinished(game.tutorial)) {
        openMessages(game, elements);
        return;
    }
    fadeGoal(elements);
    await showNextPage(game.tutorial, elements);
}


/**
 * The tutorial is put away and the sends unlock.
 */
function openMessages(game, elements) {
    game.mode = MESSAGES_MODE;
    showTutorialLayer(elements.tutorialScene, false);
    renderIdle(elements);
    hideProblem(elements);
    setButtonsEnabled(elements, true);
    renderKeyHints(elements.keyHintsElement, MESSAGES_KEY_HINTS);
}


/**
 * Send the sender's text through the backend and play back what it ran. Ignored outside the messages and while a
 * message is playing.
 */
async function requestSend(game, elements, action) {
    if (game.isBusy || game.mode !== MESSAGES_MODE) {
        return;
    }
    const text = elements.messageInputs[action.sender].value;
    let requestBody;
    try {
        requestBody = buildSendRequest(action, text, readSettings(elements));
    } catch (error) {
        showProblem(elements, `Can't send that: ${error.message}`);
        return;
    }
    setBusy(game, elements, true);
    hideProblem(elements);
    renderIdle(elements);
    let response;
    try {
        response = await sendMessage(requestBody);
    } catch (error) {
        showProblem(elements, `The simulator failed: ${error.message}`);
        setBusy(game, elements, false);
        return;
    }
    fadeGoal(elements);
    playResponse(game, elements, response);
}


/**
 * Show the response's steps one at a time on a timer, then allow the next message.
 */
function playResponse(game, elements, response) {
    let stepIndex = 0;
    renderStep(response, stepIndex, elements);
    game.playbackTimer = setInterval(() => {
        stepIndex += 1;
        if (stepIndex >= response.steps.length) {
            clearInterval(game.playbackTimer);
            game.playbackTimer = null;
            setBusy(game, elements, false);
            return;
        }
        renderStep(response, stepIndex, elements);
    }, STEP_DELAY_MS);
}


/**
 * The goal is only shown at the start: once the first card goes up, the goal line fades at once to make room.
 */
function fadeGoal(elements) {
    elements.statusElement.classList.add("is-faded");
}


/**
 * Bring the sky line back, in red, saying what went wrong. The card steps aside for it.
 */
function showProblem(elements, problemText) {
    showStepCard(elements.stepCard, null);
    elements.statusElement.textContent = problemText;
    elements.statusElement.classList.remove("is-faded");
    elements.statusElement.classList.add("is-problem");
    if (elements.trackElement.classList.contains("is-tutorial")) {
        showTutorialProblemHints(elements);
    }
}


/**
 * While the tutorial is on, a problem still leaves R (try again) and Esc (skip) in the key hints.
 */
function showTutorialProblemHints(elements) {
    renderKeyHints(elements.keyHintsElement, [
        { key: "R", action: "Try again" },
        { key: "Esc", action: "Skip to messages" },
    ]);
}


/**
 * Once a send or a run goes through, put a problem away (the goal itself is only shown at the start).
 */
function hideProblem(elements) {
    if (elements.statusElement.classList.contains("is-problem")) {
        elements.statusElement.classList.remove("is-problem");
        elements.statusElement.classList.add("is-faded");
    }
}


/**
 * Lock or unlock the send buttons while a message is in flight.
 */
function setBusy(game, elements, isBusy) {
    game.isBusy = isBusy;
    setButtonsEnabled(elements, !isBusy);
    renderKeyHints(elements.keyHintsElement, isBusy ? [] : MESSAGES_KEY_HINTS);
}


/**
 * The send buttons work only in the messages, and not while one is playing.
 */
function setButtonsEnabled(elements, areEnabled) {
    for (const actionButton of elements.actionButtons) {
        actionButton.disabled = !areEnabled;
    }
}


startQkdApp();
