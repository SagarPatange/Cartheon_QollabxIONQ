"""Level 3 (steane_block.html): build a Steane |0̄⟩ block gate by gate, then find and fix one error in it. Noiseless.

Part A, build (docs/qre_cec_protocol.md, phase 2). The 7 data qubits start in |0⟩ and get H on q1, q2 and q4
(steane.ENCODER_HADAMARD_POSITIONS); the player then places CNOTs. After each one the page shows what each of the six
checks would read: +1 when the block is a +1 eigenstate of it, 0 when measuring it would give a random answer. H and
CNOT on |0⟩s never give -1. Once all six checks and logical Z̄ = Z⊗7 read +1, the block is |0̄⟩ (Steane 1996;
Nielsen & Chuang §10.4.2), and the paper's one-ancilla check, the parity Z1 Z6 Z7 (Goto 2016, as in
steane.measure_logical_z_check), reads 0, so the block is kept.

Part B, fix. An encoded |0̄⟩ gets one X, Z or Y error. Each check is measured with an ancilla, as a real device does:
a Z check collects its qubits' parity with CNOTs onto an ancilla in |0⟩; an X check uses an ancilla in |+⟩ as the
control and reads it in the X basis. Z checks see X flips and X checks see Z flips, and with the rows of
steane.PARITY_CHECK_ROWS each 3-bit syndrome, read as a binary number, is the flipped qubit's position (a Y flips both).
Every possible single-qubit fix is then tried on a fresh copy of the same block, so the page can answer whichever the
player picks; a fix works when both syndromes read 000 and the Z̄ check still reads 0.

Peeking is used only to show Part A's checks; every syndrome the player sees is measured.
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
# Noiseless verification always accepts the first block.
MAX_ENCODING_ATTEMPTS = 1

PAULIS = ("X", "Z", "Y")
# The three error rounds: a bit flip, a phase flip, then both at once.
ERROR_ROUND_PAULIS = ("X", "Z", "Y")
# Each error round's backend seed is drawn from the request's rng; 32 bits matches the API's seed range.
ROUND_SEED_BITS = 32
POSITIONS = tuple(range(1, steane.QUBITS_PER_BLOCK + 1))


@dataclass(frozen=True)
class BuildReport:
    """What the block's checks read after the H gates and the player's CNOTs.

    x_checks, z_checks: one expectation per row of steane.PARITY_CHECK_ROWS: +1 (holds) or 0 (random).
    logical_z: the expectation of Z̄ = Z on all 7 qubits.
    is_encoded: every check and Z̄ read +1, so the block is |0̄⟩.
    verification_bit: the paper's ancilla check of Z1 Z6 Z7 once encoded (0 = keep the block), otherwise None.
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
    """One error round: the error, the measured syndromes, and the result of every fix (keys like "X6")."""

    pauli: str
    position: int
    z_syndrome: list[int]
    x_syndrome: list[int]
    fixes: dict[str, FixResult]


def run_build(backend: QuantumBackend, cnot_positions: list[tuple[int, int]]) -> BuildReport:
    """Reset the block, apply H on q1, q2 and q4, then the player's CNOTs (1-based (control, target) positions), and
    report what every check would read."""
    for control_position, target_position in cnot_positions:
        check_cnot(control_position, target_position)
    backend.reset(BLOCK + [ANCILLA])
    backend.h(qubits_at_positions(steane.ENCODER_HADAMARD_POSITIONS))
    for control_position, target_position in cnot_positions:
        backend.cnot([(BLOCK[control_position - 1], BLOCK[target_position - 1])])
    x_checks = peek_checks(backend, "X")
    z_checks = peek_checks(backend, "Z")
    logical_z = backend.peek_pauli_expectation(dict.fromkeys(BLOCK, "Z"))
    expectations = x_checks + z_checks + [logical_z]
    is_encoded = all(expectation == 1 for expectation in expectations)
    verification_bit = None
    if is_encoded:
        verification_bit = steane.measure_logical_z_check(backend, BLOCK, ANCILLA, NOISELESS)
    return BuildReport(x_checks, z_checks, logical_z, is_encoded, verification_bit)


def peek_checks(backend: QuantumBackend, pauli_letter: str) -> list[int]:
    """What each check of one type (all X or all Z on a row's qubits) would read, without measuring it."""
    expectations = []
    for check_positions in list_check_positions():
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
    """Encode a verified |0̄⟩ with steane.py's encoder, then put one Pauli error on one qubit."""
    steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ENCODING_ATTEMPTS)
    apply_pauli(backend, pauli, position)


def try_fix(backend: QuantumBackend, pauli: str, position: int) -> FixResult:
    """Apply one fix, then measure both syndromes and the Z̄ check."""
    apply_pauli(backend, pauli, position)
    z_syndrome = measure_syndrome(backend, "Z")
    x_syndrome = measure_syndrome(backend, "X")
    logical_bit = steane.measure_logical_z_check(backend, BLOCK, ANCILLA, NOISELESS)
    is_clean = z_syndrome == [0, 0, 0] and x_syndrome == [0, 0, 0]
    return FixResult(z_syndrome, x_syndrome, logical_bit, is_fixed=is_clean and logical_bit == 0)


def apply_pauli(backend: QuantumBackend, pauli: str, position: int) -> None:
    """X, Z or Y on one data qubit. Y = iXZ; the global phase i changes nothing, so X then Z stands in for it."""
    qubit = BLOCK[position - 1]
    if pauli in ("X", "Y"):
        backend.x([qubit])
    if pauli in ("Z", "Y"):
        backend.z([qubit])


def measure_syndrome(backend: QuantumBackend, pauli_letter: str) -> list[int]:
    """Measure the three checks of one type with the ancilla, in row order (4567, 2367, 1357)."""
    syndrome = []
    for check_positions in list_check_positions():
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


def read_syndrome_position(syndrome: list[int]) -> int:
    """A syndrome read as a binary number, most significant bit first: the flipped qubit's position, 0 for none."""
    position = 0
    for bit in syndrome:
        position = position * 2 + bit
    return position


def list_check_positions() -> list[list[int]]:
    """The 1-based positions in each row of the parity-check matrix: [4, 5, 6, 7], [2, 3, 6, 7], [1, 3, 5, 7]."""
    check_positions = []
    for parity_check_row in steane.PARITY_CHECK_ROWS:
        positions = []
        for i, entry in enumerate(parity_check_row):
            if entry == 1:
                positions.append(i + 1)
        check_positions.append(positions)
    return check_positions


def qubits_at_positions(positions: list[int]) -> list[int]:
    """The block's qubits at 1-based positions."""
    return [BLOCK[position - 1] for position in positions]


def check_cnot(control_position: int, target_position: int) -> None:
    """Fail fast on a CNOT outside the block or from a qubit onto itself."""
    check_position(control_position)
    check_position(target_position)
    if control_position == target_position:
        raise ValueError(f"a CNOT needs two different qubits, got q{control_position} twice")


def check_position(position: int) -> None:
    """Fail fast on a qubit position outside 1-7."""
    if position not in POSITIONS:
        raise ValueError(f"qubit positions run from 1 to {len(POSITIONS)}, got {position}")


def check_pauli(pauli: str) -> None:
    """Fail fast on a Pauli other than X, Z or Y."""
    if pauli not in PAULIS:
        raise ValueError(f"pauli must be one of {PAULIS}, got {pauli!r}")
