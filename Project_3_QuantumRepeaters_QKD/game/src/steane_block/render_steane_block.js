/**
 * Level 3's drawing: Mario's encoder circuit (or, once the turtle attacks, the syndrome table and the fix picker) on
 * the left card, the Steane circles lit by the backend's readings on the right card, Toad's message under them, Mario
 * on the ground and the cloud turtle's zap. Looks live in styles/steane_block.css, lesson_level.css and
 * circuit_picture.css.
 *
 * Writes only the level page's elements passed in.
 */

import { drawCircuit } from "../circuit_picture.js";
import { createElement } from "../page_helpers.js";
import { CLOUD_TURTLE_SPRITE, MARIO_SPRITE, TOAD_SPRITE, drawSprite } from "../pixel_sprites.js";
import { listSteaneCheckPositions } from "../hut/qec_codes.js";
import { playTurtleZap } from "../lesson_stage.js";
import { drawSteaneDiagram } from "../steane_diagram.js";
import { CIRCUIT_MIN_COLUMN_COUNT, FIX_PAULIS, HADAMARD_POSITIONS, nameCheck } from "./steane_block_plan.js";

const MARIO_PIXEL_SIZE = 4;
const TURTLE_PIXEL_SIZE = 4;
const TOAD_PIXEL_SIZE = 3;


/**
 * Put Toad, Mario, the turtle and the Steane circles in place, and return what the level redraws.
 *
 * @param {Object<string, HTMLElement>} elements - from findElementsById in steane_block_main.js.
 * @returns {object} the scene.
 */
export function buildSteaneScene(elements) {
    elements.messageToadElement.append(drawSprite(TOAD_SPRITE, TOAD_PIXEL_SIZE, "lesson-toad"));
    elements.castElement.append(drawSprite(MARIO_SPRITE, MARIO_PIXEL_SIZE, "lesson-mario"));
    elements.turtleElement.append(drawSprite(CLOUD_TURTLE_SPRITE, TURTLE_PIXEL_SIZE, "lesson-turtle-sprite"));
    const checkPositions = listSteaneCheckPositions();
    const diagram = drawSteaneDiagram(checkPositions);
    diagram.svgElement.setAttribute("role", "img");
    elements.diagramElement.replaceChildren(diagram.svgElement);
    return { ...elements, diagram, checkNames: checkPositions.map(nameCheck) };
}


/**
 * Toad's message under the board; an error (a wrong CNOT) shows in red.
 *
 * @param {object} scene
 * @param {string} message
 * @param {boolean} [isError]
 */
export function showMessage(scene, message, isError = false) {
    scene.messageElement.textContent = message;
    scene.messageElement.classList.toggle("is-error", isError);
}


/**
 * The left card as Mario's encoder: the circuit so far, with a text alternative.
 *
 * @param {object} scene
 * @param {{wires: object[], columns: object[][]}} circuit - from buildEncoderCircuit.
 * @param {{hasHadamards: boolean, cnots: number[][], hasVerification: boolean}} buildState
 */
export function renderEncoderCard(scene, circuit, buildState) {
    scene.leftTitleElement.textContent = "Mario's encoder";
    const circuitElement = drawCircuit(circuit, { minColumnCount: CIRCUIT_MIN_COLUMN_COUNT });
    circuitElement.setAttribute("role", "img");
    circuitElement.setAttribute("aria-label", describeEncoder(buildState));
    scene.leftBodyElement.replaceChildren(circuitElement);
}


/**
 * The encoder in words, for screen readers.
 */
function describeEncoder(buildState) {
    const parts = ["Seven qubits q1 to q7 start in |0⟩."];
    if (buildState.hasHadamards) {
        parts.push(`H on ${HADAMARD_POSITIONS.map((position) => `q${position}`).join(", ")}.`);
    }
    if (buildState.cnots.length > 0) {
        const cnotTexts = buildState.cnots.map(([control, target]) => `q${control} to q${target}`);
        parts.push(`CNOTs: ${cnotTexts.join(", ")}.`);
    }
    if (buildState.hasVerification) {
        parts.push("Then CNOTs from q1, q6 and q7 onto the ancilla, which is measured.");
    }
    return parts.join(" ");
}


/**
 * Light the circles from the backend's X-check readings: +1 lit, 0 (random) dashed. The round's own circle is
 * outlined. Each label says "+1" or "?" too.
 *
 * @param {object} scene
 * @param {number[] | null} xChecks - one expectation per check, or null before any reading.
 * @param {number | null} activeCheckIndex - the build round's circle, or null.
 */
export function renderBuildCircles(scene, xChecks, activeCheckIndex) {
    const readerTexts = [];
    for (let i = 0; i < scene.checkNames.length; i++) {
        const isLit = xChecks !== null && xChecks[i] === 1;
        const circleElement = scene.diagram.circleElements[i];
        circleElement.classList.toggle("is-lit", isLit);
        circleElement.classList.toggle("is-random", !isLit);
        circleElement.classList.toggle("is-flagged", false);
        circleElement.classList.toggle("is-active", i === activeCheckIndex);
        const readingText = isLit ? "+1" : "?";
        scene.diagram.labelElements[i].textContent = `${scene.checkNames[i]} ${readingText}`;
        readerTexts.push(`circle ${scene.checkNames[i]} ${isLit ? "reads +1" : "is random"}`);
    }
    scene.diagram.svgElement.setAttribute("aria-label", `The X checks: ${readerTexts.join(", ")}.`);
}


