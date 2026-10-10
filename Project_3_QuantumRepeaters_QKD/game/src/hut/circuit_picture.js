/**
 * Draws a quantum circuit from qec_codes.js ({wires, columns}) as an inline SVG in the game's pixel style: wires with
 * their labels and starting states, H boxes, CNOTs (● on the control, ⊕ on the target), and measurement boxes.
 * Optionally marks one X fault and draws, in red and thicker, every wire segment its X has spread to by then
 * (spreadXFault), with a text tag at the end of each such wire so the spread never relies on colour alone.
 *
 * Writes only the element it returns; the caller gives it an aria-label.
 */

import { spreadXFault } from "./qec_codes.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// The circuit's layout, in SVG units (1 unit = 1 CSS pixel before the hut fits the picture to its box).
const LAYOUT = {
    wireGap: 40,
    columnGap: 48,
    labelWidth: 112,
    endWidth: 104,
    topMargin: 40,
    bottomMargin: 40,
    gateSize: 26,
    measureWidth: 36,
    controlRadius: 6,
    targetRadius: 12,
    faultSize: 22,
};


/**
 * Draw a circuit.
 *
 * @param {{wires: object[], columns: object[][]}} circuit - from qec_codes.js.
 * @param {{fault?: {wire: string, afterColumn: number}, endNotes?: Object<string, string>,
 *     columnGroups?: {from: number, to: number, label: string}[]}} [options] - a fault to mark, a short note at the
 *     end of some wires (e.g. "X"), and labelled bands over groups of columns.
 * @returns {SVGSVGElement}
 */
export function drawCircuit(circuit, options = {}) {
    const geometry = measureCircuit(circuit);
    const svgElement = createSvgElement("svg", {
        viewBox: `0 0 ${geometry.widthPx} ${geometry.heightPx}`,
        width: geometry.widthPx,
        height: geometry.heightPx,
        class: "qec-circuit",
    });
    for (const group of options.columnGroups ?? []) {
        svgElement.append(drawColumnGroup(group, geometry));
    }
    for (const wire of circuit.wires) {
        svgElement.append(...drawWire(wire, geometry));
    }
    if (options.fault !== undefined) {
        svgElement.append(...drawFaultSpread(circuit, options.fault, geometry));
    }
    for (let i = 0; i < circuit.columns.length; i++) {
        for (const gate of circuit.columns[i]) {
            svgElement.append(drawGate(gate, findColumnX(i), geometry));
        }
    }
    for (const [wireId, note] of Object.entries(options.endNotes ?? {})) {
        svgElement.append(drawEndNote(wireId, note, geometry));
    }
    return svgElement;
}


/**
 * The circuit's size, where each wire sits, and where each wire's line stops (at its measurement box, if any).
 */
function measureCircuit(circuit) {
    const wireY = {};
    for (let i = 0; i < circuit.wires.length; i++) {
        wireY[circuit.wires[i].id] = LAYOUT.topMargin + i * LAYOUT.wireGap;
    }
    const lastColumnX = findColumnX(circuit.columns.length - 1);
    const lineEndX = {};
    for (const wire of circuit.wires) {
        lineEndX[wire.id] = lastColumnX + LAYOUT.columnGap / 2;
    }
    for (let i = 0; i < circuit.columns.length; i++) {
        for (const gate of circuit.columns[i]) {
            if (gate.gate === "measure") {
                lineEndX[gate.wire] = findColumnX(i);
            }
        }
    }
    const widthPx = lastColumnX + LAYOUT.columnGap / 2 + LAYOUT.endWidth;
    const heightPx = LAYOUT.topMargin + (circuit.wires.length - 1) * LAYOUT.wireGap + LAYOUT.bottomMargin;
    return { wires: circuit.wires, wireY, lineEndX, widthPx, heightPx };
}


/**
 * The x of a column's gates.
 */
function findColumnX(columnIndex) {
    return LAYOUT.labelWidth + (columnIndex + 0.5) * LAYOUT.columnGap;
}


/**
 * A wire: its name on the left, its starting state just before the line, the line, and its end label (e.g. the
 * check it measures) after its measurement box.
 */
function drawWire(wire, geometry) {
    const lineY = geometry.wireY[wire.id];
    const parts = [
        drawText(wire.label, { x: 4, y: lineY, class: "qec-wire-label" }),
        drawText(wire.start, { x: LAYOUT.labelWidth - 10, y: lineY, class: "qec-wire-start", "text-anchor": "end" }),
        createSvgElement("line", {
            x1: LAYOUT.labelWidth, y1: lineY, x2: geometry.lineEndX[wire.id], y2: lineY, class: "qec-wire",
        }),
    ];
    if (wire.endLabel !== undefined) {
        const labelX = geometry.lineEndX[wire.id] + LAYOUT.measureWidth / 2 + 8;
        parts.push(drawText(wire.endLabel, { x: labelX, y: lineY, class: "qec-wire-end" }));
    }
    return parts;
}


/**
 * One gate, centred on its column.
 */
