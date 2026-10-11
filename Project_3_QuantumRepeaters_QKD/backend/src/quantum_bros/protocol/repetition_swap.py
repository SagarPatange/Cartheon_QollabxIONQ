"""Level 6's swap tutorial: QRECEC_3QubitRepetition.ipynb, Steps 1-11, run on the chain Alice ─ Bob ─ David with the
3-qubit repetition (bit-flip) code, so every block is 3 qubits the page can draw one by one. Noiseless, except for
one bit flip on Bob's a2 block before the swap, so the classical error correction of Step 9 has something to fix.

The notebook's registers, and where they sit in the chain:

    link 1 (Alice–Bob):  a (Alice's data), b (Alice's communication), c (Bob's communication), d (Bob's data)
    link 2 (Bob–David):  a2 (Bob's data), b2 (Bob's communication), c2 (David's communication), d2 (David's data)

The repetition code writes α|0⟩ + β|1⟩ as α|000⟩ + β|111⟩: logical X̄ = XXX, logical Z̄ = Z on any one qubit. It
corrects one bit flip (X), never a phase flip (Z).

Steps (notebook numbering):
1-5. On link 1: Bell pairs b–c, encode a = |+̄⟩ and d = |0̄⟩, teleported CNOT a → d (paper Fig. 4), which uses b and
     c up and leaves a–d in Φ̄⁺. The notebook writes the teleported CNOT with controlled gates (deferred measurement);
     here b and c are measured and the bits sent, as on hardware (qre_cec.teleport_cnot). Both give the same state.
6.   Steps 1-5 again on link 2 (a2–d2).
7.   The two links side by side: Bob holds d and a2.
8.   The swap, a logical Bell measurement at Bob: CNOT d → a2 on each row, d read in X, a2 read in Z.
9.   Classical error correction: a2's 3 bits are decoded (syndrome s1 = m0⊕m1, s2 = m1⊕m2), then each string's
     parity gives the logical bits m_x (from d) and m_z (from a2). d's X-basis bits cannot be corrected.
10.  Pauli frame on David's block: X̄ if m_z, Z̄ if m_x.
11.  The fidelity with Φ̄⁺, F = (1 + ⟨X̄X̄⟩ − ⟨ȲȲ⟩ + ⟨Z̄Z̄⟩)/4. The notebook estimates the correlators from 1000 shots;
     a tableau simulator reads them exactly, so here they are ±1.
"""

import random
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol import qre_cec
from quantum_bros.protocol.noise import NoiseModel

NOISELESS = NoiseModel()

# n in the notebook: qubits per block, so each link has 4n = 12 qubits.
QUBITS_PER_BLOCK = 3
REGISTER_NAMES = ["a", "b", "c", "d", "a2", "b2", "c2", "d2"]

# Step 9's lookup: the syndrome (s1, s2) names the one flipped bit (0-based); (0, 0) means none.
SYNDROME_TO_FLIPPED_BIT = {(1, 0): 0, (1, 1): 1, (0, 1): 2}

# Logical Paulis of one block, as {position in the block: Pauli}. Ȳ = iX̄Z̄ = Y on the first qubit, X on the others.
LOGICAL_X = {0: "X", 1: "X", 2: "X"}
LOGICAL_Y = {0: "Y", 1: "X", 2: "X"}
LOGICAL_Z = {0: "Z"}


@dataclass(frozen=True)
class LinkReport:
    """One link after Steps 1-5: the teleported CNOT's bits, and the logical parities of its two data blocks.

    m_bits are b's (or b2's) Z results, sent right: X on the matching data qubits there. n_bits are c's (or c2's) X
    results, sent left: Z on the matching data qubits there. zz and xx are ⟨Z̄Z̄⟩ and ⟨X̄X̄⟩: both +1 for Φ̄⁺.
    """

    m_bits: list[int]
    n_bits: list[int]
    zz: int
    xx: int


