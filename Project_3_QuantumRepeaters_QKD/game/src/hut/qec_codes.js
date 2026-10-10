/**
 * The error-correcting codes and circuits Toad's QEC hut shows: the 3-qubit bit-flip code and its syndrome table,
 * what [[n, k, d]] means, the Steane [[7,1,3]] code and its encoder, and how one X fault on a syndrome ancilla spreads
 * through CNOTs (a hook error) unless a flag qubit catches it. Pure; qec_hut_pictures.js draws these.
 *
 * Sources: A. M. Steane, Proc. R. Soc. A 452, 2551 (1996); M. A. Nielsen & I. L. Chuang, Quantum Computation and
 * Quantum Information, ch. 10 (§10.1 bit-flip code, §10.4.2 Steane code, §10.6 fault tolerance); R. Chao &
 * B. W. Reichardt, Phys. Rev. Lett. 121, 050502 (2018) for flag qubits.
 *
 * Circuits are {wires, columns}: wires is a list of {id, label, start}, columns a list of gate lists, left to right.
 * A gate is {gate: "h", wire}, {gate: "cnot", control, target} or {gate: "measure", wire, basis?} (basis "X" or "Z";
 * none means Z).
 */

// N&C §10.1.1: checks Z1Z2 and Z2Z3 of the 3-qubit bit-flip code, as 1-based qubit positions.
export const BIT_FLIP_CHECKS = [[1, 2], [2, 3]];

// Copied from backend/src/quantum_bros/protocol/steane.py (PARITY_CHECK_ROWS, the Hamming [7,4,3] code's parity
// checks; Steane 1996). Each row is one X check and one Z check on the qubits where it has a 1. Read top to bottom,
// a column is its qubit's position in binary, so a single flip's syndrome spells out where it is.
export const STEANE_PARITY_CHECK_ROWS = [
    [0, 0, 0, 1, 1, 1, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 0, 1, 0, 1],
];

// Copied from steane.py (ENCODER_HADAMARD_POSITIONS, ENCODER_CNOT_POSITIONS), the circuit the game simulates:
// all 7 qubits start in |0⟩, H on 1, 2 and 4, then these 9 CNOTs (control, target), 1-based, in this order.
export const STEANE_HADAMARD_POSITIONS = [1, 2, 4];
export const STEANE_ENCODER_CNOTS = [[4, 5], [4, 6], [4, 7], [2, 3], [2, 6], [2, 7], [1, 3], [1, 5], [1, 7]];

export const STEANE_QUBIT_COUNT = 7;

// The weight-4 stabilizer the fault-tolerance pictures measure: Steane's first check, X on qubits 4, 5, 6 and 7.
export const HOOK_CHECK_POSITIONS = [4, 5, 6, 7];
export const ANCILLA_WIRE = "a";
export const FLAG_WIRE = "f";
// Where the pictures put the one fault: on the ancilla, right after its 2nd data CNOT (column index 1).
export const HOOK_FAULT_AFTER_COLUMN = 1;

// The rotated surface code is [[d², 1, d]] (Horsman et al., New J. Phys. 14, 123011 (2012)); the hut's example.
export const SURFACE_CODE_EXAMPLE_DISTANCE = 5;

// The three circles of the Steane diagram (one per check row) and the spot of each qubit, in the picture's units.
// Each qubit sits inside exactly the circles of the checks that touch it (tests/hut/qec_codes.test.js checks this).
export const STEANE_DIAGRAM = {
    circleRadius: 70,
    circles: [
        { centerX: 150, centerY: 95 },
        { centerX: 110, centerY: 165 },
        { centerX: 190, centerY: 165 },
    ],
    qubitSpots: {
        1: { x: 225, y: 190 },
        2: { x: 75, y: 190 },
        3: { x: 150, y: 197 },
        4: { x: 150, y: 52 },
        5: { x: 186, y: 115 },
        6: { x: 114, y: 115 },
        7: { x: 150, y: 142 },
    },
};


