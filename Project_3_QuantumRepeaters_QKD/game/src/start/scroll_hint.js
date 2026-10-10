/**
 * Rules for the overworld map's scroll hints: when each arrow shows and how far a click scrolls.
 *
 * Pure functions with no DOM, so they can be tested in node; src/start/scroll_hint_main.js wires them to the page.
 */

// Within this many pixels of an end counts as "at the end": browsers report fractional scroll positions on
// zoomed or high-DPI screens, so scrollLeft can stop a pixel or two short of the true maximum.
export const SCROLL_END_THRESHOLD_PX = 8;

// One click scrolls most of a view-width, leaving a strip of what was visible so the player keeps their place.
export const SCROLL_STEP_FRACTION = 0.8;


/**
 * Should the "more this way" arrow on the right show?
 *
 * @param {number} scrollLeft - how far the view is scrolled from the left, in pixels.
 * @param {number} clientWidth - the visible width of the view, in pixels.
 * @param {number} scrollWidth - the full width of the map, in pixels.
 * @returns {boolean} true when there is more map to the right than the threshold.
 */
export function shouldShowScrollRightHint(scrollLeft, clientWidth, scrollWidth) {
    const hiddenToTheRightPx = scrollWidth - clientWidth - scrollLeft;
    return hiddenToTheRightPx > SCROLL_END_THRESHOLD_PX;
}


/**
 * Should the "back this way" arrow on the left show?
 *
 * @param {number} scrollLeft - how far the view is scrolled from the left, in pixels.
 * @returns {boolean} true when there is more map to the left than the threshold.
 */
export function shouldShowScrollLeftHint(scrollLeft) {
    return scrollLeft > SCROLL_END_THRESHOLD_PX;
}


/**
 * How far one click on a hint scrolls the view.
 *
 * @param {number} clientWidth - the visible width of the view, in pixels.
 * @returns {number} pixels to scroll, always positive.
 */
export function findScrollStepPx(clientWidth) {
    return Math.round(clientWidth * SCROLL_STEP_FRACTION);
}
