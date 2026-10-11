/**
 * Draw one playback step of a backend response onto the elements built by render_qkd_world.js: the castles' qubit
 * slots show what one logical pair has been through, and the card in the sky gives the step's title and detail.
 *
 * The track gets data-phase (the current step, which drives the one-off animations), data-direction and a
 * reached-<phase> class for every step played so far (which drives what stays on screen). The look of each lives in
 * styles/qkd.css.
 */

import { describeMessageSlots } from "./chain_slots.js";
import { ENCRYPTED, LUIGI, MARIO } from "./qkd_constants.js";
import { drawSlots } from "./render_swap_tutorial.js";
import { showStepCard } from "./step_card.js";
import { formatPercent } from "../page_helpers.js";

// Every phase the backend can send (PHASES in backend/src/quantum_bros/protocol/steps.py).
const ALL_PHASES = [
    "heralding", "encoding", "teleported_cnot", "encoded_swapping", "frame_correction", "qkd_measure", "sifting",
    "error_check", "abort", "encrypt", "classical_send", "decrypt", "teleport", "deliver",
];

// The HUD key counter is zero-padded like an arcade score.
const HUD_DIGIT_COUNT = 3;


/**
 * Show the page before any message, or after an error.
 *
 * @param {object} elements - element references from qkd_main.js.
 */
export function renderIdle(elements) {
    const trackElement = elements.trackElement;
    delete trackElement.dataset.phase;
    delete trackElement.dataset.direction;
    for (const phase of ALL_PHASES) {
        trackElement.classList.remove(`reached-${phase}`);
    }
    for (const stationElement of Object.values(elements.stationElements)) {
        showBubble(stationElement.querySelector(".station-bubble"), null);
    }
    for (const linkElement of elements.linkElements) {
        showBubble(linkElement.querySelector(".turtle-bubble"), null);
    }
    showStepCard(elements.stepCard, null);
    drawSlots(elements.tutorialScene, describeMessageSlots(new Set()), []);
    elements.stepElement.textContent = "--";
}


/**
 * Draw the response as it looks after its first stepIndex + 1 steps.
 *
 * @param {object} response - SendResponse JSON from the backend.
 * @param {number} stepIndex - 0-based index into response.steps.
 * @param {object} elements
 */
export function renderStep(response, stepIndex, elements) {
    const currentStep = response.steps[stepIndex];
    const reachedPhases = new Set();
    for (let i = 0; i <= stepIndex; i++) {
        reachedPhases.add(response.steps[i].phase);
    }
    renderTrack(elements.trackElement, response, currentStep.phase, reachedPhases);
    drawSlots(elements.tutorialScene, describeMessageSlots(reachedPhases), []);
    renderBubbles(response, reachedPhases, elements);
    renderQkdHud(response, stepIndex, reachedPhases, elements);
    showResultCard(elements.stepCard, response, stepIndex, findResult(response, reachedPhases));
}


/**
 * Phase, direction and kind attributes plus one reached-<phase> class per played step.
 */
function renderTrack(trackElement, response, currentPhase, reachedPhases) {
    trackElement.dataset.phase = currentPhase;
    trackElement.dataset.direction = response.sender === MARIO ? "to-luigi" : "to-mario";
    trackElement.dataset.kind = response.kind;
    for (const phase of ALL_PHASES) {
        trackElement.classList.toggle(`reached-${phase}`, reachedPhases.has(phase));
    }
}


/**
 * The sender says the message from the start, the turtles say what they read off the channel, and the receiver
 * says what arrived.
 */
function renderBubbles(response, reachedPhases, elements) {
    const senderBubble = elements.stationElements[response.sender].querySelector(".station-bubble");
    const receiverBubble = elements.stationElements[response.receiver].querySelector(".station-bubble");
    showBubble(senderBubble, response.text_sent);
    const hasDelivered = reachedPhases.has("deliver");
    showBubble(receiverBubble, hasDelivered ? response.text_received : null);

    const isChannelInUse = reachedPhases.has("classical_send") || reachedPhases.has("teleport");
    let turtleText = null;
    if (isChannelInUse && response.channel_view !== null) {
        turtleText = response.channel_view;
    }
    for (const linkElement of elements.linkElements) {
        showBubble(linkElement.querySelector(".turtle-bubble"), turtleText);
    }
}


/**
 * Put text in a speech bubble, or hide it when text is null.
 *
 * @param {HTMLElement} bubbleElement
 * @param {string | null} text
 */
function showBubble(bubbleElement, text) {
    const isVisible = text !== null;
    bubbleElement.classList.toggle("is-visible", isVisible);
    bubbleElement.textContent = isVisible ? text : "";
}


/**
 * How the message ended, once it has: the line the card leads with, and whether the turtles stopped it. Null while
 * the message is still on its way.
 *
 * @returns {{isAborted: boolean, text: string} | null}
 */
function findResult(response, reachedPhases) {
    if (reachedPhases.has("abort")) {
        const qberText = formatPercent(response.qkd.qber);
        return { isAborted: true, text: `✖ TURTLE DETECTED! QBER ${qberText}` };
    }
    if (!reachedPhases.has("deliver")) {
        return null;
    }
    const receiverName = response.receiver === LUIGI ? "PEACH" : "MARIO";
    return { isAborted: false, text: `★ MESSAGE FOR ${receiverName}! ★` };
}


/**
 * The card in the sky for the current step. Once the message has ended, the card leads with the result instead of
 * the step counter, in gold for a delivered message and in red when the turtles were caught.
 *
 * @param {object} card - the step card's elements.
 * @param {object} response
 * @param {number} stepIndex
 * @param {{isAborted: boolean, text: string} | null} result - from findResult.
 */
function showResultCard(card, response, stepIndex, result) {
    const currentStep = response.steps[stepIndex];
    let counter = `STEP ${stepIndex + 1}/${response.steps.length}`;
    let tone = null;
    if (result !== null) {
        counter = result.text;
        tone = result.isAborted ? "lose" : "win";
    }
    showStepCard(card, { counter, title: currentStep.title, lines: [[currentStep.detail]], tone });
}


/**
 * Top bar: key length and QBER once the error check has run, and the step counter.
 */
function renderQkdHud(response, stepIndex, reachedPhases, elements) {
    let keyLength = 0;
    let qberText = "--";
    const hasChecked = response.kind === ENCRYPTED && reachedPhases.has("error_check");
    if (hasChecked) {
        keyLength = response.qkd.is_aborted ? 0 : response.qkd.alice_key.length;
        qberText = formatPercent(response.qkd.qber);
    }
    elements.keyElement.textContent = String(keyLength).padStart(HUD_DIGIT_COUNT, "0");
    elements.qberElement.textContent = qberText;
    elements.stepElement.textContent = `${stepIndex + 1}/${response.steps.length}`;
}
