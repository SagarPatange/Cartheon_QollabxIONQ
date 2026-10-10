/**
 * The pictures in Toad's QEC hut, one per panel, drawn in the game's pixel style from qec_codes.js: no-cloning vs.
 * spreading, the 3-qubit code's circuit and syndrome table, the [[n,k,d]] table, the Steane diagram and encoder,
 * and the hook error with and without a flag qubit.
 *
 * Tables are real <table>s with captions and headers, so a screen reader reads them as they are; the other pictures
 * carry an aria-label. Writes only the elements it returns.
 */

import { drawCircuit } from "../circuit_picture.js";
import {
    ANCILLA_WIRE, FLAG_WIRE, STEANE_QUBIT_COUNT, buildBitFlipCircuit, buildCheckCircuit,
    buildSteaneEncoderCircuit, decodeSteaneXErrors, findCorrectableErrorCount, findDataWireId, findHookFaultColumn,
    listBitFlipSyndromeTable, listDataPositions, listExampleCodes, listSteaneCheckPositions, spreadXFault,
} from "./qec_codes.js";
import { createElement } from "../page_helpers.js";
import { LUIGI_SPRITE, MARIO_SPRITE, drawSprite } from "../pixel_sprites.js";
import { describeSteaneDiagram, drawSteaneDiagram } from "../steane_diagram.js";

const PLAYER_PIXEL_SIZE = 3;

const PICTURE_BUILDERS = {
    why: buildWhyPicture,
    bitFlip: buildBitFlipPicture,
    codeTable: buildCodeTablePicture,
    steaneDiagram: buildSteaneDiagramPicture,
    steaneEncoder: buildSteaneEncoderPicture,
    hook: () => buildCheckPicture(false),
    flag: () => buildCheckPicture(true),
    toGame: buildToGamePicture,
};


/**
 * The picture for one panel.
 *
 * @param {string} pictureName - a panel's picture, e.g. "steaneEncoder".
 * @returns {HTMLElement}
 */
export function buildPanelPicture(pictureName) {
    const buildPicture = PICTURE_BUILDERS[pictureName];
    if (buildPicture === undefined) {
        throw new Error(`no QEC picture is called "${pictureName}"`);
    }
    return buildPicture();
}


/**
 * Two cards: copying a qubit (forbidden) and spreading it over three qubits (allowed).
 */
function buildWhyPicture() {
    const pictureElement = createElement("div", "qec-cards");
    pictureElement.setAttribute("role", "img");
    pictureElement.setAttribute("aria-label",
        "Copy a qubit into two: not allowed, no-cloning. "
        + "Spread it: a|0⟩ + b|1⟩ becomes a|000⟩ + b|111⟩ on three qubits: allowed.");
    pictureElement.append(buildCard("Copy it?", ["|ψ⟩"], ["|ψ⟩", "|ψ⟩"], "✗ no-cloning", false));
    pictureElement.append(buildCard("Spread it!", ["a|0⟩+b|1⟩"], ["a|000⟩", "+ b|111⟩"], "✓ allowed", true));
    return pictureElement;
}


/**
 * One card: qubit tiles before, an arrow, the tiles after, and a verdict with its ✓ or ✗.
 */
function buildCard(title, beforeTexts, afterTexts, verdict, isAllowed) {
    const cardElement = createElement("div", "qec-card");
    const titleElement = createElement("p", "qec-card-title");
    titleElement.textContent = title;
    const rowElement = createElement("div", "qec-card-row");
    rowElement.append(buildTileStack(beforeTexts), createTextElement("span", "qec-arrow", "→"));
    rowElement.append(buildTileStack(afterTexts));
    const verdictClass = isAllowed ? "qec-verdict is-allowed" : "qec-verdict is-forbidden";
    cardElement.append(titleElement, rowElement, createTextElement("p", verdictClass, verdict));
    return cardElement;
}


/**
 * A column of qubit tiles, one per text.
 */
function buildTileStack(texts) {
    const stackElement = createElement("div", "qec-tile-stack");
    for (const text of texts) {
        stackElement.append(createTextElement("span", "qec-tile", text));
    }
    return stackElement;
}


/**
 * The 3-qubit code: its circuit (encode, then the two checks) beside its syndrome table.
 */
