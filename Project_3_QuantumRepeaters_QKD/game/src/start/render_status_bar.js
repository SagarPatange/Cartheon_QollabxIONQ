/**
 * The map's status bar: a small Mario next to the world name, drawn arrow keys, a copy of the current stop's map
 * tile next to its title, and an Enter button that says what it opens.
 *
 * Fills the empty slots in start.html's status bar; start_main.js calls renderStatusBar each time Mario moves.
 */

import { findEnterLabel } from "./world_map.js";
import { createElement } from "../page_helpers.js";
import { ARROW_SPRITE, MARIO_SPRITE, MUSHROOM_HUT_SPRITE, drawSprite } from "../pixel_sprites.js";

const STATUS_MARIO_PIXEL_SIZE = 2;
const ARROW_PIXEL_SIZE = 2;
const BADGE_HUT_PIXEL_SIZE = 2;
// Drawn in this order, as on a keyboard's arrow cluster read left to right.
const ARROW_DIRECTIONS = ["left", "up", "down", "right"];


/**
 * Draw the parts of the status bar that never change: Mario by the world name and the four arrow keys.
 *
 * @param {{worldMarioSlot: HTMLElement, arrowKeysSlot: HTMLElement}} elements
 */
export function buildStatusBarIcons(elements) {
    elements.worldMarioSlot.append(drawSprite(MARIO_SPRITE, STATUS_MARIO_PIXEL_SIZE, "world-mario"));
    for (const direction of ARROW_DIRECTIONS) {
        const keycapElement = createElement("span", `keycap is-arrow is-${direction}`);
        keycapElement.append(drawSprite(ARROW_SPRITE, ARROW_PIXEL_SIZE, "keycap-arrow"));
        elements.arrowKeysSlot.append(keycapElement);
    }
}


/**
 * Show the stop Mario stands on: its tile, title, description and what Enter opens.
 *
 * @param {{stopBadgeSlot: HTMLElement, stopTitle: HTMLElement, stopDescription: HTMLElement,
 *          enterLabel: HTMLElement}} elements
 * @param {{kind: string, label: string, title: string, description: string}} stop
 */
export function renderStatusBar(elements, stop) {
    elements.stopBadgeSlot.replaceChildren(buildStopBadge(stop));
    elements.stopTitle.textContent = stop.title;
    elements.stopDescription.textContent = stop.description;
    elements.enterLabel.textContent = findEnterLabel(stop);
}


/**
 * A small copy of the stop's map tile, so the status bar visibly matches the map.
 */
function buildStopBadge(stop) {
    const badgeElement = createElement("span", `stop-badge is-${stop.kind}`);
    if (stop.kind === "hut") {
        badgeElement.append(drawSprite(MUSHROOM_HUT_SPRITE, BADGE_HUT_PIXEL_SIZE, "stop-badge-hut"));
    } else {
        badgeElement.textContent = stop.label;
    }
    return badgeElement;
}
