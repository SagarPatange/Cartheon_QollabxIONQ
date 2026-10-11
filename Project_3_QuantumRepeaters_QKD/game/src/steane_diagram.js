/**
 * The Steane code drawn as three overlapping circles, one per check, with the 7 qubits in their regions (Steane 1996;
 * the circles are the rows of the Hamming [7,4,3] parity-check matrix). Toad's QEC hut shows it as a picture; Level 3
 * lights its circles and moves a cursor over its qubits, so the elements come back for the caller to style.
 *
 * A qubit's spot depends only on which circles hold it, so the same picture serves any numbering of the qubits: the
 * hut's (circles 4567, 2367, 1357) and Level 3's Error Correction Zoo layout (0136, 0235, 1234).
 *
 * Writes only the elements it returns; the caller gives the SVG its aria-label.
 */

import { STEANE_DIAGRAM, listSteaneCheckPositions } from "./hut/qec_codes.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// The diagram's drawing area, in the units of STEANE_DIAGRAM.
export const STEANE_DIAGRAM_SIZE = { widthPx: 300, heightPx: 270 };
const QUBIT_DOT_RADIUS = 13;
// How far outside its circle a check's name sits.
const CIRCLE_LABEL_GAP = 14;


/**
 * Draw the diagram.
 *
 * @param {number[][]} checkPositions - the qubits in each check, e.g. from listSteaneCheckPositions().
 * @returns {{svgElement: SVGSVGElement, circleElements: SVGCircleElement[], labelElements: SVGTextElement[],
 *     dotElements: Object<number, SVGGElement>}} the circles and their labels in check order, and the qubit dots by
 *     position.
 */
export function drawSteaneDiagram(checkPositions) {
    const svgElement = createSvgElement("svg", {
        viewBox: `0 0 ${STEANE_DIAGRAM_SIZE.widthPx} ${STEANE_DIAGRAM_SIZE.heightPx}`,
        width: STEANE_DIAGRAM_SIZE.widthPx,
        height: STEANE_DIAGRAM_SIZE.heightPx,
        class: "qec-steane-diagram",
    });
    const circleElements = [];
    const labelElements = [];
    for (let i = 0; i < STEANE_DIAGRAM.circles.length; i++) {
        const circleParts = drawCheckCircle(STEANE_DIAGRAM.circles[i], checkPositions[i], i);
        circleElements.push(circleParts.circleElement);
        labelElements.push(circleParts.labelElement);
        svgElement.append(circleParts.circleElement, circleParts.labelElement);
    }
    const dotElements = {};
    const spotByRegion = findSpotsByRegion();
    for (const position of listPositions(checkPositions)) {
        const dotElement = drawQubitDot(String(position), spotByRegion[regionKey(position, checkPositions)]);
        dotElements[position] = dotElement;
        svgElement.append(dotElement);
    }
    return { svgElement, circleElements, labelElements, dotElements };
}


/**
 * The diagram in words: which qubits each circle holds.
 *
 * @param {number[][]} checkPositions
 * @returns {string}
 */
export function describeSteaneDiagram(checkPositions) {
    const circleTexts = checkPositions.map((positions, i) => `circle ${i + 1} holds qubits ${positions.join(", ")}`);
    const centre = listPositions(checkPositions).find((position) => regionKey(position, checkPositions) === "111");
    return `Three overlapping circles, one per check: ${circleTexts.join("; ")}. Qubit ${centre} sits in all three.`;
}


/**
 * Every qubit position in the checks, sorted.
 */
function listPositions(checkPositions) {
    return [...new Set(checkPositions.flat())].sort((first, second) => first - second);
}


/**
 * Which circles hold a qubit, e.g. "110" for the first two.
 */
function regionKey(position, checkPositions) {
    return checkPositions.map((positions) => (positions.includes(position) ? "1" : "0")).join("");
}


/**
 * Each region's spot (by regionKey), read off STEANE_DIAGRAM's spots for the hut's numbering.
 */
function findSpotsByRegion() {
    const hutChecks = listSteaneCheckPositions();
    const spots = {};
    for (const [positionText, spot] of Object.entries(STEANE_DIAGRAM.qubitSpots)) {
        spots[regionKey(Number(positionText), hutChecks)] = spot;
    }
    return spots;
}


/**
 * One check's circle and its name (e.g. "4567"): above the top circle, below the two bottom ones.
 */
function drawCheckCircle(circle, positions, circleIndex) {
    const circleElement = createSvgElement("circle", {
        cx: circle.centerX, cy: circle.centerY, r: STEANE_DIAGRAM.circleRadius,
        class: `qec-check-circle is-check-${circleIndex + 1}`,
    });
    const isTopCircle = circleIndex === 0;
    const labelOffset = STEANE_DIAGRAM.circleRadius + CIRCLE_LABEL_GAP;
    const labelY = isTopCircle ? circle.centerY - labelOffset : circle.centerY + labelOffset;
    const labelElement = createSvgElement("text", {
        x: circle.centerX, y: labelY, "text-anchor": "middle", "dominant-baseline": "central",
        class: "qec-check-label",
    });
    labelElement.textContent = positions.join("");
    return { circleElement, labelElement };
}


/**
 * A numbered qubit dot.
 */
function drawQubitDot(positionText, spot) {
    const groupElement = createSvgElement("g", { class: "qec-qubit-dot" });
    groupElement.append(createSvgElement("circle", { cx: spot.x, cy: spot.y, r: QUBIT_DOT_RADIUS }));
    const numberElement = createSvgElement("text", {
        x: spot.x, y: spot.y + 1, "text-anchor": "middle", "dominant-baseline": "central",
    });
    numberElement.textContent = positionText;
    groupElement.append(numberElement);
    return groupElement;
}


/**
 * An SVG element with its attributes set.
 */
function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    return element;
}