@dataclass(frozen=True)
class SwapReport:
    """Steps 8 and 9 at Bob: the flipped qubit, both measured strings, the decoding and the logical bits.

    flipped_qubit is the a2 qubit (0-2) the bit flip hit. syndrome is (s1, s2) of a2's bits and fixed_qubit the bit
    the decoder flips back, or None. m_z_without_fix is the parity Bob would have sent without decoding.
    """

    flipped_qubit: int
    x_bits: list[int]
    z_bits: list[int]
    syndrome: list[int]
    fixed_qubit: int | None
    fixed_z_bits: list[int]
    m_x: int
    m_z: int
    m_z_without_fix: int


@dataclass(frozen=True)
class Correlators:
    """⟨X̄X̄⟩, ⟨ȲȲ⟩, ⟨Z̄Z̄⟩ on Alice's a and David's d2 (each +1, -1 or 0), and the fidelity with Φ̄⁺ they give."""

    xx: int
    yy: int
    zz: int
    fidelity: float


@dataclass(frozen=True)
class SwapTutorialReport:
    """Everything Level 6's tutorial plays back, in notebook order."""

    links: list[LinkReport]
    swap: SwapReport
    before_frame: Correlators
    after_frame: Correlators
    without_fix: Correlators


def find_register(name: str) -> list[int]:
    """The qubits of one notebook register, in REGISTER_NAMES order: a is 0-2, b is 3-5, ..., d2 is 21-23."""
    first_qubit = REGISTER_NAMES.index(name) * QUBITS_PER_BLOCK
    return list(range(first_qubit, first_qubit + QUBITS_PER_BLOCK))


def run_swap_tutorial(backend: QuantumBackend, rng: random.Random) -> SwapTutorialReport:
    """Steps 1-11 on a fresh backend. rng picks the a2 qubit the bit flip hits; the backend's seed draws every
    measurement, so the same seeds give the same report."""
    all_qubits = []
    for name in REGISTER_NAMES:
        all_qubits.extend(find_register(name))
    backend.reset(all_qubits)
    links = [build_link(backend, "a", "b", "c", "d"), build_link(backend, "a2", "b2", "c2", "d2")]
    flipped_qubit = rng.randrange(QUBITS_PER_BLOCK)
    swap = swap_at_bob(backend, flipped_qubit)
    before_frame = read_correlators(backend)
    correct_frame(backend, swap.m_x, swap.m_z)
    after_frame = read_correlators(backend)
    without_fix = read_correlators_without_fix(backend, swap)
    return SwapTutorialReport(links, swap, before_frame, after_frame, without_fix)


def build_link(backend: QuantumBackend, left_data: str, left_half: str, right_half: str, right_data: str) -> LinkReport:
    """Steps 1-5 on one link: Bell pairs on the communication qubits, encode |+̄⟩ ⊗ |0̄⟩, teleported CNOT."""
    make_bell_pairs(backend, find_register(left_half), find_register(right_half))
    backend.h([find_register(left_data)[0]])
    encode_repetition(backend, find_register(left_data))
    encode_repetition(backend, find_register(right_data))
    m_bits, n_bits = qre_cec.teleport_cnot(
        backend,
        find_register(left_data),
        find_register(right_data),
        find_register(left_half),
        find_register(right_half),
        NOISELESS,
    )
    zz = peek_logical_pair(backend, left_data, right_data, LOGICAL_Z)
    xx = peek_logical_pair(backend, left_data, right_data, LOGICAL_X)
    return LinkReport(m_bits=m_bits, n_bits=n_bits, zz=zz, xx=xx)


def make_bell_pairs(backend: QuantumBackend, left_qubits: list[int], right_qubits: list[int]) -> None:
    """Step 2: Φ⁺ = (|00⟩ + |11⟩)/√2 on each (left, right) pair. Level 1 taught heralding; here the pairs arrive."""
    backend.h(left_qubits)
    backend.cnot(list(zip(left_qubits, right_qubits, strict=True)))


def encode_repetition(backend: QuantumBackend, block: list[int]) -> None:
    """Step 3: α|0⟩ + β|1⟩ on the first qubit becomes α|000⟩ + β|111⟩ (CNOT from it onto the other two)."""
    backend.cnot([(block[0], block[1]), (block[0], block[2])])


