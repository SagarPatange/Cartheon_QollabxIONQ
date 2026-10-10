/**
 * Tests for src/hut/qec_hut_panels.js: Toad's QEC panels and their sources.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    QEC_PANELS, QEC_SOURCES, QEC_WIKIPEDIA_URL, STEANE_WIKIPEDIA_URL,
} from "../../src/hut/qec_hut_panels.js";

// The game's style is terse: no line runs past this many characters.
const LONGEST_LINE_CHARACTERS = 110;


test("the panels go: why, bit flip, [[n,k,d]], Steane, its encoder, fault tolerance, flags, the game", () => {
    const pictures = QEC_PANELS.map((panel) => panel.picture);
    assert.deepEqual(pictures, [
        "why", "bitFlip", "codeTable", "steaneDiagram", "steaneEncoder", "hook", "flag", "toGame",
    ]);
});


test("every panel line is short", () => {
    for (const panel of QEC_PANELS) {
        for (const line of panel.lines) {
            assert.ok(line.length <= LONGEST_LINE_CHARACTERS, `"${line}" is ${line.length} characters`);
        }
    }
});


test("the [[n,k,d]] panel gives the ⌊(d−1)/2⌋ rule and says the 3-qubit code only stops bit flips", () => {
    const codeText = QEC_PANELS[2].lines.join(" ");
    assert.match(codeText, /⌊\(d−1\)\/2⌋/);
    assert.match(codeText, /only stops bit flips/);
    assert.match(codeText, /\[\[3,1,1\]\]/);
});


test("the fault-tolerance panel says one fault spread to 2 qubits beats a code that fixes 1", () => {
    assert.match(QEC_PANELS[5].lines.join(" "), /2 data qubits\. Steane fixes only 1/);
});


test("the sources name Steane 1996, Nielsen & Chuang ch. 10 and Chao & Reichardt 2018, with Wikipedia links", () => {
    const sourcesText = QEC_SOURCES.join(" ");
    assert.match(sourcesText, /Steane.*452, 2551 \(1996\)/);
    assert.match(sourcesText, /Nielsen & Chuang.*ch\. 10/);
    assert.match(sourcesText, /Chao & Reichardt.*121, 050502 \(2018\)/);
    assert.equal(QEC_WIKIPEDIA_URL, "https://en.wikipedia.org/wiki/Quantum_error_correction");
    assert.equal(STEANE_WIKIPEDIA_URL, "https://en.wikipedia.org/wiki/Steane_code");
});
