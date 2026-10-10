/**
 * Toad's QEC hut: draws Toad in his mushroom house next to his speech.
 *
 * Reads hut.html; writes nothing outside the page.
 */

import { findElementsById } from "../page_helpers.js";
import { TOAD_SPRITE, drawSprite } from "../pixel_sprites.js";

const TOAD_PIXEL_SIZE = 5;


/**
 * Draw Toad.
 */
function startHut() {
    const elements = findElementsById({ toadElement: "toad" });
    elements.toadElement.append(drawSprite(TOAD_SPRITE, TOAD_PIXEL_SIZE, "toad-sprite"));
}


startHut();
