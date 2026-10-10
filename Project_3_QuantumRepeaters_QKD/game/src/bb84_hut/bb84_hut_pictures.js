/**
 * The pictures in Toad's BB84 hut, one per panel, drawn in the game's pixel style from the worked example in
 * bb84_hut_panels.js: photon polarizations, the bases table, sifting, Eve, and the sample check.
 *
 * Tables are real <table>s with captions and row headers, so a screen reader reads them as they are; the other
 * pictures carry an aria-label. Writes only the elements it returns.
 */

import {
    BB84_EXAMPLE, RANDOM_BIT, SAMPLE_SIZE, countSampleErrors, findInterceptResendErrorRate,
    listEveRiskPositions, listSiftedPositions, predictBobBit,
} from "./bb84_hut_panels.js";
import { createElement } from "../page_helpers.js";
import { CLOUD_TURTLE_SPRITE, LUIGI_SPRITE, MARIO_SPRITE, drawSprite } from "../pixel_sprites.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// A photon tile is PHOTON_GRID_SIZE sprite pixels across; CSS sets its size on screen.
const PHOTON_GRID_SIZE = 12;
const ROW_ICON_PIXEL_SIZE = 2;
const TROPHY_PIXEL_SIZE = 6;
const PERCENT = 100;
// In the "Catch her" picture, every ERROR_SPACING-th bit of Eve's sample is drawn wrong (5 of 20 at 25%).
const ERROR_SPACING = 4;

// Which way the photon's polarization points for each basis and bit (Bennett & Brassard 1984): | and - in the
// + basis, / and \ in the x basis.
const POLARIZATION_BY_BASIS_AND_BIT = { "+0": "vertical", "+1": "horizontal", "x0": "rising", "x1": "falling" };
const POLARIZATION_NAMES = { vertical: "|", horizontal: "-", rising: "/", falling: "\\" };

// A small gold cup for the inventors panel. G gold, D dark gold, K outline.
const TROPHY_SPRITE = {
    rows: [
        "KKKKKKKKKKKK",
        "KGGGGGGGGGDK",
        "KGKGGGGGGKDK",
        "KGKGGGGGGKDK",
        ".KGGGGGGGDK.",
        "..KGGGGGDK..",
        "...KGGGDK...",
        "....KGDK....",
        "....KGDK....",
        "...KGGGDK...",
        "..KKKKKKKK..",
        "..KGGGGGDK..",
        "..KKKKKKKK..",
    ],
    palette: { G: "#f8b800", D: "#ac7c00", K: "#000000" },
};

const PICTURE_BUILDERS = {
    bases: buildBasesPicture,
    picks: buildPicksPicture,
    sifting: buildSiftingPicture,
    eavesdropper: buildEavesdropperPicture,
    sample: buildSamplePicture,
    inventors: buildInventorsPicture,
};


/**
 * The picture for one panel.
 *
 * @param {string} pictureName - a panel's picture, e.g. "sifting".
 * @returns {HTMLElement}
 */
export function buildPanelPicture(pictureName) {
    const buildPicture = PICTURE_BUILDERS[pictureName];
    if (buildPicture === undefined) {
        throw new Error(`no BB84 picture is called "${pictureName}"`);
    }
    return buildPicture();
}


/**
 * Two cards, one per basis, each showing the photon for 0 and for 1.
 */
function buildBasesPicture() {
    const pictureElement = createElement("div", "bb84-bases");
    pictureElement.setAttribute("role", "img");
    pictureElement.setAttribute("aria-label",
        "Plus basis: a vertical photon is 0, a horizontal photon is 1. "
        + "X basis: a photon tilted up to the right is 0, tilted down to the right is 1.");
    for (const basis of ["+", "x"]) {
        const cardElement = createElement("div", "bb84-basis-card");
        const titleElement = createElement("p", "bb84-basis-title");
        titleElement.textContent = `${basis} basis`;
        cardElement.append(titleElement);
        for (const bit of [0, 1]) {
            const photonElement = createElement("div", "bb84-basis-photon");
            photonElement.append(drawPhoton(findPolarization(basis, bit), "bb84-photon is-large"));
            const bitElement = createElement("span", "bb84-basis-bit");
            bitElement.textContent = `= ${bit}`;
            photonElement.append(bitElement);
            cardElement.append(photonElement);
        }
        pictureElement.append(cardElement);
    }
    return pictureElement;
}


