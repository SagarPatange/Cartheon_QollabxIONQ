/**
 * Scroll hints on the overworld map: arrows pinned to the edges of the map view that tell the player the map
 * goes on (Level 3's road runs far right to Peach's castle) and scroll it most of a view-width when clicked.
 *
 * Loaded by start.html as its own module, independent of start_main.js. Reads #map-viewport, #world-map,
 * #scroll-hint-right and #scroll-hint-left; changes only the hints' `hidden` flags and the viewport's scroll.
 */

import { findElementsById } from "../page_helpers.js";
import { findScrollStepPx, shouldShowScrollLeftHint, shouldShowScrollRightHint } from "./scroll_hint.js";


/**
 * Show or hide both hints to match where the view is scrolled.
 *
 * @param {{mapViewport: HTMLElement, rightHint: HTMLElement, leftHint: HTMLElement}} elements
 */
function updateScrollHints(elements) {
    const { scrollLeft, clientWidth, scrollWidth } = elements.mapViewport;
    elements.rightHint.hidden = !shouldShowScrollRightHint(scrollLeft, clientWidth, scrollWidth);
    elements.leftHint.hidden = !shouldShowScrollLeftHint(scrollLeft);
}


/**
 * Scroll the map view one step left or right.
 *
 * @param {HTMLElement} mapViewport
 * @param {number} direction - 1 for right, -1 for left.
 */
function scrollMapOneStep(mapViewport, direction) {
    const stepPx = findScrollStepPx(mapViewport.clientWidth);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = prefersReducedMotion ? "auto" : "smooth";
    mapViewport.scrollBy({ left: direction * stepPx, behavior });
}


/**
 * Find the hint elements, wire up the clicks, and keep the hints in step with scrolling and resizing.
 */
function startScrollHints() {
    const elements = findElementsById({
        mapViewport: "map-viewport",
        worldMap: "world-map",
        rightHint: "scroll-hint-right",
        leftHint: "scroll-hint-left",
    });
    elements.rightHint.addEventListener("click", () => scrollMapOneStep(elements.mapViewport, 1));
    elements.leftHint.addEventListener("click", () => scrollMapOneStep(elements.mapViewport, -1));

    const update = () => updateScrollHints(elements);
    elements.mapViewport.addEventListener("scroll", update, { passive: true });
    // Watching both boxes covers the window resizing, the map screen being unhidden (its width goes from 0 to
    // real), and the map being drawn after this module runs (the map's width grows).
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(elements.mapViewport);
    resizeObserver.observe(elements.worldMap);
    update();
}


startScrollHints();
