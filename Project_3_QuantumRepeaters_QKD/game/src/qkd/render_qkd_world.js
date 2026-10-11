/**
 * Build the messaging world once: Mario on the ground left of Alice, three towers (Alice, Bob, Charlie) with water
 * between them, a BSM telecom tower on a pier and a cloud turtle on every link, Peach on the ground right of Charlie,
 * plus the envelope and the end-to-end beam. (A message's result goes in the card in the sky, not over the scene.)
 *
 * render_qkd_state.js changes classes and text on these elements later. Fills the empty #track container from
 * qkd.html.
 */

import { LUIGI, MARIO, QKD_TOWER_NAMES } from "./qkd_constants.js";
import { createElement } from "../page_helpers.js";
import { CLOUD_TURTLE_SPRITE, MARIO_SPRITE, PEACH_SPRITE, TELECOM_TOWER_SPRITE, drawSprite } from "../pixel_sprites.js";

// Plumbers are 12×16 sprite pixels; 4 screen pixels each makes them 48×64 on screen.
const PLUMBER_PIXEL_SIZE = 4;
const TURTLE_PIXEL_SIZE = 3;
// The BSM telecom tower over the water: 15×27 sprite pixels at 4 screen pixels; its crossarm meets the fiber when it
// stands on its pier (styles/qkd.css).
const BSM_TOWER_PIXEL_SIZE = 4;
// How many coins a link shows while heralding: one per physical Bell pair of a 3-qubit repetition block.
const COINS_SHOWN_PER_LINK = 3;


/**
 * Fill the track: station, towers and links in turn, station, then the overlays.
 *
 * @param {HTMLElement} trackElement - the empty track container.
 * @returns {{towerElements: HTMLElement[], linkElements: HTMLElement[], stationElements: Object<string, HTMLElement>,
 *            envelopeElement: HTMLElement, beamElement: HTMLElement}}
 */
export function buildQkdTrack(trackElement) {
    const stationElements = {
        [MARIO]: buildStation("Mario", MARIO_SPRITE, MARIO),
        [LUIGI]: buildStation("Peach", PEACH_SPRITE, LUIGI),
    };
    const towerElements = [];
    const linkElements = [];
    const lastTowerIndex = QKD_TOWER_NAMES.length - 1;

    trackElement.append(stationElements[MARIO]);
    for (let i = 0; i <= lastTowerIndex; i++) {
        const isEndTower = i === 0 || i === lastTowerIndex;
        const towerElement = buildQkdTower(QKD_TOWER_NAMES[i], isEndTower);
        trackElement.append(towerElement);
        towerElements.push(towerElement);
        if (i < lastTowerIndex) {
            const linkElement = buildQkdLink();
            standBsmTowerInWater(linkElement);
            trackElement.append(linkElement);
            linkElements.push(linkElement);
        }
    }
    trackElement.append(stationElements[LUIGI]);

    const envelopeElement = createElement("div", "envelope");
    envelopeElement.textContent = "✉";
    const beamElement = createElement("div", "pair-beam");
    trackElement.append(envelopeElement, beamElement);
    return { towerElements, linkElements, stationElements, envelopeElement, beamElement };
}


/**
 * A plumber standing on the ground, name overhead, with a speech bubble for the message they receive.
 *
 * @param {string} displayName - shown under the sprite.
 * @param {object} plumberSprite - e.g. MARIO_SPRITE or PEACH_SPRITE.
 * @param {string} plumberId - MARIO or LUIGI (Peach's id), kept on the element for the CSS.
 */
export function buildStation(displayName, plumberSprite, plumberId) {
    const stationElement = createElement("div", "station");
    stationElement.dataset.plumber = plumberId;
    stationElement.append(createElement("div", "speech-bubble station-bubble"));
    const nameElement = createElement("div", "station-name");
    nameElement.textContent = displayName;
    stationElement.append(nameElement);
    stationElement.append(drawSprite(plumberSprite, PLUMBER_PIXEL_SIZE, "plumber"));
    return stationElement;
}


/**
 * One tower on a pipe. End towers (Alice, Charlie) measure; the middle tower (Bob) swaps. Its body holds the qubit
 * slots render_swap_tutorial.js adds.
 *
 * @param {string} towerName - shown on the pipe.
 * @param {boolean} isEndTower
 */
export function buildQkdTower(towerName, isEndTower) {
    const towerElement = createElement("div", "tower qkd-tower");
    towerElement.dataset.role = isEndTower ? "end" : "middle";
    towerElement.append(createElement("div", "tower-battlements"));

    towerElement.append(createElement("div", "tower-body"));

    towerElement.append(createElement("div", "tower-pipe"));
    const nameElement = createElement("div", "tower-name");
    nameElement.textContent = towerName;
    towerElement.append(nameElement);
    return towerElement;
}


/**
 * In a messaging link, the BSM is a real telecom tower: swap the "?" block for the tower on a concrete pier, standing
 * in the water that fills the span between the two castles.
 *
 * @param {HTMLElement} linkElement - from buildQkdLink.
 */
function standBsmTowerInWater(linkElement) {
    const waterElement = createElement("div", "qkd-water");
    const pierElement = createElement("div", "qkd-bsm-pier");
    const towerElement = drawSprite(TELECOM_TOWER_SPRITE, BSM_TOWER_PIXEL_SIZE, "qkd-bsm-tower");
    linkElement.querySelector(".question-block").replaceWith(pierElement, towerElement);
    linkElement.prepend(waterElement);
}


/**
 * The span between two towers: a cloud turtle with a speech bubble, coins, the BSM "?" block, the logical arc and
 * the fiber. (Levels 1 and 2 and the messaging world each replace the block with a telecom tower.)
 */
export function buildQkdLink() {
    const linkElement = createElement("div", "link qkd-link");

    const turtleElement = createElement("div", "cloud-turtle");
    turtleElement.append(createElement("div", "speech-bubble turtle-bubble"));
    turtleElement.append(createElement("div", "turtle-line"));
    turtleElement.append(drawSprite(CLOUD_TURTLE_SPRITE, TURTLE_PIXEL_SIZE, "turtle-sprite"));
    linkElement.append(turtleElement);

    const coinRow = createElement("div", "coin-row");
    for (let i = 0; i < COINS_SHOWN_PER_LINK; i++) {
        coinRow.append(createElement("span", "coin"));
    }
    linkElement.append(coinRow);

    const bsmNode = createElement("div", "question-block");
    bsmNode.textContent = "?";
    const bsmLabel = createElement("div", "bsm-label");
    bsmLabel.textContent = "BSM Node";
    linkElement.append(bsmNode, bsmLabel);

    linkElement.append(createElement("div", "logical-arc"));
    linkElement.append(createElement("div", "fiber"));
    return linkElement;
}
