/**
 * Level 6's swap tutorial, one Space press per page: the 11 steps of QRECEC_3QubitRepetition.ipynb on the chain
 * Alice – Bob – Charlie, with the 3-qubit repetition code, so every block is 3 qubits drawn one by one in its castle
 * (Alice 6 slots, Bob 12, Charlie 6; chain_slots.js). Between the steps the game pauses on lesson notes that explain
 * the code: what it stores, how its parities find a bit flip, what it cannot fix, and why Bob's swap needs it. For
 * each page: the text the sky card shows, what every qubit looks like once it is done, and the short animations that
 * lead there (bits riding the fiber, a correction flashing on the qubits it acts on).
 *
 * Pure functions with no DOM, so they can be tested in node; src/qkd/render_swap_tutorial.js draws them. Every number
 * comes from a POST /api/repetition-swap response (backend/src/quantum_bros/protocol/repetition_swap.py).
 */

import {
    BELL, FIXED, FLIPPED, IDLE, LINK_REGISTERS, MEASURED, PAIR, PLUS, QUBITS_PER_BLOCK, USED, WAITING, ZERO,
    fillRegisters,
} from "./chain_slots.js";

export const STEP_COUNT = 11;

// A page is either a notebook step (it moves the protocol on) or a lesson note (the game pauses to explain).
export const STEP_PAGE = "step";
export const NOTE_PAGE = "note";

// Animations, played before a step's end state is drawn.
export const HERALD_EFFECT = "herald";
export const PACKET_EFFECT = "packet";
export const FLASH_EFFECT = "flash";
// A flash's tone: a correction applied by the protocol, an error, or a bit the decoder flipped back.
export const CORRECTION_TONE = "correction";
export const ERROR_TONE = "error";
export const FIX_TONE = "fix";

const ALICE_LINK = 0;
const CHARLIE_LINK = 1;
const ALL_POSITIONS = [0, 1, 2];

// What Space does next, in the key hints, for steps 1 to 11.
const STEP_ACTIONS = [
    "Initialize", "Bell pairs", "Encode", "Teleported CNOT", "Remove b, c", "Second link", "Combine", "Swap",
    "Error correction", "Pauli frame", "Fidelity",
];


/**
 * Every page of the tutorial in the order Space shows them: three notes on the repetition code, Steps 1-7, a note on
 * swapping, Step 8, a note asking which bit flipped, Steps 9-11, and a closing note.
 *
 * @param {object} response - RepetitionSwapResponse JSON.
 * @returns {{kind: string, counter: string, action: string, title: string,
 *     lines: Array<Array<string|{symbol: string, superscript?: string}>>, effects: object[], stepNumber: number,
 *     focusedRegisters: string[]}[]} lines hold plain strings and kets ({symbol, superscript}), drawn with a tilde
 *     over the symbol (a logical state). stepNumber is how many notebook steps are done once the page is shown.
 */
export function buildTutorialPages(response) {
    checkResponse(response);
    const steps = buildTutorialSteps(response);
    const pages = [describeCodeNote(), describeParityNote(), describePhaseFlipNote()];
    pages.push(...steps.slice(0, 7));
    pages.push(describeSwapNote());
    pages.push(steps[7]);
    pages.push(describeSpotTheFlipNote(response.swap));
    pages.push(...steps.slice(8));
    pages.push(describeClosingNote(response));
    return pages;
}


/**
 * The 11 notebook steps, in order, each a page with its number, counter and key-hint action.
 */
function buildTutorialSteps(response) {
    const steps = [
        describeInitialize(),
        describeBellPairs(),
        describeEncoding(),
        describeTeleportedCnot(response.links[ALICE_LINK]),
        describeRemoval(response.links[ALICE_LINK]),
        describeSecondLink(response.links[CHARLIE_LINK]),
        describeCombine(),
        describeSwap(response.swap),
        describeErrorCorrection(response.swap),
        describeFrame(response.swap),
        describeFidelity(response),
    ];
    for (let i = 0; i < steps.length; i++) {
        const stepNumber = i + 1;
        Object.assign(steps[i], {
            kind: STEP_PAGE,
            counter: `STEP ${stepNumber}/${STEP_COUNT}`,
            action: `Step ${stepNumber}: ${STEP_ACTIONS[i]}`,
            stepNumber,
            focusedRegisters: stepNumber === 7 ? ["d", "a2"] : [],
        });
    }
    return steps;
}


