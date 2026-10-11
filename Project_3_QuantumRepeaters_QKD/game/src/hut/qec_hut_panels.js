/**
 * Toad's QEC hut: what Toad says, one short panel at a time. Pure; qec_hut_pictures.js draws each panel's picture
 * from qec_codes.js and hut_pager.js pages through the panels.
 *
 * Sources: A. M. Steane, Proc. R. Soc. A 452, 2551 (1996); M. A. Nielsen & I. L. Chuang, Quantum Computation and
 * Quantum Information, ch. 10; R. Chao & B. W. Reichardt, Phys. Rev. Lett. 121, 050502 (2018).
 */

import { findCorrectableErrorCount } from "./qec_codes.js";

// The Steane code's distance (Steane 1996).
const STEANE_DISTANCE = 3;

export const QEC_SOURCES = [
    "Steane, \"Multiple particle interference and quantum error correction\", Proc. R. Soc. A 452, 2551 (1996).",
    "Nielsen & Chuang, Quantum Computation and Quantum Information, ch. 10.",
    "Chao & Reichardt, \"Quantum error correction with only two extra qubits\", PRL 121, 050502 (2018).",
];
export const QEC_WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/Quantum_error_correction";
export const STEANE_WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/Steane_code";

const STEANE_CORRECTS = findCorrectableErrorCount(STEANE_DISTANCE);

// Each panel: a short heading, a few short lines, and which picture goes with it (qec_hut_pictures.js).
export const QEC_PANELS = [
    {
        heading: "Why QEC?",
        picture: "why",
        lines: [
            "Qubits are fragile: a stray bump flips |0⟩ into |1⟩, or scrambles its phase.",
            "No-cloning: you can't copy a qubit to keep a backup.",
            "So spread one logical qubit over several physical ones, and check them without peeking.",
        ],
    },
    {
        heading: "The 3-qubit bit-flip code",
        picture: "bitFlip",
        lines: [
            "|0̄⟩ = |000⟩ and |1̄⟩ = |111⟩: two CNOTs from the data qubit spread it out.",
            "Checks Z1Z2 and Z2Z3 ask \"do these two agree?\" and never read the logical bit.",
            "Their answers, the syndrome, point at the flipped qubit. Flip it back!",
        ],
    },
    {
        heading: "What [[n,k,d]] means",
        picture: "codeTable",
        lines: [
            "n physical qubits hold k logical qubits. Distance d: the fewest errors that fool the code.",
            "A code corrects up to ⌊(d−1)/2⌋ errors on any qubits.",
            "The 3-qubit code only stops bit flips: one Z already breaks it, so it is really [[3,1,1]].",
        ],
    },
    {
        heading: "The Steane code [[7,1,3]]",
        picture: "steaneDiagram",
        lines: [
            "7 qubits, 1 logical qubit, distance 3: it fixes any single error, X, Y or Z.",
            "It is the classical Hamming [7,4,3] code used twice: once for X checks, once for Z checks.",
            "Each circle is a check on 4 qubits. A flipped qubit lights up a pattern that names it.",
        ],
    },
    {
        heading: "Encoding Steane |0̄⟩",
        picture: "steaneEncoder",
        lines: [
            "Start with 7 qubits in |0⟩. H on q1, q2 and q4, then 9 CNOTs.",
            "Each H qubit spreads along its check, so the block lands in |0̄⟩.",
            "In Level 3 you build another Steane encoder (from the Error Correction Zoo) CNOT by CNOT.",
        ],
    },
    {
        heading: "Fault tolerance",
        picture: "hook",
        lines: [
            "The checks are circuits too, and their gates can fail.",
            "Fault tolerant: one fault must never grow into more errors than the code can fix.",
            `One ancilla fault mid-check spreads to 2 data qubits. Steane fixes only ${STEANE_CORRECTS}: a hook error!`,
        ],
    },
    {
        heading: "Flag qubits",
        picture: "flag",
        lines: [
            "Add one flag qubit with two CNOTs around the middle of the check.",
            "No fault: the two CNOTs cancel and the flag reads 0.",
            "A fault that could spread also hits the flag: it reads 1, so we catch it early and decode differently.",
        ],
    },
    {
        heading: "To the game!",
        picture: "toGame",
        lines: [
            "Level 3: build a Steane block yourself, then find and fix its errors.",
            "Level 4: a teleported CNOT links Mario's qubit to Luigi's through a Bell pair.",
            "Level 5: all together: 7 Bell pairs and two blocks make one logical Bell pair.",
        ],
    },
];