/**
 * The two parity checks of the 3-qubit bit-flip code after at most one bit flip: a check reads 1 when exactly one
 * of its two qubits is flipped (N&C §10.1.1).
 *
 * @param {number | null} flippedPosition - the flipped qubit, 1 to 3, or null for none.
 * @returns {number[]} [Z1Z2, Z2Z3], each 0 or 1.
 */
export function measureBitFlipChecks(flippedPosition) {
    const checkResults = [];
    for (const checkPositions of BIT_FLIP_CHECKS) {
        const isTouched = checkPositions.includes(flippedPosition);
        checkResults.push(isTouched ? 1 : 0);
    }
    return checkResults;
}


/**
 * The bit-flip code's syndrome table: no flip and each single flip, with the check results it gives.
 *
 * @returns {{flippedPosition: number | null, checkResults: number[]}[]}
 */
export function listBitFlipSyndromeTable() {
    const syndromeRows = [];
    for (const flippedPosition of [null, 1, 2, 3]) {
        syndromeRows.push({ flippedPosition, checkResults: measureBitFlipChecks(flippedPosition) });
    }
    return syndromeRows;
}


/**
 * How many errors on arbitrary qubits a code of distance d always corrects: ⌊(d−1)/2⌋ (N&C §10.3).
 *
 * @param {number} distance - the code distance d, at least 1.
 * @returns {number}
 */
export function findCorrectableErrorCount(distance) {
    if (!Number.isInteger(distance) || distance < 1) {
        throw new Error(`a code distance is a whole number of at least 1, got ${distance}`);
    }
    return Math.floor((distance - 1) / 2);
}


/**
 * The example codes in the [[n, k, d]] table. The 3-qubit code has two distances: 3 against X flips, but a single Z
 * is already a logical error, so as a quantum code it is [[3,1,1]] (N&C §10.1).
 *
 * @returns {{name: string, qubitCount: number, logicalCount: number, xDistance: number, zDistance: number}[]}
 */
export function listExampleCodes() {
    const surfaceDistance = SURFACE_CODE_EXAMPLE_DISTANCE;
    return [
        { name: "3-qubit bit flip", qubitCount: 3, logicalCount: 1, xDistance: 3, zDistance: 1 },
        { name: "Steane", qubitCount: STEANE_QUBIT_COUNT, logicalCount: 1, xDistance: 3, zDistance: 3 },
        {
            name: `Rotated surface, d=${surfaceDistance}`,
            qubitCount: surfaceDistance * surfaceDistance,
            logicalCount: 1,
            xDistance: surfaceDistance,
            zDistance: surfaceDistance,
        },
    ];
}


/**
 * The qubit positions (1-based) of each Steane check: where its row of the parity-check matrix has a 1.
 *
 * @returns {number[][]} three lists of four positions.
 */
export function listSteaneCheckPositions() {
    const checkPositions = [];
    for (const parityCheckRow of STEANE_PARITY_CHECK_ROWS) {
        const positions = [];
        for (let i = 0; i < parityCheckRow.length; i++) {
            if (parityCheckRow[i] === 1) {
                positions.push(i + 1);
            }
        }
        checkPositions.push(positions);
    }
    return checkPositions;
}


/**
 * The qubit the Steane decoder flips for a set of X errors, as steane.py does: the Z checks' syndrome read as a
 * binary number, most significant bit first (0 means no flip).
 *
 * @param {number[]} xErrorPositions - qubits with an X error, 1-based.
 * @returns {number} the position the decoder flips, or 0.
 */
export function findSteaneDecoderFlip(xErrorPositions) {
    let flipPosition = 0;
    for (const parityCheckRow of STEANE_PARITY_CHECK_ROWS) {
        let hitCount = 0;
        for (const position of xErrorPositions) {
            hitCount += parityCheckRow[position - 1];
        }
        flipPosition = flipPosition * 2 + (hitCount % 2);
    }
    return flipPosition;
}


