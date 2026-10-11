"""Level 3 (steane_block.html): build a Steane block gate by gate with the Error Correction Zoo's encoder, then find
and fix one error in it. Noiseless.

The encoder (errorcorrectionzoo.org/c/steane): qubits q0-q6, q0 holds |psi> and q1-q6 start in |0>; H on q4, q5 and
q6; CNOT q0 -> q1, q2 (copy psi); then each H qubit spreads along its circle: q6 -> q0, q1, q3; q5 -> q0, q2, q3;
q4 -> q1, q2, q3. That is 11 CNOTs and gives the Steane code (Steane 1996) with the checks X and Z on {0,1,3,6},
{0,2,3,5} and {1,2,3,4}, logical X = X0 X1 X2 and logical Z = Z0 Z1 Z2. The level uses |psi> = |0>, so the block is
logical |0>. This is the same [7,4,3] Hamming code as steane.py's, with its qubits numbered differently; Levels 4-6
keep steane.py's numbering.

Part A, build. After each CNOT the page shows what each of the six checks would read: +1 when the block is a +1
eigenstate of it, 0 when measuring it would give a random answer (H and CNOT on |0>s never give -1). Once all six
checks and logical Z read +1 the block is |0>-bar, and one ancilla measuring Z0 Z1 Z2 reads 0, so it is kept.

Part B, fix. An encoded |0>-bar gets one X, Z or Y error. Each check is measured with an ancilla, as a real device
does: a Z check collects its qubits' parity with CNOTs onto an ancilla in |0>; an X check uses an ancilla in |+> as
the control and reads it in the X basis. Z checks see X flips and X checks see Z flips (a Y flips both), and the
flipped qubit is the one inside exactly the circles that fired. Every possible single-qubit fix is then tried on a
fresh copy of the same block, so the page can answer whichever the player picks; a fix works when both syndromes read
000 and the logical Z check still reads 0.

Peeking is used only to show Part A's checks; every syndrome the player sees is measured. Level 4 (teleported CNOT)
reuses measure_parity, list_check_positions and read_syndrome_position, which are in steane.py's numbering.
"""

import random
from collections.abc import Callable
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol import steane
from quantum_bros.protocol.noise import NoiseModel

BLOCK = list(range(steane.QUBITS_PER_BLOCK))
ANCILLA = steane.QUBITS_PER_BLOCK
NOISELESS = NoiseModel()

PAULIS = ("X", "Z", "Y")
# The three error rounds: a bit flip, a phase flip, then both at once.
ERROR_ROUND_PAULIS = ("X", "Z", "Y")
# Each error round's backend seed is drawn from the request's rng; 32 bits matches the API's seed range.
ROUND_SEED_BITS = 32
# The Error Correction Zoo encoder's layout (qubits numbered 0-6 as in its figure).
POSITIONS = tuple(range(steane.QUBITS_PER_BLOCK))
DATA_POSITION = 0
HADAMARD_POSITIONS = (4, 5, 6)
# In order: CNOT q0 -> q1, q2 copies psi; then each H qubit fans out to the rest of its circle.
ENCODER_CNOTS = ((0, 1), (0, 2), (6, 0), (6, 1), (6, 3), (5, 0), (5, 2), (5, 3), (4, 1), (4, 2), (4, 3))
# The three circles (checks), in the order the build spreads them: q6's, q5's, q4's.
CHECK_POSITIONS = ([0, 1, 3, 6], [0, 2, 3, 5], [1, 2, 3, 4])
LOGICAL_Z_POSITIONS = (0, 1, 2)


@dataclass(frozen=True)
class BuildReport:
    """What the block's checks read after the H gates and the player's CNOTs.

    x_checks, z_checks: one expectation per circle of CHECK_POSITIONS: +1 (holds) or 0 (random).
    logical_z: the expectation of logical Z = Z0 Z1 Z2.
    is_encoded: every check and logical Z read +1, so the block is |0̄⟩.
    verification_bit: the ancilla check of Z0 Z1 Z2 once encoded (0 = keep the block), otherwise None.
    """

    x_checks: list[int]
    z_checks: list[int]
    logical_z: int
    is_encoded: bool
    verification_bit: int | None


@dataclass(frozen=True)
class FixResult:
    """What the checks read after one fix: both syndromes, the Z̄ check's bit, and whether the block is |0̄⟩ again."""

    z_syndrome: list[int]
    x_syndrome: list[int]
    logical_bit: int
    is_fixed: bool