/**
 * Light the circles from the measured syndromes: a circle whose X or Z check read 1 turns red and its label says "!";
 * the others stay lit. With no syndromes (before measuring, or after a good fix) all stay lit.
 *
 * @param {object} scene
 * @param {{zSyndrome: number[], xSyndrome: number[]} | null} syndromes
 */
export function renderErrorCircles(scene, syndromes) {
    const readerTexts = [];
    for (let i = 0; i < scene.checkNames.length; i++) {
        const isFlagged = syndromes !== null && (syndromes.zSyndrome[i] === 1 || syndromes.xSyndrome[i] === 1);
        const circleElement = scene.diagram.circleElements[i];
        circleElement.classList.toggle("is-lit", !isFlagged);
        circleElement.classList.toggle("is-random", false);
        circleElement.classList.toggle("is-flagged", isFlagged);
        circleElement.classList.toggle("is-active", false);
        scene.diagram.labelElements[i].textContent = `${scene.checkNames[i]} ${isFlagged ? "!" : "+1"}`;
        readerTexts.push(`circle ${scene.checkNames[i]} ${isFlagged ? "caught an error" : "is quiet"}`);
    }
    scene.diagram.svgElement.setAttribute("aria-label", `The checks: ${readerTexts.join(", ")}.`);
}


/**
 * Ring the qubit the player is about to fix, or none.
 *
 * @param {object} scene
 * @param {number | null} position
 */
export function renderCursorDot(scene, position) {
    for (const [dotPosition, dotElement] of Object.entries(scene.diagram.dotElements)) {
        dotElement.classList.toggle("is-cursor", Number(dotPosition) === position);
    }
}


/**
 * Mark in red the qubit a wrong CNOT went to, or none.
 *
 * @param {object} scene
 * @param {number | null} position
 */
export function renderWrongDot(scene, position) {
    for (const [dotPosition, dotElement] of Object.entries(scene.diagram.dotElements)) {
        dotElement.classList.toggle("is-wrong", Number(dotPosition) === position);
    }
}


/**
 * The left card once the turtle attacks: the syndrome table ("?" until measured) and the fix picker.
 *
 * @param {object} scene
 * @param {{zSyndrome: number[], xSyndrome: number[]} | null} syndromes - null before measuring.
 * @param {{pauli: string, position: number} | null} fix - the picker's choice, or null while not picking.
 */
export function renderSyndromeCard(scene, syndromes, fix) {
    scene.leftTitleElement.textContent = "The checks, measured with the ancilla";
    const tableElement = createElement("table", "lesson-table steane-syndrome-table");
    const captionElement = document.createElement("caption");
    captionElement.textContent = "Syndromes: 0 = quiet, 1 = caught something";
    tableElement.append(captionElement);
    appendRow(tableElement, ["Circle", "Z check (sees X)", "X check (sees Z)"], true);
    for (let i = 0; i < scene.checkNames.length; i++) {
        const zText = syndromes === null ? "?" : String(syndromes.zSyndrome[i]);
        const xText = syndromes === null ? "?" : String(syndromes.xSyndrome[i]);
        appendRow(tableElement, [scene.checkNames[i], zText, xText], false);
    }
    const bodyParts = [tableElement];
    if (fix !== null) {
        bodyParts.push(buildFixPicker(fix));
    }
    scene.leftBodyElement.replaceChildren(...bodyParts);
}


/**
 * One table row: a header cell, then plain cells (or all header cells for the column titles). A cell reading 1 is
 * marked, so it stands out by more than its colour.
 */
function appendRow(tableElement, cellTexts, isHeaderRow) {
    const rowElement = tableElement.insertRow();
    for (let i = 0; i < cellTexts.length; i++) {
        const isHeaderCell = isHeaderRow || i === 0;
        const cellElement = document.createElement(isHeaderCell ? "th" : "td");
        cellElement.scope = isHeaderRow ? "col" : "row";
        cellElement.textContent = cellTexts[i];
        cellElement.classList.toggle("is-one", !isHeaderCell && cellTexts[i] === "1");
        cellElement.classList.toggle("is-unknown", !isHeaderCell && cellTexts[i] === "?");
        rowElement.append(cellElement);
    }
}


/**
 * The fix picker: the three Paulis with the chosen one in brackets, and the chosen qubit.
 */
function buildFixPicker(fix) {
    const pickerElement = createElement("p", "steane-fix-picker");
    const pauliTexts = [];
    for (const pauli of FIX_PAULIS) {
        pauliTexts.push(pauli === fix.pauli ? `[${pauli}]` : ` ${pauli} `);
    }
    pickerElement.textContent = `Fix: ${pauliTexts.join(" ")} on q${fix.position}`;
    return pickerElement;
}


/**
 * The turtle flies over and zaps the block: it flashes while the turtle passes. Resolves when the turtle has gone.
 *
 * @param {object} scene
 */
export async function playZap(scene) {
    await playTurtleZap(scene.turtleElement, scene.diagram.svgElement);
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