/**
 * A lesson note: the game pauses on it, nothing moves, and the registers it talks about glow.
 */
function makeNote(action, title, lines, stepNumber, focusedRegisters) {
    return { kind: NOTE_PAGE, counter: "PAUSED", action, title, lines, effects: [], stepNumber, focusedRegisters };
}


function describeCodeNote() {
    return makeNote(
        "The repetition code",
        "The 3-qubit repetition code",
        [
            ["One logical qubit lives on 3 physical ones: ", { symbol: "0" }, " = |000⟩ and ", { symbol: "1" },
                " = |111⟩."],
            ["α|0⟩ + β|1⟩ -> α|000⟩ + β|111⟩: one state shared by 3 qubits, not 3 copies of it."],
            ["Each block fills 3 slots: Alice holds 6 (a, b), Bob 12 (c, d, a2, b2), Charlie 6 (c2, d2)."],
        ],
        0,
        ["a", "d", "a2", "d2"],
    );
}


function describeParityNote() {
    return makeNote(
        "How it finds a flip",
        "How the code finds a bit flip",
        [
            ["Compare neighbours: s1 = q0 xor q1, s2 = q1 xor q2. They show where the qubits disagree,"],
            ["never which logical bit they hold. s1 s2 = 00: no flip, 10: q0, 11: q1, 01: q2."],
            ["One flip is always found. Two flips fool the code, which is rare when p is small."],
        ],
        0,
        ["a"],
    );
}


function describePhaseFlipNote() {
    return makeNote(
        "What it cannot fix",
        "What the code cannot fix",
        [
            ["A phase flip (Z) on any qubit turns |000⟩ + |111⟩ into |000⟩ - |111⟩: no parity sees it."],
            ["So bits read in Z can be corrected, bits read in X cannot. Watch for this in Step 9."],
            ["(The 7-qubit Steane code of Levels 3-5 catches both kinds, with 7 qubits per block.)"],
        ],
        0,
        ["a"],
    );
}


function describeSwapNote() {
    return makeNote(
        "Why swap?",
        "Entanglement swapping",
        [
            ["Bob measures d and a2 together, in the Bell basis. That entangles Alice's a with Charlie's d2,"],
            ["though they never met. Two random bits, m_x and m_z, name the Bell pair they got."],
            ["Each bit is logical: Bob reads all 3 qubits of a block, then decodes them."],
        ],
        7,
        ["d", "a2"],
    );
}


function describeSpotTheFlipNote(swap) {
    return makeNote(
        "Find the flip",
        "Spot the flip",
        [
            [`a2 read ${formatBits(swap.z_bits)}. A codeword has 3 equal bits (000 or 111), so one bit is wrong.`],
            ["Which one? Bob's decoder finds it from the two parities alone. Press Space to run it."],
        ],
        8,
        ["a2"],
    );
}


function describeClosingNote(response) {
    const fixedFidelity = response.after_frame.fidelity.toFixed(3);
    const unfixedFidelity = response.without_fix.fidelity.toFixed(3);
    return makeNote(
        "Wrap up",
        "Why the correction matters",
        [
            [`One flipped bit at Bob would have sent Charlie the wrong frame: F = ${unfixedFidelity}, not ${
                fixedFidelity}.`],
            ["Fixing bits at every repeater stops errors piling up along a long chain: that is QRE-CEC."],
            ["Next: send Peach a secret. Every key bit comes from a pair made by this same 6-12-6 chain."],
        ],
        STEP_COUNT,
        ["a", "d2"],
    );
}


/**
 * Fail fast on a response the steps cannot describe.
 */
function checkResponse(response) {
    if (response.links.length !== 2) {
        throw new Error(`expected 2 links, got ${response.links.length}`);
    }
    if (response.swap.x_bits.length !== QUBITS_PER_BLOCK || response.swap.z_bits.length !== QUBITS_PER_BLOCK) {
        throw new Error(`expected ${QUBITS_PER_BLOCK} bits per block`);
    }
}


function describeInitialize() {
    return {
        title: "Initialize the 4n qubits",
        lines: [
            ["Each link gets 4n = 12 qubits (n = 3): data blocks a, d and communication qubits b, c."],
            ["Alice holds a, b; Bob holds c, d. All start in |0⟩. Bob–Charlie waits for Step 6."],
        ],
        effects: [],
    };
}


