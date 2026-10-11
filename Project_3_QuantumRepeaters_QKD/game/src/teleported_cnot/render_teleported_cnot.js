/**
 * Level 4's drawing: in the one-pair rounds the paper's Fig. 4 circuit (left) and the fix toggles with the reading
 * (right); in the block rounds both Steane blocks and their 7 Bell pairs as tiles (left) and Toad's parity check
 * (right). Mario and Luigi stand on the ground; the cloud turtle flies over to spoil a pair. Looks live in
 * styles/teleported_cnot.css, lesson_level.css and circuit_picture.css.
 *
 * Writes only the level page's elements passed in.
 */

import { playTurtleZap } from "../lesson_stage.js";
import { createElement } from "../page_helpers.js";
import { CLOUD_TURTLE_SPRITE, LUIGI_SPRITE, MARIO_SPRITE, TOAD_SPRITE, drawSprite } from "../pixel_sprites.js";
import { drawFig4 } from "./fig4_picture.js";

const PLAYER_PIXEL_SIZE = 4;
const TURTLE_PIXEL_SIZE = 4;
const TOAD_PIXEL_SIZE = 3;
const BLOCK_SIZE = 7;


/**
 * Put Toad, Mario, Luigi and the turtle in place, and return what the level redraws.
 *
 * @param {Object<string, HTMLElement>} elements - from findElementsById in teleported_cnot_main.js.
 * @returns {object} the scene.
 */
export function buildCnotScene(elements) {
    elements.messageToadElement.append(drawSprite(TOAD_SPRITE, TOAD_PIXEL_SIZE, "lesson-toad"));
    elements.castElement.append(
        drawSprite(MARIO_SPRITE, PLAYER_PIXEL_SIZE, "lesson-mario"),
        drawSprite(LUIGI_SPRITE, PLAYER_PIXEL_SIZE, "lesson-luigi"),
    );
    elements.turtleElement.append(drawSprite(CLOUD_TURTLE_SPRITE, TURTLE_PIXEL_SIZE, "lesson-turtle-sprite"));
    return { ...elements, linkElements: [] };
}


/**
 * Toad's message under the board.
 *
 * @param {object} scene
 * @param {string} message
 */
export function showMessage(scene, message) {
    scene.messageElement.textContent = message;
}


/**
 * The left card in a one-pair round: Fig. 4 as the paper draws it, lit up to the current step, with a text
 * alternative and a legend saying what |α⟩ and |β⟩ are in this round.
 *
 * @param {object} scene
 * @param {object} figure - from buildPairCircuit (teleported_cnot_plan.js).
 */
export function renderPairCircuit(scene, figure) {
    scene.leftTitleElement.textContent = "One Bell pair (paper Fig. 4)";
    const circuitElement = drawFig4(figure);
    circuitElement.setAttribute("role", "img");
    circuitElement.setAttribute("aria-label", describePairCircuit(figure));
    const legendElement = createElement("p", "cnot-legend");
    legendElement.textContent = `Here |α⟩ = ${figure.alphaText} and |β⟩ = ${figure.betaText}. d = data qubit, `
        + "c = half of the Bell pair.";
    scene.leftBodyElement.replaceChildren(circuitElement, legendElement);
}


/**
 * Fig. 4 in words, with the bits measured so far.
 */
function describePairCircuit(figure) {
    const bitTexts = [];
    if (figure.bits.m !== null) {
        bitTexts.push(`m=${figure.bits.m}`);
    }
    if (figure.bits.n !== null) {
        bitTexts.push(`n=${figure.bits.n}`);
    }
    const bitsText = bitTexts.length > 0 ? ` Measured so far: ${bitTexts.join(", ")}.` : "";
    return `Mario's data dA starts in ${figure.alphaText}, Luigi's dB in ${figure.betaText}, and cA, cB share a Bell`
        + " pair. CNOT dA to cA and CNOT cB to dB; measure cA in Z giving m and cB in X giving n; m travels to an X"
        + " on dB and n to a Z on dA. The data end as |α⟩ and |β ⊕ α⟩." + bitsText;
}


/**
 * The right card in a one-pair round: the two fix toggles ([X] chosen, [ ] not) and, once applied, what was read.
 *
 * @param {object} scene
 * @param {{hasLuigiX: boolean, hasMarioZ: boolean, isChoosing: boolean, verdict: string | null}} fixView
 */