@dataclass(frozen=True)
class ErrorRound:
    """One error round: the error, the measured syndromes, and the result of every fix (keys like "X6", qubit 0-6)."""

    pauli: str
    position: int
    z_syndrome: list[int]
    x_syndrome: list[int]
    fixes: dict[str, FixResult]


def run_build(backend: QuantumBackend, cnot_positions: list[tuple[int, int]]) -> BuildReport:
    """Reset the block (psi = |0>), apply H on q4, q5 and q6, then the player's CNOTs ((control, target) qubits 0-6),
    and report what every check would read."""
    for control_position, target_position in cnot_positions:
        check_cnot(control_position, target_position)
    backend.reset(BLOCK + [ANCILLA])
    backend.h(qubits_at_positions(HADAMARD_POSITIONS))
    for control_position, target_position in cnot_positions:
        backend.cnot([(BLOCK[control_position], BLOCK[target_position])])
    x_checks = peek_checks(backend, "X")
    z_checks = peek_checks(backend, "Z")
    logical_z = backend.peek_pauli_expectation(dict.fromkeys(qubits_at_positions(LOGICAL_Z_POSITIONS), "Z"))
    expectations = x_checks + z_checks + [logical_z]
    is_encoded = all(expectation == 1 for expectation in expectations)
    verification_bit = None
    if is_encoded:
        verification_bit = measure_logical_z(backend)
    return BuildReport(x_checks, z_checks, logical_z, is_encoded, verification_bit)


def run_encoder(backend: QuantumBackend) -> None:
    """The Zoo encoder on the block as it stands (q0 holds psi, the rest |0>): H on q4, q5, q6, then its 11 CNOTs."""
    backend.h(qubits_at_positions(HADAMARD_POSITIONS))
    for control_position, target_position in ENCODER_CNOTS:
        backend.cnot([(BLOCK[control_position], BLOCK[target_position])])


def measure_logical_z(backend: QuantumBackend) -> int:
    """Measure logical Z = Z0 Z1 Z2 with the ancilla: 0 for |0>-bar."""
    return measure_parity(backend, qubits_at_positions(LOGICAL_Z_POSITIONS), "Z", ANCILLA)


def peek_checks(backend: QuantumBackend, pauli_letter: str) -> list[int]:
    """What each circle's check of one type (all X or all Z on its qubits) would read, without measuring it."""
    expectations = []
    for check_positions in CHECK_POSITIONS:
        check_paulis = dict.fromkeys(qubits_at_positions(check_positions), pauli_letter)
        expectations.append(backend.peek_pauli_expectation(check_paulis))
    return expectations


def run_error_rounds(make_backend: Callable[[int], QuantumBackend], rng: random.Random) -> list[ErrorRound]:
    """The three error rounds (X, Z, then Y), on three different qubits drawn from rng, so each round needs its own
    answer. make_backend builds a fresh backend from a seed (for example StimBackend); the same rng seed gives the same
    rounds."""
    positions = rng.sample(POSITIONS, len(ERROR_ROUND_PAULIS))
    rounds = []
    for pauli, position in zip(ERROR_ROUND_PAULIS, positions, strict=True):
        round_seed = rng.getrandbits(ROUND_SEED_BITS)
        rounds.append(run_error_round(make_backend, pauli, position, round_seed))
    return rounds


def run_error_round(
    make_backend: Callable[[int], QuantumBackend], pauli: str, position: int, round_seed: int
) -> ErrorRound:
    """Measure the syndromes of one error, then try every fix on a fresh copy of the same errored block."""
    check_pauli(pauli)
    check_position(position)
    backend = make_backend(round_seed)
    prepare_errored_block(backend, pauli, position)
    z_syndrome = measure_syndrome(backend, "Z")
    x_syndrome = measure_syndrome(backend, "X")
    fixes = {}
    for fix_pauli in PAULIS:
        for fix_position in POSITIONS:
            fix_backend = make_backend(round_seed)
            prepare_errored_block(fix_backend, pauli, position)
            fixes[f"{fix_pauli}{fix_position}"] = try_fix(fix_backend, fix_pauli, fix_position)
    return ErrorRound(pauli, position, z_syndrome, x_syndrome, fixes)


def prepare_errored_block(backend: QuantumBackend, pauli: str, position: int) -> None:
    """Encode |0>-bar with the Zoo encoder, then put one Pauli error on one qubit."""
    backend.reset(BLOCK + [ANCILLA])
    run_encoder(backend)
    apply_pauli(backend, pauli, position)