function describeBellPairs() {
    return {
        title: "Physical Bell pairs between b and c",
        lines: [
            ["The BSM node heralds one pair per row (Level 1 showed how): the fiber turns gold."],
            ["Φ⁺ = (|00⟩ + |11⟩)/√2 on each b[i], c[i], for i = 0, 1, 2."],
        ],
        effects: [{ kind: HERALD_EFFECT, link: ALICE_LINK }],
    };
}


function describeEncoding() {
    return {
        title: "Encode a and d with the repetition code",
        lines: [
            ["Two CNOTs copy the first qubit's bit onto the others: α|0⟩ + β|1⟩ -> α|000⟩ + β|111⟩."],
            ["a starts in |+⟩, so a = ", { symbol: "+" }, " = (|000⟩ + |111⟩)/√2, and d = ", { symbol: "0" },
                " = |000⟩."],
        ],
        effects: [],
    };
}


function describeTeleportedCnot(link) {
    return {
        title: "Teleported CNOT from a to d, using the b–c pairs",
        lines: [
            [`Alice: CNOT a->b, reads b in Z: m = ${formatBits(link.m_bits)}. Bob flips (X) each d[i] where m = 1.`],
            [`Bob: CNOT c->d, reads c in X: n = ${formatBits(link.n_bits)}. Alice applies Z to each a[i] where n = 1.`],
        ],
        effects: buildTeleportEffects(ALICE_LINK, link),
    };
}


/**
 * The teleported CNOT's animation on one link: m rides right and X lands on the right block, then n rides left and Z
 * lands on the left block.
 */
function buildTeleportEffects(linkIndex, link) {
    const [leftData, , , rightData] = LINK_REGISTERS[linkIndex];
    return [
        { kind: PACKET_EFFECT, link: linkIndex, text: `m=${link.m_bits.join("")}`, direction: "right" },
        makeFlash(rightData, listSetPositions(link.m_bits), "X", CORRECTION_TONE),
        { kind: PACKET_EFFECT, link: linkIndex, text: `n=${link.n_bits.join("")}`, direction: "left" },
        makeFlash(leftData, listSetPositions(link.n_bits), "Z", CORRECTION_TONE),
    ];
}


function describeRemoval(link) {
    return {
        title: "Remove blocks b and c",
        lines: [
            ["b and c are used up. a and d now hold ", { symbol: "Φ", superscript: "+" },
                " = (|000,000⟩ + |111,111⟩)/√2."],
            [`The simulator checks it: logical ZZ = ${formatSign(link.zz)}, logical XX = ${formatSign(link.xx)}.`],
        ],
        effects: [],
    };
}


function describeSecondLink(link) {
    return {
        title: "Repeat Steps 1–5 for the second link",
        lines: [
            ["Bob–Charlie: pairs b2–c2, a2 = ", { symbol: "+" }, ", d2 = ", { symbol: "0" },
                `, teleported CNOT (m = ${formatBits(link.m_bits)}, n = ${formatBits(link.n_bits)}).`],
            ["a2 and d2 now hold ", { symbol: "Φ", superscript: "+" },
                `: logical ZZ = ${formatSign(link.zz)}, logical XX = ${formatSign(link.xx)}.`],
        ],
        effects: buildTeleportEffects(CHARLIE_LINK, link),
    };
}


function describeCombine() {
    return {
        title: "Combine the two links",
        lines: [
            ["Two logical pairs: (a, d) over Alice–Bob and (a2, d2) over Bob–Charlie."],
            ["Bob holds d and a2. Joining those two links Alice to Charlie."],
        ],
        effects: [],
    };
}


function describeSwap(swap) {
    return {
        title: "Entanglement swap: logical BSM at Bob (d, a2)",
        lines: [
            [`Noise flips a2[${swap.flipped_qubit}] just before the swap (the red slot).`],
            ["Bob: CNOT d->a2 on each row, H on d, then he reads both blocks."],
            [`d read in X: ${formatBits(swap.x_bits)}, a2 read in Z: ${formatBits(swap.z_bits)}.`],
        ],
        effects: [makeFlash("a2", [swap.flipped_qubit], "X", ERROR_TONE)],
    };
}