/**
 * The bases table: Alice's bits and bases, the photons she sends, and Bob's random bases.
 */
function buildPicksPicture() {
    const example = BB84_EXAMPLE;
    const tableElement = buildTable("Eight photons: both pick a basis at random.");
    appendRow(tableElement, "Alice's bit", MARIO_SPRITE, example.aliceBits.map(String));
    appendRow(tableElement, "Alice's basis", MARIO_SPRITE, example.aliceBases);
    appendPhotonRow(tableElement, "Photon", example.aliceBases, example.aliceBits);
    appendRow(tableElement, "Bob's basis", LUIGI_SPRITE, example.bobBases);
    return tableElement;
}


/**
 * Sifting: which bases matched (✓ / ✗), what Bob read, and the key they keep. Kept columns are highlighted too.
 */
function buildSiftingPicture() {
    const example = BB84_EXAMPLE;
    const keptPositions = listSiftedPositions(example.aliceBases, example.bobBases);
    const bobBits = [];
    const matchMarks = [];
    const keyBits = [];
    for (let i = 0; i < example.aliceBits.length; i++) {
        const isKept = keptPositions.includes(i);
        bobBits.push(String(predictBobBit(example.aliceBits[i], example.aliceBases[i], example.bobBases[i])));
        matchMarks.push(isKept ? "✓" : "✗");
        keyBits.push(isKept ? String(example.aliceBits[i]) : "");
    }
    const tableElement = buildTable(`Kept: ${keptPositions.length} of ${example.aliceBits.length}. ? is a coin flip.`);
    appendRow(tableElement, "Alice's basis", MARIO_SPRITE, example.aliceBases);
    appendRow(tableElement, "Bob's basis", LUIGI_SPRITE, example.bobBases);
    appendRow(tableElement, "Same basis?", null, matchMarks);
    appendRow(tableElement, "Bob reads", LUIGI_SPRITE, bobBits);
    appendRow(tableElement, "Shared key", null, keyBits);
    markKeptColumns(tableElement, keptPositions);
    return tableElement;
}


/**
 * Eve in the middle: her bases (! where she guessed wrong on a kept bit), and the kept key on both sides with
 * ✗ where Bob's bit no longer matches Alice's.
 */
function buildEavesdropperPicture() {
    const example = BB84_EXAMPLE;
    const keptPositions = listSiftedPositions(example.aliceBases, example.bobBases);
    const riskPositions = listEveRiskPositions(example);
    const eveMarks = [];
    const aliceKey = [];
    const bobKey = [];
    for (let i = 0; i < example.aliceBits.length; i++) {
        const wrongMark = riskPositions.includes(i) ? "!" : "";
        eveMarks.push(`${example.eveBases[i]}${wrongMark}`);
        const isKept = keptPositions.includes(i);
        const isFlipped = example.eveFlippedPositions.includes(i);
        const bobBit = isFlipped ? 1 - example.aliceBits[i] : example.aliceBits[i];
        aliceKey.push(isKept ? String(example.aliceBits[i]) : "");
        bobKey.push(isKept ? `${bobBit}${isFlipped ? " ✗" : " ✓"}` : "");
    }
    const tableElement = buildTable("! = Eve guessed wrong. ✗ = a spoiled bit.");
    appendRow(tableElement, "Alice's basis", MARIO_SPRITE, example.aliceBases);
    appendRow(tableElement, "Eve's basis", CLOUD_TURTLE_SPRITE, eveMarks);
    appendRow(tableElement, "Alice's key", MARIO_SPRITE, aliceKey);
    appendRow(tableElement, "Bob's key", LUIGI_SPRITE, bobKey);
    markKeptColumns(tableElement, keptPositions);
    return tableElement;
}


