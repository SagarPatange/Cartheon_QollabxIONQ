"""Steane [[7,1,3]] code: encode a verified logical |0̄⟩, apply logical Paulis, and measure a block with decoding.

Paper §III-A-4, eqs. 1-3. The parity-check matrix H has rows 0001111, 0110011 and 1010101, so the syndrome of a
measured 7-bit string, read as a binary number, is the 1-based position of the single flipped bit.

Simplification: this uses the textbook 9-CNOT encoder, not the paper's 8-CNOT Paetznick–Reichardt encoder (Fig. 3).
"""

from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol.noise import NoiseModel

QUBITS_PER_BLOCK = 7

# Paper eq. 2. Row order makes the syndrome read as the binary error position, most significant bit first.
PARITY_CHECK_ROWS = [
    [0, 0, 0, 1, 1, 1, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 0, 1, 0, 1],
]

# Textbook encoder, 1-based positions: |+⟩ on 1, 2 and 4, then each spreads its row of H to the other qubits.
ENCODER_HADAMARD_POSITIONS = [1, 2, 4]
ENCODER_CNOT_POSITIONS = [(4, 5), (4, 6), (4, 7), (2, 3), (2, 6), (2, 7), (1, 3), (1, 5), (1, 7)]

# Logical Z̄ written with weight 3 (ZIIIIZZ). Measuring it on a fresh |0̄⟩ must give 0, so a 1 means a bad block.
LOGICAL_Z_CHECK_POSITIONS = [1, 6, 7]

Z_BASIS = "Z"
X_BASIS = "X"
BASES = [Z_BASIS, X_BASIS]


class EncodingFailedError(RuntimeError):
    """Verification rejected the block max_attempts times in a row."""


@dataclass(frozen=True)
class LogicalMeasurement:
    """The decoded logical bit of one block and whether the decoder had to flip a bit to get it."""

    logical_bit: int
    was_corrected: bool


def encode_logical_zero(
    backend: QuantumBackend, block: list[int], ancilla: int, noise: NoiseModel, max_attempts: int
) -> int:
    """Prepare |0̄⟩ on the 7 qubits of block, retrying until the Z̄ check accepts it.

    ancilla is a spare qubit used for the check. Returns the number of attempts it took.
    Raises EncodingFailedError if no attempt is accepted within max_attempts.
    """
    check_block_size(block)
    if max_attempts < 1:
        raise ValueError(f"max_attempts must be at least 1, got {max_attempts}")
    for attempt_number in range(1, max_attempts + 1):
        run_encoder(backend, block, noise)
        is_accepted = measure_logical_z_check(backend, block, ancilla, noise) == 0
        if is_accepted:
            return attempt_number
    raise EncodingFailedError(f"no verified |0̄⟩ after {max_attempts} attempts")


def encode_logical_plus(
    backend: QuantumBackend, block: list[int], ancilla: int, noise: NoiseModel, max_attempts: int
) -> int:
    """Prepare |+̄⟩ = H̄|0̄⟩; the Steane code's logical H is transversal. Returns the attempts encoding took."""
    attempt_count = encode_logical_zero(backend, block, ancilla, noise, max_attempts)
    apply_transversal_h(backend, block, noise)
    return attempt_count


def run_encoder(backend: QuantumBackend, block: list[int], noise: NoiseModel) -> None:
    """Reset the block and run the 9-CNOT encoding circuit, with gate noise after every gate."""
    backend.reset(block)
    hadamard_qubits = qubits_at_positions(block, ENCODER_HADAMARD_POSITIONS)
    backend.h(hadamard_qubits)
    backend.depolarize1(hadamard_qubits, noise.gate_error_1q)
    for control_position, target_position in ENCODER_CNOT_POSITIONS:
        cnot_pair = (block[control_position - 1], block[target_position - 1])
        backend.cnot([cnot_pair])
        backend.depolarize2([cnot_pair], noise.gate_error_2q)