/**
 * The X errors left after the Steane decoder's flip, and whether they add up to a logical X̄. What is left always
 * passes every check, so it is either a stabilizer (even weight) or X̄ times one (odd weight): X̄ = X on all 7
 * qubits, and every Steane stabilizer has even weight (N&C §10.4.2).
 *
 * @param {number[]} xErrorPositions - qubits with an X error, 1-based.
 * @returns {{remainingPositions: number[], isLogicalError: boolean}}
 */
export function decodeSteaneXErrors(xErrorPositions) {
    const remaining = new Set(xErrorPositions);
    const flipPosition = findSteaneDecoderFlip(xErrorPositions);
    if (flipPosition !== 0) {
        toggleMember(remaining, flipPosition);
    }
    const remainingPositions = [...remaining].sort((first, second) => first - second);
    return { remainingPositions, isLogicalError: remainingPositions.length % 2 === 1 };
}


/**
 * Where an X error ends up after the rest of a circuit: a CNOT copies an X on its control onto its target, and
 * leaves an X on its target where it is (N&C §10.6.1, Fig. 10.18). Only follows X through CNOTs.
 *
 * @param {{columns: object[][]}} circuit - see the module comment.
 * @param {string} faultWire - the wire the X fault hits.
 * @param {number} afterColumn - the fault happens after this column (-1: before the first).
 * @returns {Set<string>} the wires carrying an X at the end.
 */
export function spreadXFault(circuit, faultWire, afterColumn) {
    const xWires = new Set([faultWire]);
    for (const column of circuit.columns.slice(afterColumn + 1)) {
        for (const gate of column) {
            const isSpreadingCnot = gate.gate === "cnot" && xWires.has(gate.control);
            if (isSpreadingCnot) {
                toggleMember(xWires, gate.target);
            }
            const isUnfollowedGate = gate.gate === "h" && xWires.has(gate.wire);
            if (isUnfollowedGate) {
                throw new Error(`an H on ${gate.wire} turns its X into a Z, which spreadXFault does not follow`);
            }
        }
    }
    return xWires;
}


/**
 * The positions of the data qubits among a set of wires ("q6" → 6), smallest first.
 *
 * @param {Set<string>} wireIds
 * @returns {number[]}
 */
export function listDataPositions(wireIds) {
    const positions = [];
    for (const wireId of wireIds) {
        if (wireId.startsWith("q")) {
            positions.push(Number(wireId.slice(1)));
        }
    }
    return positions.sort((first, second) => first - second);
}


/**
 * The wire id of a data qubit: position 4 is "q4".
 *
 * @param {number} position - 1-based.
 * @returns {string}
 */
export function findDataWireId(position) {
    return `q${position}`;
}


/**
 * The 3-qubit code's circuit: two CNOTs from q1 spread |ψ⟩ = a|0⟩ + b|1⟩ into a|000⟩ + b|111⟩, then one ancilla
 * per check collects Z1Z2 or Z2Z3 and is measured (N&C §10.1.1, Fig. 10.2).
 *
 * @returns {{wires: object[], columns: object[][]}}
 */
export function buildBitFlipCircuit() {
    const wires = [
        { id: "q1", label: "q1", start: "|ψ⟩" },
        { id: "q2", label: "q2", start: "|0⟩" },
        { id: "q3", label: "q3", start: "|0⟩" },
    ];
    const columns = [
        [{ gate: "cnot", control: "q1", target: "q2" }],
        [{ gate: "cnot", control: "q1", target: "q3" }],
    ];
    for (let i = 0; i < BIT_FLIP_CHECKS.length; i++) {
        const ancillaId = `a${i + 1}`;
        const checkName = BIT_FLIP_CHECKS[i].map((position) => `Z${position}`).join("");
        wires.push({ id: ancillaId, label: ancillaId, start: "|0⟩", endLabel: checkName });
        for (const position of BIT_FLIP_CHECKS[i]) {
            columns.push([{ gate: "cnot", control: findDataWireId(position), target: ancillaId }]);
        }
    }
    columns.push(wires.slice(BIT_FLIP_CHECKS[0].length + 1).map((wire) => ({ gate: "measure", wire: wire.id })));
    return { wires, columns };
}