function buildBitFlipPicture() {
    const pictureElement = createElement("div", "qec-side-by-side");
    const circuitElement = drawCircuit(buildBitFlipCircuit(), {
        columnGroups: [
            { from: 0, to: 1, label: "encode" },
            { from: 2, to: 3, label: "Z1Z2" },
            { from: 4, to: 5, label: "Z2Z3" },
        ],
    });
    circuitElement.setAttribute("role", "img");
    circuitElement.setAttribute("aria-label",
        "Encoding: CNOTs from q1 to q2 and from q1 to q3. Check Z1Z2: CNOTs from q1 and q2 onto ancilla a1. "
        + "Check Z2Z3: CNOTs from q2 and q3 onto ancilla a2. Both ancillas are measured.");
    pictureElement.append(circuitElement, buildSyndromeTable());
    return pictureElement;
}


/**
 * The syndrome table: what Z1Z2 and Z2Z3 read for no flip and each single flip.
 */
function buildSyndromeTable() {
    const tableElement = buildTable("qec-table", "Syndrome → fix", ["Z1Z2", "Z2Z3", "Flip"]);
    for (const row of listBitFlipSyndromeTable()) {
        const fixText = row.flippedPosition === null ? "none" : `q${row.flippedPosition}`;
        appendRow(tableElement, [...row.checkResults.map(String), fixText]);
    }
    return tableElement;
}


/**
 * The [[n,k,d]] table: each example code, its numbers, and how many errors it fixes.
 */
function buildCodeTablePicture() {
    const headers = ["Code", "[[n,k,d]]", "Fixes"];
    const tableElement = buildTable("qec-table is-wide", "Fixes up to ⌊(d−1)/2⌋ errors", headers);
    for (const code of listExampleCodes()) {
        const distance = Math.min(code.xDistance, code.zDistance);
        const hasTwoDistances = code.xDistance !== code.zDistance;
        const name = `[[${code.qubitCount},${code.logicalCount},${distance}]]`;
        const fixCount = findCorrectableErrorCount(distance);
        let fixText = `${fixCount} any`;
        if (hasTwoDistances) {
            fixText = `${findCorrectableErrorCount(code.xDistance)} X flip, ${fixCount} Z`;
        }
        appendRow(tableElement, [code.name, name, fixText]);
    }
    return tableElement;
}


/**
 * The Steane code as three overlapping circles (one per check) with the 7 qubits in their regions, and the six
 * stabilizers listed beside it.
 */
function buildSteaneDiagramPicture() {
    const pictureElement = createElement("div", "qec-side-by-side");
    const checkPositions = listSteaneCheckPositions();
    const { svgElement } = drawSteaneDiagram(checkPositions);
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", describeSteaneDiagram(checkPositions));
    pictureElement.append(svgElement, buildStabilizerList(checkPositions));
    return pictureElement;
}


/**
 * The six stabilizers: an X check and a Z check on each circle's four qubits.
 */
function buildStabilizerList(checkPositions) {
    const tableElement = buildTable("qec-table", "6 stabilizers", ["X checks", "Z checks"]);
    for (const positions of checkPositions) {
        const xCheck = positions.map((position) => `X${position}`).join("");
        const zCheck = positions.map((position) => `Z${position}`).join("");
        appendRow(tableElement, [xCheck, zCheck]);
    }
    return tableElement;
}


/**
 * The Steane |0̄⟩ encoder, with each Hadamard qubit's CNOTs banded and named by the check they build.
 */
function buildSteaneEncoderPicture() {
    const circuit = buildSteaneEncoderCircuit();
    const columnGroups = [{ from: 0, to: 0, label: "H" }];
    const checkPositions = listSteaneCheckPositions();
    // Columns 1-3 spread q4, 4-6 spread q2, 7-9 spread q1: steane.py's CNOT order, three per Hadamard qubit.
    const cnotsPerCheck = 3;
    for (let i = 0; i < checkPositions.length; i++) {
        const from = 1 + i * cnotsPerCheck;
        columnGroups.push({ from, to: from + cnotsPerCheck - 1, label: checkPositions[i].join("") });
    }
    const circuitElement = drawCircuit(circuit, { columnGroups });
    circuitElement.setAttribute("role", "img");
    circuitElement.setAttribute("aria-label",
        "Seven qubits q1 to q7 start in |0⟩. H on q1, q2 and q4. Then CNOTs from q4 to q5, q6, q7; "
        + "from q2 to q3, q6, q7; and from q1 to q3, q5, q7.");
    return circuitElement;
}


/**
 * Measuring X4X5X6X7 with one X fault on the ancilla after its 2nd data CNOT, with or without a flag qubit, and a
 * line saying what the fault left behind.
 */
