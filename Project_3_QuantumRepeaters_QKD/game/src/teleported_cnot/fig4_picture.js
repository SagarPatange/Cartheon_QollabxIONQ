/**
 * Level 4's one-pair circuit, drawn the way the paper draws Fig. 4: Mario's data |α⟩ (dA) on top and Luigi's |β⟩
 * (dB) at the bottom, the Bell pair cA–cB between them in a blue box, both CNOTs side by side in orange boxes, the
 * measurement meters (Z on cA, X on cB), and double classical wires from each meter to its fix (Z-meter → X on dB,
 * X-meter → Z on dA), with the measuring and fixing in a green box. Each part is faded until its step is played.
 *
 * Shares the look of src/circuit_picture.js (the .qec-circuit, .qec-gate and .qec-cnot styles); the boxes, meters
 * and classical wires are styled in styles/teleported_cnot.css. Writes only the element it returns.
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Where everything sits, in SVG units (the card scales the picture to fit).
// Left to right: the owner's name and bracket, the wire names, the Bell pair's box (with |α⟩ and |β⟩ beside it on the
// data wires), the CNOTs, the two meters with their fixes above or below them, and the outputs.
const WIRE_Y = { dA: 50, cA: 110, cB: 170, dB: 230 };
const OWNER_X = 58;
const BRACE_X = 66;
const BRACE_ARM = 6;
const NAME_X = 84;
const PAIR_BOX_X = 120;
const PAIR_BOX_WIDTH = 100;
const START_X = 204;
const WIRE_START_X = 212;
const CNOT_X = 272;
const Z_METER_X = 340;
const X_METER_X = 408;
const WIRE_END_X = 460;
const OUTPUT_X = 470;
const WIDTH = 580;
const HEIGHT = 286;
const GATE_SIZE = 26;
const CONTROL_RADIUS = 6;
const TARGET_RADIUS = 12;
const METER_HALF_HEIGHT = 13;
// The two lines of a classical wire sit this far either side of its centre.
const CLASSICAL_HALF_GAP = 2;


/**
 * Draw the figure.
 *
 * @param {{alphaText: string, betaText: string, parts: Object<string, string>, fixes: {x: string, z: string},
 *     bits: {m: number | null, n: number | null}}} figure - from buildPairCircuit (teleported_cnot_plan.js).
 * @returns {SVGSVGElement}
 */
export function drawFig4(figure) {
    const svgElement = createSvgElement("svg", {
        viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT, class: "qec-circuit fig4-circuit",
    });
    svgElement.append(
        drawBox("is-pair", PAIR_BOX_X, WIRE_Y.cA - 22, PAIR_BOX_WIDTH, WIRE_Y.cB - WIRE_Y.cA + 44, figure.parts.pair),
        drawBox("is-cnot", CNOT_X - 20, WIRE_Y.dA - 18, 40, WIRE_Y.cA - WIRE_Y.dA + 36, figure.parts.cnotA),
        drawBox("is-cnot", CNOT_X - 20, WIRE_Y.cB - 18, 40, WIRE_Y.dB - WIRE_Y.cB + 36, figure.parts.cnotB),
        drawBox("is-fix", Z_METER_X - 26, WIRE_Y.dA - 24, X_METER_X - Z_METER_X + 52, WIRE_Y.dB - WIRE_Y.dA + 48,
            figure.parts.measureA),
        ...drawRegisterBraces(),
        ...drawWires(figure),
        drawCnot(WIRE_Y.dA, WIRE_Y.cA, figure.parts.cnotA),
        drawCnot(WIRE_Y.cB, WIRE_Y.dB, figure.parts.cnotB),
        drawClassicalWire(Z_METER_X, WIRE_Y.cA + METER_HALF_HEIGHT, WIRE_Y.dB - GATE_SIZE / 2, figure.parts.sendM),
        drawClassicalWire(X_METER_X, WIRE_Y.dA + GATE_SIZE / 2, WIRE_Y.cB - METER_HALF_HEIGHT, figure.parts.sendN),
        drawMeter(Z_METER_X, WIRE_Y.cA, "Z", figure.parts.measureA),
        drawMeter(X_METER_X, WIRE_Y.cB, "X", figure.parts.measureB),
        ...drawBits(figure.bits),
    );
    appendFix(svgElement, "X", Z_METER_X, WIRE_Y.dB, figure.fixes.x);
    appendFix(svgElement, "Z", X_METER_X, WIRE_Y.dA, figure.fixes.z);
    return svgElement;
}