export function renderFixCard(scene, fixView) {
    scene.rightTitleElement.textContent = "Fixes";
    const toggleElements = [
        buildToggle("X", "X on Luigi's dB", "if m = 1", fixView.hasLuigiX),
        buildToggle("Z", "Z on Mario's dA", "if n = 1", fixView.hasMarioZ),
    ];
    const listElement = createElement("div", "cnot-toggles");
    listElement.classList.toggle("is-choosing", fixView.isChoosing);
    listElement.append(...toggleElements);
    const parts = [listElement];
    if (fixView.verdict !== null) {
        parts.push(createTextElement("p", "cnot-verdict", fixView.verdict));
    }
    scene.rightBodyElement.replaceChildren(...parts);
}


/**
 * One fix toggle: its key, a box with the letter when chosen (blank when not), and what it does.
 */
function buildToggle(key, actionText, ruleText, isOn) {
    const toggleElement = createElement("p", "cnot-toggle");
    toggleElement.classList.toggle("is-on", isOn);
    toggleElement.append(
        createTextElement("span", "cnot-toggle-box", isOn ? `[${key}]` : "[ ]"),
        createTextElement("span", "cnot-toggle-text", `${actionText} (${ruleText})`),
    );
    return toggleElement;
}


/**
 * The left card in a block round: Mario's data and halves, the 7 Bell pairs, Luigi's halves and data, as tiles; the
 * bits sent each way under them.
 *
 * @param {object} scene
 * @param {object} blockView - what has happened so far (see teleported_cnot_main.js makeBlockView).
 */
export function renderBlocks(scene, blockView) {
    scene.leftTitleElement.textContent = "Two Steane blocks, 7 Bell pairs";
    const gridElement = createElement("div", "cnot-grid");
    gridElement.setAttribute("role", "img");
    gridElement.setAttribute("aria-label", describeBlocks(blockView));
    appendTileRow(gridElement, "Mario d", (i) => buildDataTile(blockView, "mario", i));
    appendTileRow(gridElement, "Mario c", (i) => buildHalfTile(blockView.hasPairs, blockView.mBits, i));
    scene.linkElements = appendTileRow(gridElement, "pairs", (i) => buildLinkTile(blockView, i));
    appendTileRow(gridElement, "Luigi c", (i) => buildHalfTile(blockView.hasPairs, blockView.nBits, i));
    appendTileRow(gridElement, "Luigi d", (i) => buildDataTile(blockView, "luigi", i));
    const packetsElement = createElement("div", "cnot-packets");
    packetsElement.append(
        createTextElement("p", "cnot-packet", blockView.isMSent ? `m → Luigi: ${blockView.mBits.join("")}` : ""),
        createTextElement("p", "cnot-packet", blockView.isNSent ? `n → Mario: ${blockView.nBits.join("")}` : ""),
    );
    scene.leftBodyElement.replaceChildren(gridElement, packetsElement);
}


/**
 * One labelled row of 7 tiles. Returns the tiles.
 */
function appendTileRow(gridElement, rowLabel, buildTile) {
    gridElement.append(createTextElement("span", "cnot-row-label", rowLabel));
    const tiles = [];
    for (let i = 0; i < BLOCK_SIZE; i++) {
        const tileElement = buildTile(i);
        tiles.push(tileElement);
        gridElement.append(tileElement);
    }
    return tiles;
}


/**
 * A data qubit: numbered, gold once Mario's block is encoded (cyan for Luigi's), with an X or Z badge where a fix
 * landed, and "!" where the turtle's error is found (a tick once fixed).
 */
function buildDataTile(blockView, owner, i) {
    const tileElement = createTextElement("span", `cnot-tile is-data is-${owner}`, String(i + 1));
    tileElement.classList.toggle("is-encoded", blockView.isEncoded);
    const fixBits = owner === "mario" ? blockView.marioZFixes : blockView.luigiXFixes;
    const fixLetter = owner === "mario" ? "Z" : "X";
    const badges = [];
    if (fixBits !== null && fixBits[i] === 1) {
        badges.push(fixLetter);
    }
    const isFlagged = owner === "luigi" && blockView.flaggedPosition === i + 1;
    if (isFlagged) {
        badges.push(blockView.isFlagFixed ? "✓" : "!");
        tileElement.classList.add(blockView.isFlagFixed ? "is-healed" : "is-flagged");
    }
    if (badges.length > 0) {
        tileElement.append(createTextElement("span", "cnot-badge", badges.join(" ")));
    }
    return tileElement;
}