function describeErrorCorrection(swap) {
    const [s1, s2] = swap.syndrome;
    const [m0, m1, m2] = swap.z_bits;
    let fixText = "nothing to fix";
    let effects = [];
    if (swap.fixed_qubit !== null) {
        const fixedBit = swap.fixed_z_bits[swap.fixed_qubit];
        fixText = `flip bit ${swap.fixed_qubit} -> ${formatBits(swap.fixed_z_bits)}`;
        effects = [makeFlash("a2", [swap.fixed_qubit], String(fixedBit), FIX_TONE)];
    }
    return {
        title: "Classical error correction, then the logical BSM bits",
        lines: [
            [`a2: s1 = ${m0} xor ${m1} = ${s1}, s2 = ${m1} xor ${m2} = ${s2}: ${fixText}, so m_z = parity = ${
                swap.m_z}.`],
            [`d: m_x = parity of ${formatBits(swap.x_bits)} = ${swap.m_x}, taken as read (X bits can't be fixed).`],
            [`Without the fix m_z would be ${swap.m_z_without_fix}, and Charlie would get the wrong frame.`],
        ],
        effects,
    };
}


function describeFrame(swap) {
    const xText = swap.m_z === 1 ? "logical X = XXX on d2" : "no logical X";
    const zText = swap.m_x === 1 ? "logical Z = Z on d2[0]" : "no logical Z";
    const xPositions = swap.m_z === 1 ? ALL_POSITIONS : [];
    const zPositions = swap.m_x === 1 ? [0] : [];
    return {
        title: "Pauli frame correction at Charlie",
        lines: [
            [`Bob sends m_x = ${swap.m_x}, m_z = ${swap.m_z}. Charlie applies Z^m_x X^m_z: ${xText}, ${zText}.`],
            ["Alice's a and Charlie's d2 now hold ", { symbol: "Φ", superscript: "+" }, ": one pair end to end."],
        ],
        effects: [
            { kind: PACKET_EFFECT, link: CHARLIE_LINK, text: `${swap.m_x}${swap.m_z}`, direction: "right" },
            makeFlash("d2", xPositions, "X", CORRECTION_TONE),
            makeFlash("d2", zPositions, "Z", CORRECTION_TONE),
        ],
    };
}


function describeFidelity(response) {
    const after = response.after_frame;
    return {
        title: "Bell pair fidelity",
        lines: [
            [`<XX> = ${formatSign(after.xx)}, <YY> = ${formatSign(after.yy)}, <ZZ> = ${formatSign(after.zz)}`
                + ` -> F = (1 + XX - YY + ZZ)/4 = ${after.fidelity.toFixed(3)}`],
            [`Before Charlie's frame: F = ${response.before_frame.fidelity.toFixed(3)}.`
                + ` Had Bob skipped his fix: F = ${response.without_fix.fidelity.toFixed(3)}.`],
        ],
        effects: [],
    };
}


function makeFlash(register, positions, letter, tone) {
    return { kind: FLASH_EFFECT, register, positions, letter, tone };
}


/**
 * What every qubit looks like once a step is done (0 = before Step 1), and what the links show.
 *
 * @param {object} response - RepetitionSwapResponse JSON.
 * @param {number} stepNumber - 0 to STEP_COUNT.
 * @returns {{qubits: Object<string, {look: string, text: string}[]>, pairedLinks: boolean[],
 *     logicalLinks: boolean[], hasEndToEndPair: boolean}}
 */
export function describeScene(response, stepNumber) {
    if (stepNumber < 0 || stepNumber > STEP_COUNT) {
        throw new Error(`step must be 0 to ${STEP_COUNT}, got ${stepNumber}`);
    }
    const qubits = {};
    describeAliceLink(qubits, response.links[ALICE_LINK], stepNumber);
    describeCharlieLink(qubits, response.links[CHARLIE_LINK], stepNumber);
    if (stepNumber >= 8) {
        describeSwapBlocks(qubits, response.swap, stepNumber);
    }
    return {
        qubits,
        pairedLinks: [stepNumber === 2 || stepNumber === 3, false],
        logicalLinks: [stepNumber >= 4 && stepNumber <= 7, stepNumber >= 6 && stepNumber <= 7],
        hasEndToEndPair: stepNumber >= 10,
    };
}


/**
 * Link 1 plays out over Steps 1-5: |0⟩, Bell pairs, encoding, the teleported CNOT's bits, then b and c used up.
 */