def measure_logical_z_check(backend: QuantumBackend, block: list[int], ancilla: int, noise: NoiseModel) -> int:
    """Copy the parity Z₁Z₆Z₇ onto the ancilla with three CNOTs and measure it (Goto-style verification)."""
    backend.reset([ancilla])
    for check_qubit in qubits_at_positions(block, LOGICAL_Z_CHECK_POSITIONS):
        backend.cnot([(check_qubit, ancilla)])
        backend.depolarize2([(check_qubit, ancilla)], noise.gate_error_2q)
    backend.x_error([ancilla], noise.measurement_error)
    return backend.measure([ancilla])[0]


def apply_transversal_h(backend: QuantumBackend, block: list[int], noise: NoiseModel) -> None:
    """Logical H̄: a Hadamard on every qubit of the block."""
    backend.h(block)
    backend.depolarize1(block, noise.gate_error_1q)


def apply_logical_x(backend: QuantumBackend, block: list[int]) -> None:
    """Logical X̄: X on every qubit. Applied as a noiseless Pauli-frame update."""
    backend.x(block)


def apply_logical_z(backend: QuantumBackend, block: list[int]) -> None:
    """Logical Z̄: Z on every qubit. Applied as a noiseless Pauli-frame update."""
    backend.z(block)


def apply_transversal_cnot(
    backend: QuantumBackend, control_block: list[int], target_block: list[int], noise: NoiseModel
) -> None:
    """Logical CNOT̄: a CNOT from each qubit of control_block to the matching qubit of target_block."""
    check_block_size(control_block)
    check_block_size(target_block)
    cnot_pairs = list(zip(control_block, target_block, strict=True))
    backend.cnot(cnot_pairs)
    backend.depolarize2(cnot_pairs, noise.gate_error_2q)


def measure_logical(
    backend: QuantumBackend, block: list[int], basis: str, noise: NoiseModel
) -> LogicalMeasurement:
    """Measure all 7 qubits in the Z or X basis, decode, and return the logical bit (paper eq. 3)."""
    check_block_size(block)
    if basis not in BASES:
        raise ValueError(f"basis must be one of {BASES}, got {basis!r}")
    if basis == X_BASIS:
        apply_transversal_h(backend, block, noise)
    backend.x_error(block, noise.measurement_error)
    measured_bits = backend.measure(block)
    return decode_block(measured_bits)


def decode_block(measured_bits: list[int]) -> LogicalMeasurement:
    """Flip the bit the syndrome points at (if any) and return the parity of the corrected string."""
    error_position = find_error_position(compute_syndrome(measured_bits))
    corrected_bits = list(measured_bits)
    was_corrected = error_position != 0
    if was_corrected:
        error_index = error_position - 1
        corrected_bits[error_index] = 1 - corrected_bits[error_index]
    return LogicalMeasurement(logical_bit=compute_parity(corrected_bits), was_corrected=was_corrected)


def compute_syndrome(measured_bits: list[int]) -> list[int]:
    """s = H·m mod 2 (paper eq. 1): three bits, most significant first."""
    check_block_size(measured_bits)
    syndrome_bits = []
    for parity_check_row in PARITY_CHECK_ROWS:
        row_count = 0
        for i in range(QUBITS_PER_BLOCK):
            row_count += parity_check_row[i] * measured_bits[i]
        syndrome_bits.append(row_count % 2)
    return syndrome_bits


def find_error_position(syndrome_bits: list[int]) -> int:
    """Read the syndrome as a binary number: the 1-based flipped position, or 0 for no error (paper Table I)."""
    error_position = 0
    for syndrome_bit in syndrome_bits:
        error_position = error_position * 2 + syndrome_bit
    return error_position


def compute_parity(bits: list[int]) -> int:
    """XOR of all the bits."""
    ones_count = 0
    for bit in bits:
        ones_count += bit
    return ones_count % 2


def qubits_at_positions(block: list[int], positions: list[int]) -> list[int]:
    """The qubit indices of block at the given 1-based positions."""
    selected_qubits = []
    for position in positions:
        selected_qubits.append(block[position - 1])
    return selected_qubits


def check_block_size(block: list[int]) -> None:
    """Fail fast when a block does not have exactly 7 entries."""
    if len(block) != QUBITS_PER_BLOCK:
        raise ValueError(f"a Steane block has {QUBITS_PER_BLOCK} qubits, got {len(block)}")