function drawGate(gate, columnX, geometry) {
    if (gate.gate === "h") {
        return drawGateBox("H", LAYOUT.gateSize, { x: columnX, y: geometry.wireY[gate.wire] }, "qec-gate");
    }
    if (gate.gate === "measure") {
        // "MX" or "MZ": the basis is part of the box, so nothing else needs to sit after it.
        const letters = `M${gate.basis ?? ""}`;
        const center = { x: columnX, y: geometry.wireY[gate.wire] };
        return drawGateBox(letters, LAYOUT.measureWidth, center, "qec-gate is-measure");
    }
    return drawCnot(columnX, geometry.wireY[gate.control], geometry.wireY[gate.target]);
}


/**
 * A gate box, LAYOUT.gateSize tall, with its letters in it.
 */
function drawGateBox(letters, widthPx, center, className) {
    const groupElement = createSvgElement("g", { class: className });
    groupElement.append(createSvgElement("rect", {
        x: center.x - widthPx / 2, y: center.y - LAYOUT.gateSize / 2, width: widthPx, height: LAYOUT.gateSize,
    }));
    groupElement.append(drawText(letters, { x: center.x, y: center.y, "text-anchor": "middle" }));
    return groupElement;
}


/**
 * A CNOT: a dot on the control, a circled plus on the target, and the line joining them.
 */
function drawCnot(columnX, controlY, targetY) {
    const groupElement = createSvgElement("g", { class: "qec-cnot" });
    const direction = Math.sign(targetY - controlY);
    const lineEndY = targetY + direction * LAYOUT.targetRadius;
    groupElement.append(createSvgElement("line", { x1: columnX, y1: controlY, x2: columnX, y2: lineEndY }));
    groupElement.append(createSvgElement("circle", { cx: columnX, cy: controlY, r: LAYOUT.controlRadius }));
    groupElement.append(createSvgElement("circle", {
        cx: columnX, cy: targetY, r: LAYOUT.targetRadius, class: "qec-cnot-target",
    }));
    const radius = LAYOUT.targetRadius;
    groupElement.append(createSvgElement("path", {
        d: `M ${columnX - radius} ${targetY} H ${columnX + radius} M ${columnX} ${targetY - radius} V ${targetY + radius}`,
        class: "qec-cnot-plus",
    }));
    return groupElement;
}


/**
 * The fault's mark (a red box with an X) and the red wire segments its X travels along, column by column.
 */
function drawFaultSpread(circuit, fault, geometry) {
    const faultX = findColumnX(fault.afterColumn) + LAYOUT.columnGap / 2;
    const parts = [];
    let segmentStartX = faultX;
    let xWires = new Set([fault.wire]);
    for (let i = fault.afterColumn + 1; i <= circuit.columns.length; i++) {
        const segmentEndX = i < circuit.columns.length ? findColumnX(i) : Infinity;
        for (const wireId of xWires) {
            const lineEndX = Math.min(segmentEndX, geometry.lineEndX[wireId]);
            parts.push(createSvgElement("line", {
                x1: segmentStartX, y1: geometry.wireY[wireId], x2: lineEndX, y2: geometry.wireY[wireId],
                class: "qec-wire is-faulty",
            }));
        }
        xWires = spreadXFault({ columns: circuit.columns.slice(0, i + 1) }, fault.wire, fault.afterColumn);
        segmentStartX = segmentEndX;
    }
    parts.push(drawFaultMark(faultX, geometry.wireY[fault.wire]));
    return parts;
}


/**
 * The fault itself: a red square with a white X and the word "fault" under it, clear of the CNOT lines above.
 */
function drawFaultMark(centerX, centerY) {
    const groupElement = createSvgElement("g", { class: "qec-fault" });
    const halfSize = LAYOUT.faultSize / 2;
    groupElement.append(createSvgElement("rect", {
        x: centerX - halfSize, y: centerY - halfSize, width: LAYOUT.faultSize, height: LAYOUT.faultSize,
    }));
    groupElement.append(drawText("X", { x: centerX, y: centerY, "text-anchor": "middle" }));
    groupElement.append(drawText("fault", {
        x: centerX, y: centerY + halfSize + 12, "text-anchor": "middle", class: "qec-fault-word",
    }));
    return groupElement;
}


/**
 * A short note after the end of a wire, e.g. "X" for an error the fault left there.
 */
function drawEndNote(wireId, note, geometry) {
    const noteX = geometry.lineEndX[wireId] + LAYOUT.measureWidth / 2 + 8;
    const noteY = geometry.wireY[wireId];
    return drawText(note, { x: noteX, y: noteY, class: "qec-end-note" });
}


/**
 * A pale band behind a group of columns, with its label above the first wire.
 */
function drawColumnGroup(group, geometry) {
    const groupElement = createSvgElement("g", { class: "qec-column-group" });
    const leftX = findColumnX(group.from) - LAYOUT.columnGap / 2 + 2;
    const rightX = findColumnX(group.to) + LAYOUT.columnGap / 2 - 2;
    groupElement.append(createSvgElement("rect", {
        x: leftX, y: LAYOUT.topMargin - 22, width: rightX - leftX, height: geometry.heightPx - LAYOUT.topMargin + 14,
    }));
    groupElement.append(drawText(group.label, {
        x: (leftX + rightX) / 2, y: LAYOUT.topMargin - 30, "text-anchor": "middle", class: "qec-column-label",
    }));
    return groupElement;
}


/**
 * A line of SVG text, vertically centred on y.
 */
function drawText(text, attributes) {
    const textElement = createSvgElement("text", { "dominant-baseline": "central", ...attributes });
    textElement.textContent = text;
    return textElement;
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
