/**
 * Toad's BB84 hut page: draws Toad beside his speech and pages through the BB84 panels from bb84_hut_panels.js,
 * each with its picture from bb84_hut_pictures.js, with Space, Enter, the arrow keys or the Back / Next buttons.
 *
 * Reads bb84_hut.html; writes nothing outside the page.
 */

import { findElementsById } from "../page_helpers.js";
import { TOAD_SPRITE, drawSprite } from "../pixel_sprites.js";
import {
    AWARD_SOURCE, AWARD_SOURCE_URL, BB84_PANELS, BB84_SOURCE, WIKIPEDIA_URL, applyPageStep, describePanelPosition,
    findPageStep,
} from "./bb84_hut_panels.js";
import { buildPanelPicture } from "./bb84_hut_pictures.js";
import { findPictureScale } from "./fit_picture.js";

const TOAD_PIXEL_SIZE = 8;


/**
 * Draw Toad, show the first panel and wire the buttons and keys.
 */
function startBb84Hut() {
    const elements = findElementsById({
        toadElement: "toad",
        headingElement: "panel-heading",
        linesElement: "panel-lines",
        counterElement: "panel-counter",
        previousButton: "previous-button",
        nextButton: "next-button",
        sourceElement: "panel-source",
        awardLink: "award-source-link",
        wikipediaLink: "wikipedia-link",
        pictureElement: "panel-picture",
    });
    elements.toadElement.append(drawSprite(TOAD_SPRITE, TOAD_PIXEL_SIZE, "toad-sprite"));
    elements.sourceElement.textContent = `Source: ${BB84_SOURCE}`;
    elements.awardLink.textContent = `Award: ${AWARD_SOURCE} (new tab)`;
    elements.awardLink.href = AWARD_SOURCE_URL;
    elements.wikipediaLink.href = WIKIPEDIA_URL;
    const hut = { panelIndex: 0 };
    elements.previousButton.addEventListener("click", () => pageTo(hut, elements, "previous"));
    elements.nextButton.addEventListener("click", () => pageTo(hut, elements, "next"));
    document.addEventListener("keydown", (event) => handleKey(hut, elements, event));
    window.addEventListener("resize", () => fitPictureToBox(elements.pictureElement));
    // The pixel font loads after the first layout and changes the picture's size, so fit it again then.
    document.fonts.ready.then(() => fitPictureToBox(elements.pictureElement));
    renderPanel(hut, elements);
}


/**
 * Page with the keyboard. A focused button or link handles its own Space and Enter, so those keys are left to it.
 */
function handleKey(hut, elements, event) {
    const pageStep = findPageStep(event.key);
    if (pageStep === null) {
        return;
    }
    const isOnControl = event.target.closest("button, a") !== null;
    const isActivationKey = event.key === " " || event.key === "Enter";
    if (isOnControl && isActivationKey) {
        return;
    }
    event.preventDefault();
    pageTo(hut, elements, pageStep);
}


/**
 * Move one panel forward or back and show it.
 */
function pageTo(hut, elements, pageStep) {
    hut.panelIndex = applyPageStep(hut.panelIndex, pageStep, BB84_PANELS.length);
    renderPanel(hut, elements);
}


/**
 * Show the current panel's heading and lines, the counter, and which buttons can still be used.
 */
function renderPanel(hut, elements) {
    const panel = BB84_PANELS[hut.panelIndex];
    elements.headingElement.textContent = panel.heading;
    const lineElements = [];
    for (const line of panel.lines) {
        const lineElement = document.createElement("p");
        lineElement.textContent = line;
        lineElements.push(lineElement);
    }
    elements.linesElement.replaceChildren(...lineElements);
    elements.pictureElement.replaceChildren(buildPanelPicture(panel.picture));
    fitPictureToBox(elements.pictureElement);
    elements.counterElement.textContent = describePanelPosition(hut.panelIndex, BB84_PANELS.length);
    const isFirstPanel = hut.panelIndex === 0;
    const isLastPanel = hut.panelIndex === BB84_PANELS.length - 1;
    elements.previousButton.disabled = isFirstPanel;
    elements.nextButton.disabled = isLastPanel;
    keepFocusOnAButton(elements);
}


/**
 * Shrink the picture (CSS zoom) to the room its box has, so the whole panel fits the window without scrolling.
 *
 * @param {HTMLElement} pictureElement - the #panel-picture box, holding one picture.
 */
function fitPictureToBox(pictureElement) {
    const contentElement = pictureElement.firstElementChild;
    contentElement.style.zoom = "1";
    const boxStyle = window.getComputedStyle(pictureElement);
    const paddingXPx = parseFloat(boxStyle.paddingLeft) + parseFloat(boxStyle.paddingRight);
    const paddingYPx = parseFloat(boxStyle.paddingTop) + parseFloat(boxStyle.paddingBottom);
    const boxSize = {
        widthPx: pictureElement.clientWidth - paddingXPx,
        heightPx: pictureElement.clientHeight - paddingYPx,
    };
    const contentSize = { widthPx: contentElement.scrollWidth, heightPx: contentElement.scrollHeight };
    contentElement.style.zoom = String(findPictureScale(contentSize, boxSize));
}


/**
 * A button that just got disabled drops the keyboard focus; hand it to the other button so Tab order is not lost.
 */
function keepFocusOnAButton(elements) {
    if (document.activeElement === elements.nextButton && elements.nextButton.disabled) {
        elements.previousButton.focus();
    }
    if (document.activeElement === elements.previousButton && elements.previousButton.disabled) {
        elements.nextButton.focus();
    }
}


startBb84Hut();