def swap_at_bob(backend: QuantumBackend, flipped_qubit: int) -> SwapReport:
    """Steps 8 and 9: flip one a2 qubit, then CNOT d → a2 on each row, read d in X and a2 in Z, and decode."""
    d_block = find_register("d")
    a2_block = find_register("a2")
    backend.x([a2_block[flipped_qubit]])
    backend.cnot(list(zip(d_block, a2_block, strict=True)))
    backend.h(d_block)
    x_bits = backend.measure(d_block)
    z_bits = backend.measure(a2_block)
    syndrome = compute_syndrome(z_bits)
    fixed_qubit = SYNDROME_TO_FLIPPED_BIT.get(tuple(syndrome))
    fixed_z_bits = flip_bit(z_bits, fixed_qubit)
    return SwapReport(
        flipped_qubit=flipped_qubit,
        x_bits=x_bits,
        z_bits=z_bits,
        syndrome=syndrome,
        fixed_qubit=fixed_qubit,
        fixed_z_bits=fixed_z_bits,
        m_x=xor_all(x_bits),
        m_z=xor_all(fixed_z_bits),
        m_z_without_fix=xor_all(z_bits),
    )


def compute_syndrome(bits: list[int]) -> list[int]:
    """Step 9: [s1, s2] = [m0 ⊕ m1, m1 ⊕ m2]. Both 0 means the bits agree (a codeword)."""
    return [bits[0] ^ bits[1], bits[1] ^ bits[2]]


def flip_bit(bits: list[int], position: int | None) -> list[int]:
    """A copy of bits with the one at position flipped; position None leaves them as they are."""
    flipped_bits = list(bits)
    if position is not None:
        flipped_bits[position] ^= 1
    return flipped_bits


def xor_all(bits: list[int]) -> int:
    """The parity of the bits."""
    parity = 0
    for bit in bits:
        parity ^= bit
    return parity


def correct_frame(backend: QuantumBackend, m_x: int, m_z: int) -> None:
    """Step 10: X̄ = XXX on David's d2 when m_z is 1, Z̄ = Z on its first qubit when m_x is 1."""
    d2_block = find_register("d2")
    if m_z == 1:
        backend.x(d2_block)
    if m_x == 1:
        backend.z([d2_block[0]])


def read_correlators(backend: QuantumBackend) -> Correlators:
    """Step 11: the three logical correlators on a and d2, and F = (1 + ⟨X̄X̄⟩ − ⟨ȲȲ⟩ + ⟨Z̄Z̄⟩)/4."""
    xx = peek_logical_pair(backend, "a", "d2", LOGICAL_X)
    yy = peek_logical_pair(backend, "a", "d2", LOGICAL_Y)
    zz = peek_logical_pair(backend, "a", "d2", LOGICAL_Z)
    fidelity = (1 + xx - yy + zz) / 4
    return Correlators(xx=xx, yy=yy, zz=zz, fidelity=fidelity)


def read_correlators_without_fix(backend: QuantumBackend, swap: SwapReport) -> Correlators:
    """What Step 11 would read had Bob sent the undecoded parity: David's X̄ would differ by m_z_without_fix ⊕ m_z.

    Applies that extra X̄ to d2, reads, and undoes it (X̄X̄ = 1), so the state is left as it was.
    """
    is_frame_different = swap.m_z_without_fix != swap.m_z
    d2_block = find_register("d2")
    if is_frame_different:
        backend.x(d2_block)
    correlators = read_correlators(backend)
    if is_frame_different:
        backend.x(d2_block)
    return correlators


def peek_logical_pair(backend: QuantumBackend, first_block: str, second_block: str, logical: dict[int, str]) -> int:
    """⟨P̄ ⊗ P̄⟩ on two blocks, for P̄ given as {position in block: Pauli}: +1, -1, or 0 when random."""
    paulis_by_qubit = {}
    for block_name in (first_block, second_block):
        block = find_register(block_name)
        for position, pauli_letter in logical.items():
            paulis_by_qubit[block[position]] = pauli_letter
    return backend.peek_pauli_expectation(paulis_by_qubit)
