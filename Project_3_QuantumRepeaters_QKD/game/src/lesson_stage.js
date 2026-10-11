/**
 * The page code Levels 3 and 4 share: fit the lesson board into the room between the sky line and the ground, fly the
 * cloud turtle over it, put a problem (the simulator is down) in the sky line, and talk to the simulator.
 *
 * Reads the level page's elements passed in; writes only those.
 */

import { findPictureScale } from "./fit_picture.js";
import { callSimulator } from "./simulator_bridge.js";

// The board is SVG and text, which stay sharp when enlarged, so on a big window it grows up to this much.
const MAX_BOARD_SCALE = 1.5;
// Match turtle-fly (1.4 s) and zap-flash (4 × 0.25 s) in styles/lesson_level.css: the zap lands as the turtle reaches
// the board and flashes until it has flown past.
const TURTLE_FLIGHT_MS = 1400;
const ZAP_DELAY_MS = 400;
const ZAP_FLASH_MS = 1000;


/**
 * Zoom the board so it fills its stage without scrolling (never below fit_picture.js's readable minimum).
 *
 * @param {HTMLElement} stageElement - the flexible area between the sky line and the ground.
 * @param {HTMLElement} contentElement - the board and the message under it, zoomed as one.
 */
export function fitBoardToStage(stageElement, contentElement) {
    contentElement.style.zoom = "1";
    const contentSize = { widthPx: contentElement.scrollWidth, heightPx: contentElement.scrollHeight };
    // The stage's padding keeps the sides clear for Mario and Luigi (styles/lesson_level.css).
    const stageStyle = window.getComputedStyle(stageElement);
    const paddingXPx = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
    const paddingYPx = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
    const roomSize = {
        widthPx: stageElement.clientWidth - paddingXPx,
        heightPx: stageElement.clientHeight - paddingYPx,
    };
    contentElement.style.zoom = String(findPictureScale(contentSize, roomSize, MAX_BOARD_SCALE));
}


/**
 * Does the viewer ask for less motion? Animations then jump to their end.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


/**
 * Resolve after ms milliseconds (at once with reduced motion).
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function waitMs(ms) {
    const delayMs = prefersReducedMotion() ? 0 : ms;
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}


/**
 * The cloud turtle flies across the sky and zaps something on the board, which flashes while it passes. Resolves when
 * the turtle has gone.
 *
 * @param {HTMLElement} turtleElement - the .lesson-turtle holding its sprite.
 * @param {Element} zappedElement - what flashes.
 */
export async function playTurtleZap(turtleElement, zappedElement) {
    turtleElement.classList.remove("is-flying");
    // Reading offsetWidth restarts the CSS animation on the next class change.
    void turtleElement.offsetWidth;
    turtleElement.classList.add("is-flying");
    await waitMs(ZAP_DELAY_MS);
    zappedElement.classList.add("is-zapped");
    await waitMs(ZAP_FLASH_MS);
    zappedElement.classList.remove("is-zapped");
    await waitMs(TURTLE_FLIGHT_MS - ZAP_DELAY_MS - ZAP_FLASH_MS);
    turtleElement.classList.remove("is-flying");
}


/**
 * Bring the sky line back, in red, saying what went wrong.
 *
 * @param {HTMLElement} statusElement - the .sky-status line.
 * @param {string} problemText
 */
export function showSkyProblem(statusElement, problemText) {
    statusElement.textContent = problemText;
    statusElement.classList.remove("is-faded");
    statusElement.classList.add("is-problem");
}


/**
 * Once things work again, put a problem away (the goal itself is only shown at the start).
 *
 * @param {HTMLElement} statusElement
 */
export function hideSkyProblem(statusElement) {
    if (statusElement.classList.contains("is-problem")) {
        statusElement.classList.remove("is-problem");
        statusElement.classList.add("is-faded");
    }
}


/**
 * POST a JSON body to one of the simulator's endpoints and return its JSON answer.
 *
 * @param {string} apiPath - e.g. "/api/steane-block".
 * @param {object} body
 * @returns {Promise<object>}
 * @throws {Error} when the backend is not running or refuses the request.
 */
export async function postToSimulator(apiPath, body) {
    return callSimulator(apiPath, body);
}
