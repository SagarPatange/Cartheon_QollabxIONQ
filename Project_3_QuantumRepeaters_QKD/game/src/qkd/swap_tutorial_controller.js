/**
 * Run Level 6's swap tutorial: fetch one run of the notebook's chain from the simulator, then show its pages one Space
 * press at a time (swap_tutorial_plan.js says what each page holds, render_swap_tutorial.js draws it). The tutorial's
 * state lives in one object made by createTutorial; qkd_main.js decides when the tutorial is on.
 *
 * Writes the page's step card, key hints, HUD step counter and the tutorial layer of the world.
 */

import { requestSwapTutorial } from "./backend_client.js";
import { playTutorialPage, renderTutorialScene, resetTutorialScene } from "./render_swap_tutorial.js";
import { showStepCard } from "./step_card.js";
import { NOTE_PAGE, STEP_COUNT, buildTutorialPages, listTutorialKeyHints } from "./swap_tutorial_plan.js";
import { renderKeyHints } from "../page_helpers.js";


/**
 * A tutorial with no run loaded yet.
 *
 * @returns {{response: object | null, pages: object[], pageCount: number, isLoading: boolean, isBusy: boolean}}
 *     pageCount is how many pages have been shown; isBusy is true while a page animates.
 */
export function createTutorial() {
    return { response: null, pages: [], pageCount: 0, isLoading: false, isBusy: false };
}


/**
 * Fetch a run and draw the world before Step 1. Throws if the simulator cannot be reached; the tutorial is then left
 * with no pages.
 *
 * @param {object} tutorial - from createTutorial.
 * @param {object} elements - the page's elements (qkd_main.js).
 * @param {number | null} seed - null lets the server pick one.
 */
export async function loadTutorialRun(tutorial, elements, seed) {
    Object.assign(tutorial, createTutorial(), { isLoading: true });
    resetTutorialScene(elements.tutorialScene);
    showStepCard(elements.stepCard, null);
    renderTutorialChrome(tutorial, elements);
    try {
        tutorial.response = await requestSwapTutorial(seed);
        tutorial.pages = buildTutorialPages(tutorial.response);
        renderTutorialScene(elements.tutorialScene, tutorial.response, 0, []);
    } finally {
        tutorial.isLoading = false;
        renderTutorialChrome(tutorial, elements);
    }
}


/**
 * Is every page shown (or is there no run to show)?
 */
export function isTutorialFinished(tutorial) {
    return tutorial.pageCount >= tutorial.pages.length;
}


/**
 * Is the tutorial in the middle of something (loading a run, or animating a page)? Keys wait until it is not.
 */
export function isTutorialBusy(tutorial) {
    return tutorial.isLoading || tutorial.isBusy;
}


/**
 * Show the next page: its card goes up at once, so it can be read while its animation plays.
 *
 * @param {object} tutorial
 * @param {object} elements
 */
export async function showNextPage(tutorial, elements) {
    if (isTutorialBusy(tutorial) || isTutorialFinished(tutorial)) {
        return;
    }
    const page = tutorial.pages[tutorial.pageCount];
    tutorial.isBusy = true;
    showStepCard(elements.stepCard, {
        counter: page.counter, title: page.title, lines: page.lines, isPaused: page.kind === NOTE_PAGE,
    });
    elements.stepElement.textContent = `${page.stepNumber}/${STEP_COUNT}`;
    renderTutorialChrome(tutorial, elements);
    await playTutorialPage(elements.tutorialScene, tutorial.response, page);
    tutorial.pageCount += 1;
    tutorial.isBusy = false;
    renderTutorialChrome(tutorial, elements);
}


/**
 * The key hints: what Space does next, or nothing while a page animates.
 */
export function renderTutorialChrome(tutorial, elements) {
    const hints = tutorial.isBusy ? [] : listTutorialKeyHints(tutorial);
    renderKeyHints(elements.keyHintsElement, hints);
}
