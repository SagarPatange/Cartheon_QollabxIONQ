/**
 * Paging through the panels of Toad's huts (BB84 and QEC): which panel a key or button leads to, and the counter.
 * Pure; hut_pager.js does the drawing.
 */


/**
 * The panel after this one, staying on the last.
 *
 * @param {number} panelIndex - index into the panels.
 * @param {number} panelCount - how many panels there are.
 * @returns {number}
 */
export function findNextPanelIndex(panelIndex, panelCount) {
    return Math.min(panelIndex + 1, panelCount - 1);
}


/**
 * The panel before this one, staying on the first.
 *
 * @param {number} panelIndex - index into the panels.
 * @returns {number}
 */
export function findPreviousPanelIndex(panelIndex) {
    return Math.max(panelIndex - 1, 0);
}


/**
 * Where the player is in the panels, for the page counter, e.g. "2 / 6".
 *
 * @param {number} panelIndex - index into the panels.
 * @param {number} panelCount - how many panels there are.
 * @returns {string}
 */
export function describePanelPosition(panelIndex, panelCount) {
    return `${panelIndex + 1} / ${panelCount}`;
}


/**
 * Which way a key pages: "next" for Space, Enter or →, "previous" for ← or Backspace, otherwise null.
 *
 * @param {string} key - KeyboardEvent.key.
 * @returns {"next" | "previous" | null}
 */
export function findPageStep(key) {
    const isNextKey = key === " " || key === "Enter" || key === "ArrowRight";
    if (isNextKey) {
        return "next";
    }
    const isPreviousKey = key === "ArrowLeft" || key === "Backspace";
    if (isPreviousKey) {
        return "previous";
    }
    return null;
}


/**
 * The panel a page step leads to.
 *
 * @param {number} panelIndex - index into the panels.
 * @param {"next" | "previous"} pageStep - from findPageStep.
 * @param {number} panelCount - how many panels there are.
 * @returns {number}
 */
export function applyPageStep(panelIndex, pageStep, panelCount) {
    if (pageStep === "next") {
        return findNextPanelIndex(panelIndex, panelCount);
    }
    return findPreviousPanelIndex(panelIndex);
}
