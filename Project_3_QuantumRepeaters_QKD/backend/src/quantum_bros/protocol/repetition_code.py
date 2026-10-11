"""The 3-qubit repetition (bit-flip) code that Level 6's repeater chain runs on (QRECEC_3QubitRepetition.ipynb).

α|0⟩ + β|1⟩ is stored as α|000⟩ + β|111⟩. Logical X̄ = XXX, logical Z̄ = Z on any one qubit. A Z-basis readout is
decoded with the two parities s1 = m0 ⊕ m1, s2 = m1 ⊕ m2, which name the one flipped bit (the same answer as a
majority vote); an X-basis readout is the parity of all three bits, X̄ = XXX, and cannot be corrected: the code
catches bit flips (X), never phase flips (Z).

The functions mirror steane.py's, so the chain (qre_cec.py), BBM92 (qkd.py) and the messages (messaging.py) read the
same with either code. Unlike the Steane code, encoding needs no verification: there is nothing to reject.
"""

from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol.noise import NoiseModel

QUBITS_PER_BLOCK = 3

Z_BASIS = "Z"
X_BASIS = "X"
BASES = [Z_BASIS, X_BASIS]

# (s1, s2) → the one flipped bit, 0-based; (0, 0) means the bits agree. The notebook's Step 9 lookup.
SYNDROME_TO_FLIPPED_BIT = {(1, 0): 0, (1, 1): 1, (0, 1): 2}


@dataclass(frozen=True)
class LogicalMeasurement:
    """The decoded logical bit of one block and whether the decoder had to flip a bit to get it."""

    logical_bit: int
    was_corrected: bool


def encode_logical_zero(backend: QuantumBackend, block: list[int], noise: NoiseModel) -> None:
    """|0̄⟩ = |000⟩: reset the block, then the encoder's two CNOTs (which do nothing to |000⟩ but can add noise)."""
    check_block_size(block)
    backend.reset(block)
    run_encoder(backend, block, noise)


def encode_logical_plus(backend: QuantumBackend, block: list[int], noise: NoiseModel) -> None:
    """|+̄⟩ = (|000⟩ + |111⟩)/√2: H on the first qubit, then CNOT from it onto the other two.

    Transversal H is not a logical H for this code, so |+̄⟩ is prepared directly as this GHZ state.
    """
    check_block_size(block)
    backend.reset(block)
    backend.h([block[0]])
    backend.depolarize1([block[0]], noise.gate_error_1q)
    run_encoder(backend, block, noise)


def run_encoder(backend: QuantumBackend, block: list[int], noise: NoiseModel) -> None:
    """α|0⟩ + β|1⟩ on the first qubit → α|000⟩ + β|111⟩: copy its bit onto the other two, with gate noise."""
    for cnot_pair in [(block[0], block[1]), (block[0], block[2])]:
        backend.cnot([cnot_pair])
        backend.depolarize2([cnot_pair], noise.gate_error_2q)


def apply_logical_x(backend: QuantumBackend, block: list[int]) -> None:
    """Logical X̄ = XXX. Applied as a noiseless Pauli-frame update."""
    backend.x(block)


def apply_logical_z(backend: QuantumBackend, block: list[int]) -> None:
    """Logical Z̄ = Z on one qubit (Z on all three would be the same). Applied as a noiseless Pauli-frame update."""
    backend.z([block[0]])


def apply_transversal_cnot(
    backend: QuantumBackend, control_block: list[int], target_block: list[int], noise: NoiseModel
) -> None:
    """Logical CNOT̄: a CNOT from each qubit of control_block to the matching qubit of target_block."""
    check_block_size(control_block)
    check_block_size(target_block)
    cnot_pairs = list(zip(control_block, target_block, strict=True))
    backend.cnot(cnot_pairs)
    backend.depolarize2(cnot_pairs, noise.gate_error_2q)


def measure_logical(backend: QuantumBackend, block: list[int], basis: str, noise: NoiseModel) -> LogicalMeasurement:
    """Measure all 3 qubits in the Z or X basis and decode: Z bits by their syndrome, X bits by their parity."""
    check_block_size(block)
    if basis not in BASES:
        raise ValueError(f"basis must be one of {BASES}, got {basis!r}")
    if basis == X_BASIS:
        backend.h(block)
        backend.depolarize1(block, noise.gate_error_1q)
    backend.x_error(block, noise.measurement_error)
    measured_bits = backend.measure(block)
    if basis == X_BASIS:
        return LogicalMeasurement(logical_bit=compute_parity(measured_bits), was_corrected=False)
    return decode_z_bits(measured_bits)


def decode_z_bits(measured_bits: list[int]) -> LogicalMeasurement:
    """Flip the bit the syndrome names (if any); the logical bit is then the value all three share."""
    flipped_bit = SYNDROME_TO_FLIPPED_BIT.get(tuple(compute_syndrome(measured_bits)))
    corrected_bits = list(measured_bits)
    was_corrected = flipped_bit is not None
    if was_corrected:
        corrected_bits[flipped_bit] = 1 - corrected_bits[flipped_bit]
    return LogicalMeasurement(logical_bit=corrected_bits[0], was_corrected=was_corrected)


def compute_syndrome(measured_bits: list[int]) -> list[int]:
    """[s1, s2] = [m0 ⊕ m1, m1 ⊕ m2]: where neighbouring bits disagree."""
    check_block_size(measured_bits)
    return [measured_bits[0] ^ measured_bits[1], measured_bits[1] ^ measured_bits[2]]


def compute_parity(bits: list[int]) -> int:
    """XOR of all the bits."""
    parity = 0
    for bit in bits:
        parity ^= bit
    return parity


def check_block_size(block: list[int]) -> None:
    """Fail fast when a block does not have exactly 3 entries."""
    if len(block) != QUBITS_PER_BLOCK:
        raise ValueError(f"a repetition-code block has {QUBITS_PER_BLOCK} qubits, got {len(block)}")