/**
 * Mario's register (dA, cA) and Luigi's (cB, dB), each a bracket with its owner's name, as the paper's R¹ and R².
 */
function drawRegisterBraces() {
    const parts = [];
    for (const [owner, topWire, bottomWire] of [["Mario", "dA", "cA"], ["Luigi", "cB", "dB"]]) {
        const topY = WIRE_Y[topWire] - 10;
        const bottomY = WIRE_Y[bottomWire] + 10;
        parts.push(createSvgElement("path", {
            d: `M ${BRACE_X + BRACE_ARM} ${topY} H ${BRACE_X} V ${bottomY} H ${BRACE_X + BRACE_ARM}`,
            class: "fig4-brace",
        }));
        const ownerY = (topY + bottomY) / 2;
        parts.push(drawText(owner, { x: OWNER_X, y: ownerY, "text-anchor": "end", class: "fig4-owner" }));
    }
    return parts;
}


/**
 * The four wires with their names; |α⟩ and |β⟩ before the data wires and the Bell pair's state in its box; the
 * data wires run to the outputs |α⟩ and |β ⊕ α⟩, the halves stop at their meters.
 */
function drawWires(figure) {
    const lineEndX = { dA: WIRE_END_X, cA: Z_METER_X, cB: X_METER_X, dB: WIRE_END_X };
    const parts = [];
    for (const [wireId, wireY] of Object.entries(WIRE_Y)) {
        const isData = wireId === "dA" || wireId === "dB";
        parts.push(drawText(wireId, { x: NAME_X, y: wireY, class: "qec-wire-label" }));
        // The halves start where the Bell pair's box ends; the data wires just after |α⟩ and |β⟩.
        const lineStartX = isData ? WIRE_START_X : PAIR_BOX_X + PAIR_BOX_WIDTH;
        parts.push(createSvgElement("line", {
            x1: lineStartX, y1: wireY, x2: lineEndX[wireId], y2: wireY, class: "qec-wire",
        }));
    }
    parts.push(drawText("|α⟩", { x: START_X, y: WIRE_Y.dA, "text-anchor": "end", class: "qec-wire-start" }));
    parts.push(drawText("|β⟩", { x: START_X, y: WIRE_Y.dB, "text-anchor": "end", class: "qec-wire-start" }));
    parts.push(drawText("|00⟩+|11⟩", {
        x: PAIR_BOX_X + PAIR_BOX_WIDTH / 2, y: (WIRE_Y.cA + WIRE_Y.cB) / 2, "text-anchor": "middle",
        class: "fig4-pair-state",
    }));
    parts.push(drawText("|α⟩", { x: OUTPUT_X, y: WIRE_Y.dA, class: "qec-wire-start" }));
    parts.push(drawText("|β ⊕ α⟩", { x: OUTPUT_X, y: WIRE_Y.dB, class: "qec-wire-start" }));
    return parts;
}


/**
 * A dashed box around part of the figure: the Bell pair (blue), a CNOT (orange) or the measure-and-fix (green).
 */
function drawBox(kindClass, x, y, width, height, state) {
    const boxElement = createSvgElement("rect", { x, y, width, height, class: `fig4-box ${kindClass}` });
    markFuture(boxElement, state);
    return boxElement;
}


/**
 * A CNOT: a dot on the control, a circled plus on the target, and the line joining them.
 */