function describeAliceLink(qubits, link, stepNumber) {
    const [leftData, leftHalf, rightHalf, rightData] = LINK_REGISTERS[ALICE_LINK];
    if (stepNumber === 0) {
        fillRegisters(qubits, [leftData, leftHalf, rightHalf, rightData], WAITING);
        return;
    }
    fillRegisters(qubits, [leftData, rightData], IDLE);
    fillRegisters(qubits, [leftHalf, rightHalf], stepNumber >= 2 ? PAIR : IDLE);
    if (stepNumber >= 3) {
        fillRegisters(qubits, [leftData], PLUS);
        fillRegisters(qubits, [rightData], ZERO);
    }
    if (stepNumber >= 4) {
        fillRegisters(qubits, [leftData, rightData], BELL);
        showMeasuredOrUsed(qubits, leftHalf, link.m_bits, stepNumber === 4);
        showMeasuredOrUsed(qubits, rightHalf, link.n_bits, stepNumber === 4);
    }
}


/**
 * Link 2 waits until Step 6, which runs Steps 1-5 on it at once.
 */
function describeCharlieLink(qubits, link, stepNumber) {
    const [leftData, leftHalf, rightHalf, rightData] = LINK_REGISTERS[CHARLIE_LINK];
    if (stepNumber < 6) {
        fillRegisters(qubits, [leftData, leftHalf, rightHalf, rightData], WAITING);
        return;
    }
    fillRegisters(qubits, [leftData, rightData], BELL);
    showMeasuredOrUsed(qubits, leftHalf, link.m_bits, stepNumber === 6);
    showMeasuredOrUsed(qubits, rightHalf, link.n_bits, stepNumber === 6);
}


/**
 * From Step 8 Bob's d and a2 are measured; the flipped a2 bit stands out until Step 9 fixes it.
 */
function describeSwapBlocks(qubits, swap, stepNumber) {
    qubits.d = [];
    qubits.a2 = [];
    for (let i = 0; i < QUBITS_PER_BLOCK; i++) {
        qubits.d.push({ look: MEASURED, text: String(swap.x_bits[i]) });
        const isFlipped = i === swap.flipped_qubit;
        const isFixed = stepNumber >= 9 && i === swap.fixed_qubit;
        if (isFixed) {
            qubits.a2.push({ look: FIXED, text: String(swap.fixed_z_bits[i]) });
        } else {
            qubits.a2.push({ look: isFlipped ? FLIPPED : MEASURED, text: String(swap.z_bits[i]) });
        }
    }
}


/**
 * On the step that measured them, the communication qubits show their bits; after it they are used up.
 */
function showMeasuredOrUsed(qubits, register, bits, isShowingBits) {
    qubits[register] = [];
    for (const bit of bits) {
        if (isShowingBits) {
            qubits[register].push({ look: MEASURED, text: String(bit) });
        } else {
            qubits[register].push({ look: USED, text: "" });
        }
    }
}


/**
 * The key hints while the tutorial runs: Space names the next page, R starts a new run, Esc skips to the messages.
 *
 * @param {{isLoading: boolean, pages: object[], pageCount: number}} tutorial - pageCount is how many pages have been
 *     shown so far.
 * @returns {{key: string, action: string}[]}
 */
export function listTutorialKeyHints(tutorial) {
    if (tutorial.isLoading) {
        return [{ key: "…", action: "Loading" }];
    }
    const newRunHint = { key: "R", action: "New run" };
    if (tutorial.pageCount >= tutorial.pages.length) {
        return [{ key: "Space", action: "Send messages" }, newRunHint];
    }
    const nextPage = tutorial.pages[tutorial.pageCount];
    return [{ key: "Space", action: nextPage.action }, newRunHint, { key: "Esc", action: "Skip to messages" }];
}


/**
 * [0, 1, 1] → "0 1 1".
 */
export function formatBits(bits) {
    return bits.join(" ");
}


/**
 * +1 → "+1", -1 → "-1", 0 → "0". A plain hyphen: the pixel font draws the true minus sign low.
 */
export function formatSign(value) {
    return value > 0 ? `+${value}` : String(value);
}


/**
 * The positions (0-based) whose bit is 1: the qubits a correction acts on.
 */
export function listSetPositions(bits) {
    const positions = [];
    for (let i = 0; i < bits.length; i++) {
        if (bits[i] === 1) {
            positions.push(i);
        }
    }
    return positions;
}