/**
 * Two samples of SAMPLE_SIZE kept bits: one with nobody listening, one with Eve on every photon.
 */
function buildSamplePicture() {
    const pictureElement = createElement("div", "bb84-samples");
    const eveErrorRate = findInterceptResendErrorRate();
    pictureElement.append(buildSampleRow("No one listening", 0));
    pictureElement.append(buildSampleRow("Eve listening", countSampleErrors(SAMPLE_SIZE, eveErrorRate)));
    return pictureElement;
}


/**
 * One sample: a ✓ or ✗ square per compared bit and the error count. The squares are summed up in the label.
 */
function buildSampleRow(rowTitle, errorCount) {
    const rowElement = createElement("div", "bb84-sample-row");
    const errorPercent = Math.round((errorCount / SAMPLE_SIZE) * PERCENT);
    const summary = `${rowTitle}: ${errorCount} of ${SAMPLE_SIZE} wrong (${errorPercent}%)`;
    const titleElement = createElement("p", "bb84-sample-title");
    titleElement.textContent = summary;
    const squaresElement = createElement("div", "bb84-sample-squares");
    squaresElement.setAttribute("aria-hidden", "true");
    for (let i = 0; i < SAMPLE_SIZE; i++) {
        const isWrong = i % ERROR_SPACING === 1 && Math.floor(i / ERROR_SPACING) < errorCount;
        const squareElement = createElement("span", isWrong ? "bb84-sample-bit is-wrong" : "bb84-sample-bit");
        squareElement.textContent = isWrong ? "✗" : "✓";
        squaresElement.append(squareElement);
    }
    rowElement.append(titleElement, squaresElement);
    return rowElement;
}


/**
 * A gold cup on a plaque: the year BB84 was published and the award.
 */
function buildInventorsPicture() {
    const pictureElement = createElement("div", "bb84-trophy");
    pictureElement.append(drawSprite(TROPHY_SPRITE, TROPHY_PIXEL_SIZE, "bb84-trophy-cup"));
    const plaqueElement = createElement("div", "bb84-trophy-plaque");
    const lines = ["BB84 · 1984", "Bennett & Brassard", "ACM A.M. Turing Award 2025"];
    for (const line of lines) {
        const lineElement = createElement("p", "bb84-trophy-line");
        lineElement.textContent = line;
        plaqueElement.append(lineElement);
    }
    pictureElement.append(plaqueElement);
    return pictureElement;
}


/**
 * An empty table with a caption and a header row numbering the photons.
 */
function buildTable(captionText) {
    const tableElement = createElement("table", "bb84-table");
    const captionElement = document.createElement("caption");
    captionElement.textContent = captionText;
    tableElement.append(captionElement);
    const headerRow = tableElement.insertRow();
    const cornerCell = document.createElement("th");
    cornerCell.textContent = "Photon";
    cornerCell.scope = "col";
    headerRow.append(cornerCell);
    for (let i = 0; i < BB84_EXAMPLE.aliceBits.length; i++) {
        const headerCell = document.createElement("th");
        headerCell.scope = "col";
        headerCell.textContent = String(i + 1);
        headerRow.append(headerCell);
    }
    return tableElement;
}


/**
 * One table row: a row header (with a character icon when given) and one cell per photon.
 */