/**
 * A Bell-pair half: empty before the pairs arrive, "c" while live, its measured bit once measured.
 */
function buildHalfTile(hasPairs, measuredBits, i) {
    if (!hasPairs) {
        return createTextElement("span", "cnot-tile is-half", "");
    }
    if (measuredBits === null) {
        return createTextElement("span", "cnot-tile is-half is-live", "c");
    }
    return createTextElement("span", "cnot-tile is-half is-measured", String(measuredBits[i]));
}


/**
 * A Bell pair: a dashed pink link, red with "!" once the turtle has flipped it.
 */
function buildLinkTile(blockView, i) {
    const linkElement = createElement("span", "cnot-link");
    linkElement.classList.toggle("is-live", blockView.hasPairs && blockView.mBits === null);
    const isBad = blockView.badPair === i + 1;
    linkElement.classList.toggle("is-bad", isBad);
    if (isBad) {
        linkElement.textContent = "!";
    }
    return linkElement;
}


/**
 * The block board in words.
 */
function describeBlocks(blockView) {
    const parts = ["Mario's 7 data qubits, his 7 Bell-pair halves, Luigi's 7 halves and Luigi's 7 data qubits."];
    if (blockView.isEncoded) {
        parts.push("Mario's block holds logical |+⟩, Luigi's logical |0⟩.");
    }
    if (blockView.badPair !== null) {
        parts.push(`The turtle flipped Bell pair ${blockView.badPair}.`);
    }
    if (blockView.mBits !== null) {
        parts.push(`m = ${blockView.mBits.join("")}.`);
    }
    if (blockView.nBits !== null) {
        parts.push(`n = ${blockView.nBits.join("")}.`);
    }
    return parts.join(" ");
}


/**
 * The right card in a block round: the logical parities ("?" until checked) and, with the turtle, Luigi's syndrome.
 *
 * @param {object} scene
 * @param {{zzBit: number | null, xxBit: number | null, syndrome: number[] | null, showsSyndrome: boolean}} checkView
 */
export function renderCheckCard(scene, checkView) {
    scene.rightTitleElement.textContent = "Toad's check";
    const tableElement = createElement("table", "lesson-table");
    const captionElement = document.createElement("caption");
    captionElement.textContent = "Logical Bell pair: both +1";
    tableElement.append(captionElement);
    appendCheckRow(tableElement, "logical ZZ", formatParity(checkView.zzBit));
    appendCheckRow(tableElement, "logical XX", formatParity(checkView.xxBit));
    if (checkView.showsSyndrome) {
        const syndromeText = checkView.syndrome === null ? "?" : checkView.syndrome.join("");
        appendCheckRow(tableElement, "Luigi's Z checks", syndromeText);
    }
    scene.rightBodyElement.replaceChildren(tableElement);
}


/**
 * One row of the check table; a -1 is marked so it stands out by more than its colour.
 */
function appendCheckRow(tableElement, headerText, valueText) {
    const rowElement = tableElement.insertRow();
    const headerCell = document.createElement("th");
    headerCell.scope = "row";
    headerCell.textContent = headerText;
    const valueCell = rowElement.insertCell();
    valueCell.textContent = valueText;
    valueCell.classList.toggle("is-one", valueText === "-1");
    valueCell.classList.toggle("is-unknown", valueText === "?");
    rowElement.prepend(headerCell);
}


/**
 * A parity bit as Toad says it: 0 is +1, 1 is -1, null is not measured yet.
 */
function formatParity(parityBit) {
    if (parityBit === null) {
        return "?";
    }
    return parityBit === 0 ? "+1" : "-1";
}


/**
 * The turtle flies over and flips one Bell pair, which flashes.
 *
 * @param {object} scene
 * @param {number} badPair - 1-7.
 */
export async function playTurtle(scene, badPair) {
    await playTurtleZap(scene.turtleElement, scene.linkElements[badPair - 1]);
}


/**
 * Show the banner over the board, or hide it with null.
 *
 * @param {object} scene
 * @param {string | null} text
 */
export function showBanner(scene, text) {
    scene.bannerElement.textContent = text ?? "";
    scene.bannerElement.classList.toggle("is-visible", text !== null);
}


/**
 * An element holding some text.
 */
function createTextElement(tagName, className, text) {
    const element = createElement(tagName, className);
    element.textContent = text;
    return element;
}
