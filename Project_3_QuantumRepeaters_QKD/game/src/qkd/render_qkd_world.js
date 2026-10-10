/**
 * Build the messaging world once: Mario on the ground left of Alice, four towers with a BSM node and a cloud turtle on
 * every link, Luigi on the ground right of David, plus the envelope, the end-to-end beam and the banner.
 *
 * render_qkd_state.js changes classes and text on these elements later. Fills the empty #track container from
 * qkd.html.
 */

import { LUIGI, MARIO, QKD_TOWER_NAMES } from "./qkd_constants.js";
import { createElement } from "../page_helpers.js";
import { CLOUD_TURTLE_SPRITE, LUIGI_SPRITE, MARIO_SPRITE, drawSprite } from "../pixel_sprites.js";

// Plumbers are 12×16 sprite pixels; 4 screen pixels each makes them 48×64 on screen.
const PLUMBER_PIXEL_SIZE = 4;
const TURTLE_PIXEL_SIZE = 3;
// How many coins a link shows while heralding: one per physical Bell pair of a Steane block.
const COINS_SHOWN_PER_LINK = 7;


/**
 * Fill the track: station, towers and links in turn, station, then the overlays.
 *
 * @param {HTMLElement} trackElement - the empty track container.
 * @returns {{towerElements: HTMLElement[], linkElements: HTMLElement[], stationElements: Object<string, HTMLElement>,
 *            envelopeElement: HTMLElement, beamElement: HTMLElement, bannerElement: HTMLElement}}
 */
export function buildQkdTrack(trackElement) {
    const stationElements = {
        [MARIO]: buildStation("Mario", MARIO_SPRITE, MARIO),
        [LUIGI]: buildStation("Luigi", LUIGI_SPRITE, LUIGI),
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
            trackElement.append(linkElement);
            linkElements.push(linkElement);
        }
    }
    trackElement.append(stationElements[LUIGI]);

    const envelopeElement = createElement("div", "envelope");
    envelopeElement.textContent = "✉";
    const beamElement = createElement("div", "pair-beam");
    const bannerElement = createElement("div", "qkd-banner");
    trackElement.append(envelopeElement, beamElement, bannerElement);
    return { towerElements, linkElements, stationElements, envelopeElement, beamElement, bannerElement };
}


/**
 * A plumber standing on the ground, name overhead, with a speech bubble for the message they receive.
 *
 * @param {string} displayName - shown under the sprite.
 * @param {object} plumberSprite - MARIO_SPRITE or LUIGI_SPRITE.
 * @param {string} plumberId - MARIO or LUIGI, kept on the element for the CSS.
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
 * One tower on a pipe. End towers (Alice, David) measure; middle towers (Bob, Charlie) swap.
 *
 * @param {string} towerName - shown on the pipe.
 * @param {boolean} isEndTower
 */
export function buildQkdTower(towerName, isEndTower) {
    const towerElement = createElement("div", "tower qkd-tower");
    towerElement.dataset.role = isEndTower ? "end" : "middle";
    towerElement.append(createElement("div", "tower-battlements"));

    const bodyElement = createElement("div", "tower-body");
    bodyElement.append(createElement("div", "tower-window"), createElement("div", "tower-badge"));
    towerElement.append(bodyElement);

    towerElement.append(createElement("div", "tower-pipe"));
    const nameElement = createElement("div", "tower-name");
    nameElement.textContent = towerName;
    towerElement.append(nameElement);
    return towerElement;
}


/**
 * The span between two towers: a cloud turtle with a speech bubble, coins, the BSM "?" block, the logical arc and
 * the fiber.
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