/**
 * The Steane |0̄⟩ encoder exactly as steane.py runs it: q1..q7 in |0⟩, H on q1, q2 and q4, then the 9 CNOTs in order.
 *
 * @returns {{wires: object[], columns: object[][]}}
 */
export function buildSteaneEncoderCircuit() {
    const wires = [];
    for (let position = 1; position <= STEANE_QUBIT_COUNT; position++) {
        wires.push({ id: findDataWireId(position), label: findDataWireId(position), start: "|0⟩" });
    }
    const hadamardColumn = [];
    for (const position of STEANE_HADAMARD_POSITIONS) {
        hadamardColumn.push({ gate: "h", wire: findDataWireId(position) });
    }
    const columns = [hadamardColumn];
    for (const [controlPosition, targetPosition] of STEANE_ENCODER_CNOTS) {
        const control = findDataWireId(controlPosition);
        columns.push([{ gate: "cnot", control, target: findDataWireId(targetPosition) }]);
    }
    return { wires, columns };
}


/**
 * Measuring the weight-4 check X4X5X6X7 with one ancilla in |+⟩: a CNOT from the ancilla to each data qubit, then
 * the ancilla is measured in the X basis (N&C §10.5.8). With a flag, two CNOTs from the ancilla to a flag qubit in
 * |0⟩ sit around the middle two data CNOTs, and the flag is measured in the Z basis (Chao & Reichardt 2018). The two
 * flag CNOTs cancel when nothing goes wrong, so the flag reads 0.
 *
 * @param {boolean} hasFlag - add the flag qubit.
 * @returns {{wires: object[], columns: object[][]}}
 */
export function buildCheckCircuit(hasFlag) {
    const wires = [];
    const dataCnots = [];
    for (const position of HOOK_CHECK_POSITIONS) {
        wires.push({ id: findDataWireId(position), label: findDataWireId(position), start: "" });
        dataCnots.push([{ gate: "cnot", control: ANCILLA_WIRE, target: findDataWireId(position) }]);
    }
    wires.push({ id: ANCILLA_WIRE, label: "anc", start: "|+⟩" });
    const measureColumn = [{ gate: "measure", wire: ANCILLA_WIRE, basis: "X" }];
    if (!hasFlag) {
        return { wires, columns: [...dataCnots, measureColumn] };
    }
    wires.push({ id: FLAG_WIRE, label: "flag", start: "|0⟩" });
    const flagCnot = [{ gate: "cnot", control: ANCILLA_WIRE, target: FLAG_WIRE }];
    measureColumn.push({ gate: "measure", wire: FLAG_WIRE, basis: "Z" });
    const columns = [dataCnots[0], flagCnot, dataCnots[1], dataCnots[2], flagCnot, dataCnots[3], measureColumn];
    return { wires, columns };
}


/**
 * The column a fault "after the ancilla's 2nd data CNOT" comes after, in either check circuit.
 *
 * @param {{columns: object[][]}} circuit - from buildCheckCircuit.
 * @returns {number} a column index.
 */
export function findHookFaultColumn(circuit) {
    let dataCnotCount = 0;
    for (let i = 0; i < circuit.columns.length; i++) {
        for (const gate of circuit.columns[i]) {
            const isDataCnot = gate.gate === "cnot" && gate.target.startsWith("q");
            if (isDataCnot) {
                dataCnotCount += 1;
            }
        }
        if (dataCnotCount === HOOK_FAULT_AFTER_COLUMN + 1) {
            return i;
        }
    }
    throw new Error("the check circuit has fewer than 2 data CNOTs");
}


/**
 * Add a member to a set if it is missing, remove it if it is there: two X errors on one qubit cancel.
 */
function toggleMember(memberSet, member) {
    if (memberSet.has(member)) {
        memberSet.delete(member);
        return;
    }
    memberSet.add(member);
}
