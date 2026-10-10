/**
 * Messaging page entry point: read the settings, send a message through the Python simulator when a button or key
 * asks for one, and play back the steps the backend ran. The goal types itself out first; sends work once it has.
 *
 * Run the backend (npm run backend) and open http://localhost:8001/qkd.html. Reads qkd.html; writes nothing outside
 * the page.
 */

import { buildSendRequest, sendMessage } from "./backend_client.js";
import { findKeyAction } from "./key_actions.js";
import {
    DEFAULT_PHYSICAL_ERROR,
    DEFAULT_QKD_SEED,
    DEFAULT_TAP_FRACTION,
    ENCRYPTED,
    LUIGI,
    MARIO,
    MAX_MESSAGE_BYTES,
    MAX_PHYSICAL_ERROR,
    PHYSICAL_ERROR_STEP,
    STEP_DELAY_MS,
    TAP_FRACTION_STEP,
} from "./qkd_constants.js";
import { buildQkdTrack } from "./render_qkd_world.js";
import { renderIdle, renderStep } from "./render_qkd_state.js";
import { findElementsById, playGoalIntro, readSeed, setUpPercentSlider } from "../page_helpers.js";



/**
 * Set up the page. The playback state lives in one object passed to each handler (no globals).
 */
function startQkdApp() {
    const elements = findQkdElements();
    Object.assign(elements, buildQkdTrack(elements.trackElement));
    elements.actionButtons = document.querySelectorAll(".action-button");
    elements.messageInputs = { [MARIO]: elements.marioInput, [LUIGI]: elements.luigiInput };
    setUpSettingControls(elements);

    // isStarted stays false until the goal has typed itself out; until then sends are ignored.
    const game = { playbackTimer: null, isBusy: false, isStarted: false };
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
    document.addEventListener("keydown", (keyEvent) => handleActionKey(game, elements, keyEvent));
    showTurtles(elements);
    renderIdle(elements);
    // The sky line shows the goal once, at the start; afterwards it only comes back to say a send failed.
    playGoalIntro(elements.statusElement).then(() => {
        game.isStarted = true;
    });
}


/**
 * Look up every element the page needs, failing fast if qkd.html is missing one.
 */
function findQkdElements() {
    return findElementsById({
        trackElement: "track",
        marioInput: "mario-input",
        luigiInput: "luigi-input",
        turtleToggle: "turtle-toggle",
        tapSlider: "tap-slider",
        tapLabel: "tap-label",
        errorSlider: "error-slider",
        errorLabel: "error-label",
        seedInput: "seed-input",
        statusElement: "status-banner",
        keyElement: "hud-key",
        stepElement: "hud-step",
        qberElement: "hud-qber",
    });
}


/**
 * Give the sliders, seed box and text boxes their starting values and limits.
 */
function setUpSettingControls(elements) {
    const errorRange = { max: MAX_PHYSICAL_ERROR, step: PHYSICAL_ERROR_STEP, value: DEFAULT_PHYSICAL_ERROR };
    setUpPercentSlider(elements.errorSlider, elements.errorLabel, errorRange);
    const tapRange = { max: 1, step: TAP_FRACTION_STEP, value: DEFAULT_TAP_FRACTION };
    setUpPercentSlider(elements.tapSlider, elements.tapLabel, tapRange);
    elements.seedInput.value = String(DEFAULT_QKD_SEED);
    for (const messageInput of Object.values(elements.messageInputs)) {
        messageInput.maxLength = MAX_MESSAGE_BYTES;
    }
}


/**
 * The settings the controls show right now.
 */
function readSettings(elements) {
    return {
        seed: readSeed(elements.seedInput, DEFAULT_QKD_SEED),
        physicalError: Number(elements.errorSlider.value),
        areTurtlesOn: elements.turtleToggle.checked,
        tapFraction: Number(elements.tapSlider.value),
    };
}


/**
 * The turtles float over the links whenever the toggle is on, between messages too.
 */
function showTurtles(elements) {
    elements.trackElement.classList.toggle("has-turtles", elements.turtleToggle.checked);
}


/**
 * Q W E / I O P fire an action unless the player is typing.
 */
function handleActionKey(game, elements, keyEvent) {
    const action = findKeyAction(keyEvent, document.activeElement.tagName);
    if (action === null) {
        return;
    }
    keyEvent.preventDefault();
    requestSend(game, elements, action);
}


/**
 * Send the sender's text through the backend and play back what it ran. Ignored while a message is playing.
 */
async function requestSend(game, elements, action) {
    if (game.isBusy || !game.isStarted) {
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
 * Bring the sky line back, in red, saying what went wrong.
 */
function showProblem(elements, problemText) {
    renderIdle(elements);
    elements.statusElement.textContent = problemText;
    elements.statusElement.classList.remove("is-faded");
    elements.statusElement.classList.add("is-problem");
}


/**
 * Once a send goes through, put a problem away (the goal itself is only shown at the start).
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
    for (const actionButton of elements.actionButtons) {
        actionButton.disabled = isBusy;
    }
}


startQkdApp();