function appendRow(tableElement, rowTitle, iconSprite, cellTexts) {
    const rowElement = tableElement.insertRow();
    rowElement.append(buildRowHeader(rowTitle, iconSprite));
    for (const cellText of cellTexts) {
        const cellElement = rowElement.insertCell();
        cellElement.textContent = cellText;
        cellElement.classList.toggle("is-coin-flip", cellText === RANDOM_BIT);
        const hasMark = cellText.includes("✓") || cellText.includes("✗");
        cellElement.classList.toggle("has-mark", hasMark);
        // A key bit Eve spoiled: "0 ✗". Red as well as the ✗, so it doesn't rely on colour alone.
        cellElement.classList.toggle("is-spoiled", /\d ✗/.test(cellText));
    }
}


/**
 * A row of photon tiles: the polarization Alice sends for each bit and basis, named in each tile's label.
 */
function appendPhotonRow(tableElement, rowTitle, bases, bits) {
    const rowElement = tableElement.insertRow();
    rowElement.append(buildRowHeader(rowTitle, null));
    for (let i = 0; i < bits.length; i++) {
        const polarization = findPolarization(bases[i], bits[i]);
        const cellElement = rowElement.insertCell();
        cellElement.setAttribute("aria-label", POLARIZATION_NAMES[polarization]);
        cellElement.append(drawPhoton(polarization, "bb84-photon"));
    }
}


/**
 * A row header cell, with a small character sprite before the words.
 */
function buildRowHeader(rowTitle, iconSprite) {
    const headerCell = document.createElement("th");
    headerCell.scope = "row";
    if (iconSprite !== null) {
        headerCell.append(drawSprite(iconSprite, ROW_ICON_PIXEL_SIZE, "bb84-row-icon"));
    }
    headerCell.append(rowTitle);
    return headerCell;
}


/**
 * Highlight the columns of the bits Alice and Bob keep, so the kept ones stand out as well as carrying ✓.
 */
function markKeptColumns(tableElement, keptPositions) {
    for (const rowElement of tableElement.rows) {
        for (const position of keptPositions) {
            // Column 0 is the row header; photon i sits in column i + 1.
            rowElement.cells[position + 1].classList.add("is-kept");
        }
    }
}


/**
 * Which way a photon is polarized for a basis and bit.
 *
 * @param {string} basis - "+" or "x".
 * @param {number} bit - 0 or 1.
 * @returns {"vertical" | "horizontal" | "rising" | "falling"}
 */
function findPolarization(basis, bit) {
    return POLARIZATION_BY_BASIS_AND_BIT[`${basis}${bit}`];
}


/**
 * A photon tile: a glowing square with a thick pixel line along its polarization.
 */
function drawPhoton(polarization, className) {
    const svgElement = document.createElementNS(SVG_NAMESPACE, "svg");
    svgElement.setAttribute("viewBox", `0 0 ${PHOTON_GRID_SIZE} ${PHOTON_GRID_SIZE}`);
    svgElement.setAttribute("shape-rendering", "crispEdges");
    svgElement.setAttribute("aria-hidden", "true");
    svgElement.setAttribute("class", className);
    for (const [pixelX, pixelY] of listPolarizationPixels(polarization)) {
        const pixelElement = document.createElementNS(SVG_NAMESPACE, "rect");
        pixelElement.setAttribute("x", String(pixelX));
        pixelElement.setAttribute("y", String(pixelY));
        pixelElement.setAttribute("width", "2");
        pixelElement.setAttribute("height", "2");
        svgElement.append(pixelElement);
    }
    return svgElement;
}


/**
 * The top-left corners of the 2x2 blocks that draw a polarization line across the photon tile.
 */
function listPolarizationPixels(polarization) {
    const blockCorners = [];
    for (let step = 1; step < PHOTON_GRID_SIZE - 2; step++) {
        const middle = PHOTON_GRID_SIZE / 2 - 1;
        const cornerByPolarization = {
            vertical: [middle, step],
            horizontal: [step, middle],
            rising: [step, PHOTON_GRID_SIZE - 2 - step],
            falling: [step, step],
        };
        blockCorners.push(cornerByPolarization[polarization]);
    }
    return blockCorners;
}