def try_fix(backend: QuantumBackend, pauli: str, position: int) -> FixResult:
    """Apply one fix, then measure both syndromes and the logical Z check."""
    apply_pauli(backend, pauli, position)
    z_syndrome = measure_syndrome(backend, "Z")
    x_syndrome = measure_syndrome(backend, "X")
    logical_bit = measure_logical_z(backend)
    is_clean = z_syndrome == [0, 0, 0] and x_syndrome == [0, 0, 0]
    return FixResult(z_syndrome, x_syndrome, logical_bit, is_fixed=is_clean and logical_bit == 0)


def apply_pauli(backend: QuantumBackend, pauli: str, position: int) -> None:
    """X, Z or Y on one data qubit. Y = iXZ; the global phase i changes nothing, so X then Z stands in for it."""
    qubit = BLOCK[position]
    if pauli in ("X", "Y"):
        backend.x([qubit])
    if pauli in ("Z", "Y"):
        backend.z([qubit])


def measure_syndrome(backend: QuantumBackend, pauli_letter: str) -> list[int]:
    """Measure the three circles' checks of one type with the ancilla, in circle order (0136, 0235, 1234)."""
    syndrome = []
    for check_positions in CHECK_POSITIONS:
        syndrome.append(measure_parity(backend, qubits_at_positions(check_positions), pauli_letter, ANCILLA))
    return syndrome


def measure_parity(backend: QuantumBackend, qubits: list[int], pauli_letter: str, ancilla: int) -> int:
    """Measure Z⊗…⊗Z or X⊗…⊗X on some qubits with an ancilla, without measuring the qubits themselves; 0 means +1.
    Z: CNOT each qubit onto the ancilla in |0⟩, which collects their parity. X: the ancilla in |+⟩ controls a CNOT onto
    each qubit (phase kickback), then is read in the X basis (Nielsen & Chuang §10.5.8)."""
    backend.reset([ancilla])
    if pauli_letter == "Z":
        backend.cnot([(qubit, ancilla) for qubit in qubits])
        return backend.measure([ancilla])[0]
    backend.h([ancilla])
    backend.cnot([(ancilla, qubit) for qubit in qubits])
    backend.h([ancilla])
    return backend.measure([ancilla])[0]


def find_flipped_position(syndrome: list[int]) -> int | None:
    """The qubit inside exactly the circles whose checks fired (Level 3's layout), or None when none fired."""
    for position in POSITIONS:
        if [int(position in check) for check in CHECK_POSITIONS] == list(syndrome):
            return position
    return None


def read_syndrome_position(syndrome: list[int]) -> int:
    """steane.py's numbering (Level 4): a syndrome read as a binary number, most significant bit first, is the flipped
    qubit's 1-based position, 0 for none."""
    position = 0
    for bit in syndrome:
        position = position * 2 + bit
    return position


def list_check_positions() -> list[list[int]]:
    """steane.py's numbering (Level 4): the 1-based positions in each row of the parity-check matrix: [4, 5, 6, 7],
    [2, 3, 6, 7], [1, 3, 5, 7]."""
    check_positions = []
    for parity_check_row in steane.PARITY_CHECK_ROWS:
        positions = []
        for i, entry in enumerate(parity_check_row):
            if entry == 1:
                positions.append(i + 1)
        check_positions.append(positions)
    return check_positions


def qubits_at_positions(positions) -> list[int]:
    """The block's qubits at positions 0-6 (Level 3's numbering)."""
    return [BLOCK[position] for position in positions]


def check_cnot(control_position: int, target_position: int) -> None:
    """Fail fast on a CNOT outside the block or from a qubit onto itself."""
    check_position(control_position)
    check_position(target_position)
    if control_position == target_position:
        raise ValueError(f"a CNOT needs two different qubits, got q{control_position} twice")


def check_position(position: int) -> None:
    """Fail fast on a qubit position outside 0-6."""
    if position not in POSITIONS:
        raise ValueError(f"qubit positions run from 0 to {len(POSITIONS) - 1}, got {position}")


def check_pauli(pauli: str) -> None:
    """Fail fast on a Pauli other than X, Z or Y."""
    if pauli not in PAULIS:
        raise ValueError(f"pauli must be one of {PAULIS}, got {pauli!r}")
