/**
 * The fiber link used by Levels 1 and 2: the shared QKD link with its "?" block replaced by a telecom tower (the BSM
 * station) on a concrete footing, its two detector lamps D+ and D-, and one photon at each end that the CSS flies to
 * the tower.
 *
 * Looks live in styles/bsm_link.css. Reads and writes nothing; returns new elements.
 */

import { createElement } from "./page_helpers.js";
import { TELECOM_TOWER_SPRITE, drawSprite } from "./pixel_sprites.js";
import { buildQkdLink } from "./qkd/render_qkd_world.js";

// At this size the tower's crossarm sits on the fiber when it stands on its footing (styles/bsm_link.css).
const BSM_TOWER_PIXEL_SIZE = 6;
const PHOTON_SIDES = ["from-left", "from-right"];
// Detector names as the protocols report them, and how each lamp is labelled on screen.
const DETECTOR_LABELS = { "D+": "D+", "D-": "D−" };


/**
 * A link whose BSM is a telecom tower with its two detector lamps, and a photon ready at each end.
 *
 * @returns {HTMLElement} the .link element, also classed bsm-link.
 */
export function buildBsmLink() {
    const linkElement = buildQkdLink();
    linkElement.classList.add("bsm-link");
    const bsmTower = drawSprite(TELECOM_TOWER_SPRITE, BSM_TOWER_PIXEL_SIZE, "bsm-tower");
    const bsmFooting = createElement("div", "bsm-footing");
    linkElement.querySelector(".question-block").replaceWith(bsmFooting, bsmTower);
    const panelElement = createElement("div", "detector-panel");
    for (const [detectorName, label] of Object.entries(DETECTOR_LABELS)) {
        const lampElement = createElement("span", "detector-lamp");
        lampElement.dataset.detector = detectorName;
        lampElement.textContent = label;
        panelElement.append(lampElement);
    }
    linkElement.append(panelElement);
    for (const side of PHOTON_SIDES) {
        linkElement.append(createElement("span", `photon ${side}`));
    }
    return linkElement;
}


/**
 * Light one detector's lamp (or none) and put the other out.
 *
 * @param {HTMLElement} linkElement - from buildBsmLink.
 * @param {string | null} detectorName - "D+", "D-", or null for no click.
 */
export function showDetectorClick(linkElement, detectorName) {
    const litDetectors = detectorName === null ? [] : [detectorName];
    showDetectorClicks(linkElement, litDetectors);
}


/**
 * Light exactly the given detectors' lamps: none, one, or both (two clicks).
 *
 * @param {HTMLElement} linkElement - from buildBsmLink.
 * @param {string[]} detectorNames - any of "D+" and "D-".
 */
export function showDetectorClicks(linkElement, detectorNames) {
    for (const lampElement of linkElement.querySelectorAll(".detector-lamp")) {
        lampElement.classList.toggle("is-lit", detectorNames.includes(lampElement.dataset.detector));
    }
}