function drawCnot(controlY, targetY, state) {
    const groupElement = createSvgElement("g", { class: "qec-cnot" });
    const direction = Math.sign(targetY - controlY);
    groupElement.append(
        createSvgElement("line", { x1: CNOT_X, y1: controlY, x2: CNOT_X, y2: targetY + direction * TARGET_RADIUS }),
        createSvgElement("circle", { cx: CNOT_X, cy: controlY, r: CONTROL_RADIUS }),
        createSvgElement("circle", { cx: CNOT_X, cy: targetY, r: TARGET_RADIUS, class: "qec-cnot-target" }),
        createSvgElement("path", {
            d: `M ${CNOT_X - TARGET_RADIUS} ${targetY} H ${CNOT_X + TARGET_RADIUS} `
                + `M ${CNOT_X} ${targetY - TARGET_RADIUS} V ${targetY + TARGET_RADIUS}`,
            class: "qec-cnot-plus",
        }),
    );
    markFuture(groupElement, state);
    return groupElement;
}


/**
 * A meter as the paper draws it: a box with a pointed left end, the basis letter inside.
 */
function drawMeter(centerX, centerY, basis, state) {
    const groupElement = createSvgElement("g", { class: "fig4-meter" });
    const top = centerY - METER_HALF_HEIGHT;
    const bottom = centerY + METER_HALF_HEIGHT;
    groupElement.append(
        createSvgElement("polygon", {
            points: `${centerX - 16},${centerY} ${centerX - 7},${top} ${centerX + 15},${top} `
                + `${centerX + 15},${bottom} ${centerX - 7},${bottom}`,
        }),
        drawText(basis, { x: centerX + 3, y: centerY, "text-anchor": "middle" }),
    );
    markFuture(groupElement, state);
    return groupElement;
}


/**
 * A classical wire: two parallel lines from a meter to the fix it controls.
 */
function drawClassicalWire(x, fromY, toY, state) {
    const groupElement = createSvgElement("g", { class: "fig4-classical" });
    for (const offset of [-CLASSICAL_HALF_GAP, CLASSICAL_HALF_GAP]) {
        groupElement.append(createSvgElement("line", { x1: x + offset, y1: fromY, x2: x + offset, y2: toY }));
    }
    markFuture(groupElement, state);
    return groupElement;
}


/**
 * The measured bits, beside the classical wires that carry them: m (from cA) and n (from cB).
 */
function drawBits(bits) {
    const parts = [];
    if (bits.m !== null) {
        parts.push(drawText(`m=${bits.m}`, { x: Z_METER_X + 8, y: (WIRE_Y.cB + WIRE_Y.dB) / 2, class: "fig4-bit" }));
    }
    if (bits.n !== null) {
        parts.push(drawText(`n=${bits.n}`, { x: X_METER_X + 8, y: (WIRE_Y.dA + WIRE_Y.cA) / 2, class: "fig4-bit" }));
    }
    return parts;
}


/**
 * A fix box on a data wire, unless the player chose to leave it out; faded until the player chooses.
 */
function appendFix(svgElement, letter, centerX, centerY, fixState) {
    if (fixState === "hidden") {
        return;
    }
    const groupElement = createSvgElement("g", { class: "qec-gate fig4-fix" });
    groupElement.append(
        createSvgElement("rect", {
            x: centerX - GATE_SIZE / 2, y: centerY - GATE_SIZE / 2, width: GATE_SIZE, height: GATE_SIZE,
        }),
        drawText(letter, { x: centerX, y: centerY, "text-anchor": "middle" }),
    );
    markFuture(groupElement, fixState === "faded" ? "future" : "done");
    svgElement.append(groupElement);
}


function markFuture(element, state) {
    element.classList.toggle("is-future", state !== "done");
}


function drawText(text, attributes) {
    const textElement = createSvgElement("text", { "dominant-baseline": "central", ...attributes });
    textElement.textContent = text;
    return textElement;
}


function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    return element;
}