function buildCheckPicture(hasFlag) {
    const circuit = buildCheckCircuit(hasFlag);
    const faultColumn = findHookFaultColumn(circuit);
    const xWires = spreadXFault(circuit, ANCILLA_WIRE, faultColumn);
    const errorPositions = listDataPositions(xWires);
    const endNotes = {};
    for (const position of errorPositions) {
        endNotes[findDataWireId(position)] = "X!";
    }
    const isFlagRaised = xWires.has(FLAG_WIRE);
    if (hasFlag) {
        endNotes[FLAG_WIRE] = isFlagRaised ? "= 1" : "= 0";
    }
    const circuitElement = drawCircuit(circuit, { fault: { wire: ANCILLA_WIRE, afterColumn: faultColumn }, endNotes });
    const summary = describeCheckOutcome(errorPositions, hasFlag, isFlagRaised);
    circuitElement.setAttribute("role", "img");
    circuitElement.setAttribute("aria-label", `Measuring X4 X5 X6 X7 with one ancilla. ${summary}`);
    const pictureElement = createElement("div", "qec-stack");
    pictureElement.append(circuitElement, createTextElement("p", "qec-caption", summary));
    return pictureElement;
}


/**
 * One line on what a mid-check fault did: the data errors it left and, with a flag, whether the flag caught it.
 */
function describeCheckOutcome(errorPositions, hasFlag, isFlagRaised) {
    const errorNames = errorPositions.map((position) => `X${position}`).join(" ");
    const spreadText = `1 fault → ${errorNames}.`;
    if (!hasFlag) {
        const isLogicalError = decodeSteaneXErrors(errorPositions).isLogicalError;
        const outcome = isLogicalError ? "The decoder guesses wrong: logical error!" : "The decoder fixes it.";
        return `${spreadText} ${outcome}`;
    }
    if (isFlagRaised) {
        return `${spreadText} Flag = 1: re-check and fix ${errorNames} as one fault.`;
    }
    return `${spreadText} Flag = 0: decode as usual.`;
}


/**
 * Mario's and Luigi's Steane blocks: 7 qubits each, joined pair by pair by heralded Bell pairs.
 */
function buildToGamePicture() {
    const pictureElement = createElement("div", "qec-blocks");
    pictureElement.setAttribute("role", "img");
    pictureElement.setAttribute("aria-label",
        `Mario's block of ${STEANE_QUBIT_COUNT} qubits and Luigi's block of ${STEANE_QUBIT_COUNT} qubits, joined `
        + `by ${STEANE_QUBIT_COUNT} Bell pairs: together, one logical Bell pair.`);
    pictureElement.append(buildBlockRow("Mario", MARIO_SPRITE));
    const linksElement = createElement("div", "qec-block-row");
    linksElement.append(createTextElement("span", "qec-block-name", `${STEANE_QUBIT_COUNT} Bell pairs`));
    for (let position = 1; position <= STEANE_QUBIT_COUNT; position++) {
        linksElement.append(createElement("span", "qec-bell-link"));
    }
    pictureElement.append(linksElement, buildBlockRow("Luigi", LUIGI_SPRITE));
    pictureElement.append(createTextElement("p", "qec-caption", "= 1 logical Bell pair, protected by Steane"));
    return pictureElement;
}


/**
 * One player's block: their sprite and name, then 7 qubit tiles.
 */
function buildBlockRow(playerName, playerSprite) {
    const rowElement = createElement("div", "qec-block-row");
    const nameElement = createElement("span", "qec-block-name");
    nameElement.append(drawSprite(playerSprite, PLAYER_PIXEL_SIZE, "qec-player"), playerName);
    rowElement.append(nameElement);
    for (let position = 1; position <= STEANE_QUBIT_COUNT; position++) {
        rowElement.append(createTextElement("span", "qec-tile", `q${position}`));
    }
    return rowElement;
}


/**
 * An empty table with a caption and a header row.
 */
function buildTable(className, captionText, headers) {
    const tableElement = createElement("table", className);
    const captionElement = document.createElement("caption");
    captionElement.textContent = captionText;
    tableElement.append(captionElement);
    const headerRow = tableElement.insertRow();
    for (const header of headers) {
        const headerCell = document.createElement("th");
        headerCell.scope = "col";
        headerCell.textContent = header;
        headerRow.append(headerCell);
    }
    return tableElement;
}


/**
 * One table row of plain cells.
 */
function appendRow(tableElement, cellTexts) {
    const rowElement = tableElement.insertRow();
    for (const cellText of cellTexts) {
        rowElement.insertCell().textContent = cellText;
    }
}


/**
 * An element holding some text.
 */
function createTextElement(tagName, className, text) {
    const element = createElement(tagName, className);
    element.textContent = text;
    return element;
}

