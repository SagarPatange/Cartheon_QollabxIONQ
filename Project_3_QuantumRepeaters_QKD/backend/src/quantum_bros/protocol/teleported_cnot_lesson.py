"""Level 4 (teleported_cnot.html): the teleported CNOT of paper Fig. 4, first on one Bell pair, then transversally on
two Steane blocks (docs/qre_cec_protocol.md, phase 3; Jiang et al., Phys. Rev. A 76, 062323 (2007)). Noiseless.

The circuit, for data qubits d_A (Mario, the control) and d_B (Luigi, the target) and a Bell pair Φ⁺ on c_A, c_B:
CNOT d_A → c_A, measure c_A in Z (bit m, sent to Luigi); CNOT c_B → d_B, measure c_B in X (bit n, sent to Mario); then
X^m on d_B and Z^n on d_A. The data end up as CNOT|α⟩|β⟩ = |α⟩|β ⊕ α⟩. This is qre_cec.teleport_cnot.

Rounds:
1. One pair, d_A = |1⟩, d_B = |0⟩: Luigi's qubit must become 1. Read both in Z.
2. One pair, d_A = |+⟩, d_B = |0⟩: CNOT makes the Bell pair Φ⁺, whose ZZ and XX parities are both +1 (bit 0).
   Both parities commute, so an ancilla measures each without disturbing the other.
3. Blocks: Mario's |+̄⟩, Luigi's |0̄⟩, 7 Bell pairs, the same circuit on each pair (transversal): the logical Bell pair
   Φ̄⁺, with Z̄Z̄ = Z on all 14 data qubits and X̄X̄ = X on all 14 both +1.
4. The same, but a cloud turtle flips one Bell pair (X on Luigi's half). The CNOT carries that X onto Luigi's data qubit
   only, so Z̄Z̄ reads -1; Luigi's Z checks name the qubit, he flips it back, and Φ̄⁺ is restored.

In rounds 1 and 2 the player picks the fixes, so each is run once per fix ("none", "x" = X on Luigi's d_B, "z" = Z on
Mario's d_A, "xz" = both), every branch replaying the same backend seed. m and n are measured before any fix, so every
branch gives the same bits; this is checked, not assumed. In rounds 3 and 4 the fixes follow the rule.
"""

import random
from collections.abc import Callable
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol import qre_cec, steane, steane_block
from quantum_bros.protocol.noise import NoiseModel

NOISELESS = NoiseModel()
MAX_ENCODING_ATTEMPTS = 1

# One-pair rounds: Mario's data, Mario's and Luigi's halves of the Bell pair, Luigi's data, the parity ancilla.
MARIO_DATA = 0
MARIO_HALF = 1
LUIGI_HALF = 2
LUIGI_DATA = 3
PAIR_ANCILLA = 4
PAIR_QUBITS = [MARIO_DATA, MARIO_HALF, LUIGI_HALF, LUIGI_DATA, PAIR_ANCILLA]

# Block rounds: Mario's 7 data, his 7 halves, Luigi's 7 halves, Luigi's 7 data, then one ancilla.
BLOCK_SIZE = steane.QUBITS_PER_BLOCK
MARIO_BLOCK = list(range(0, BLOCK_SIZE))
MARIO_HALVES = list(range(BLOCK_SIZE, 2 * BLOCK_SIZE))
LUIGI_HALVES = list(range(2 * BLOCK_SIZE, 3 * BLOCK_SIZE))
LUIGI_BLOCK = list(range(3 * BLOCK_SIZE, 4 * BLOCK_SIZE))
BLOCK_ANCILLA = 4 * BLOCK_SIZE

FIXES = ("none", "x", "z", "xz")
# Which fixes each choice applies, as (X on Luigi's data, Z on Mario's data).
FIX_PAULIS = {"none": (False, False), "x": (True, False), "z": (False, True), "xz": (True, True)}

CLASSICAL_INPUT = "1"
BELL_INPUT = "+"
ROUND_SEED_BITS = 32


@dataclass(frozen=True)
class ClassicalRound:
    """Round 1: m and n, then what Mario and Luigi read in Z after each fix (keys in FIXES order)."""

    m: int
    n: int
    readings: dict[str, dict[str, int]]


@dataclass(frozen=True)
class BellRound:
    """Round 2: m and n, then the ZZ and XX parity bits after each fix (0 means +1)."""

    m: int
    n: int
    readings: dict[str, dict[str, int]]


@dataclass(frozen=True)
class BlockRound:
    """Rounds 3 and 4: the 7 m and 7 n bits, the logical parities right after the fixes, Luigi's syndromes, and the
    logical parities after Luigi fixes what his syndrome names. bad_pair is the turtle's pair (1-7), or None."""

    bad_pair: int | None
    m_bits: list[int]
    n_bits: list[int]
    raw_zz_bit: int
    raw_xx_bit: int
    luigi_z_syndrome: list[int]
    luigi_x_syndrome: list[int]
    fixed_zz_bit: int
    fixed_xx_bit: int


@dataclass(frozen=True)
class LessonReport:
    """Every round of the level, in order."""

    classical_round: ClassicalRound
    bell_round: BellRound
    block_rounds: list[BlockRound]


def run_lesson(make_backend: Callable[[int], QuantumBackend], rng: random.Random) -> LessonReport:
    """All four rounds. make_backend builds a fresh backend from a seed; rng draws the seeds and the turtle's pair, so
    the same rng seed gives the same report."""
    classical_m, classical_n, classical_readings = run_pair_round(
        make_backend, CLASSICAL_INPUT, rng.getrandbits(ROUND_SEED_BITS)
    )
    bell_m, bell_n, bell_readings = run_pair_round(make_backend, BELL_INPUT, rng.getrandbits(ROUND_SEED_BITS))
    good_round = run_block_round(make_backend(rng.getrandbits(ROUND_SEED_BITS)), bad_pair=None)
    bad_pair = rng.randrange(1, BLOCK_SIZE + 1)
    bad_round = run_block_round(make_backend(rng.getrandbits(ROUND_SEED_BITS)), bad_pair=bad_pair)
    return LessonReport(
        classical_round=ClassicalRound(classical_m, classical_n, classical_readings),
        bell_round=BellRound(bell_m, bell_n, bell_readings),
        block_rounds=[good_round, bad_round],
    )


def run_pair_round(
    make_backend: Callable[[int], QuantumBackend], mario_input: str, round_seed: int
) -> tuple[int, int, dict[str, dict[str, int]]]:
    """Run one-pair round once per fix from the same seed. Returns m, n and each fix's readings."""
    readings = {}
    branch_bits = []
    for fix in FIXES:
        backend = make_backend(round_seed)
        m, n = teleport_cnot_on_one_pair(backend, mario_input)
        apply_pair_fix(backend, fix, m, n)
        branch_bits.append((m, n))
        readings[fix] = read_pair(backend, mario_input)
    if len(set(branch_bits)) != 1:
        # Raised explicitly rather than with assert, so the check survives python -O.
        raise AssertionError(f"fix branches disagree on m and n: {branch_bits}")
    m, n = branch_bits[0]
    return m, n, readings


def teleport_cnot_on_one_pair(backend: QuantumBackend, mario_input: str) -> tuple[int, int]:
    """Prepare d_A (|1⟩ or |+⟩), d_B = |0⟩ and Φ⁺, then run Fig. 4 up to (not including) the fixes. Returns (m, n)."""
    backend.reset(PAIR_QUBITS)
    if mario_input == CLASSICAL_INPUT:
        backend.x([MARIO_DATA])
    else:
        backend.h([MARIO_DATA])
    make_bell_pairs(backend, [MARIO_HALF], [LUIGI_HALF])
    backend.cnot([(MARIO_DATA, MARIO_HALF)])
    m = backend.measure([MARIO_HALF])[0]
    backend.cnot([(LUIGI_HALF, LUIGI_DATA)])
    backend.h([LUIGI_HALF])
    n = backend.measure([LUIGI_HALF])[0]
    return m, n


def apply_pair_fix(backend: QuantumBackend, fix: str, m: int, n: int) -> None:
    """Apply the fix the player chose, whatever m and n say, so a wrong choice shows up in the readings."""
    if fix not in FIXES:
        raise ValueError(f"fix must be one of {FIXES}, got {fix!r}")
    applies_x, applies_z = FIX_PAULIS[fix]
    if applies_x:
        backend.x([LUIGI_DATA])
    if applies_z:
        backend.z([MARIO_DATA])


def read_pair(backend: QuantumBackend, mario_input: str) -> dict[str, int]:
    """Round 1: both data qubits read in Z. Round 2: the ZZ and XX parities, each measured with the ancilla."""
    if mario_input == CLASSICAL_INPUT:
        mario_bit, luigi_bit = backend.measure([MARIO_DATA, LUIGI_DATA])
        return {"mario_bit": mario_bit, "luigi_bit": luigi_bit}
    zz_bit = steane_block.measure_parity(backend, [MARIO_DATA, LUIGI_DATA], "Z", PAIR_ANCILLA)
    xx_bit = steane_block.measure_parity(backend, [MARIO_DATA, LUIGI_DATA], "X", PAIR_ANCILLA)
    return {"zz_bit": zz_bit, "xx_bit": xx_bit}


def right_fix_for(m: int, n: int) -> str:
    """The fix Fig. 4 prescribes: X on Luigi's data when m is 1, Z on Mario's data when n is 1."""
    for fix, (applies_x, applies_z) in FIX_PAULIS.items():
        if applies_x == bool(m) and applies_z == bool(n):
            return fix
    raise ValueError(f"m and n must be 0 or 1, got {m}, {n}")


def run_block_round(backend: QuantumBackend, bad_pair: int | None) -> BlockRound:
    """Encode both blocks, make 7 Bell pairs (one flipped if bad_pair is set), run the transversal teleported CNOT
    with the prescribed fixes, check, let Luigi decode, and check again."""
    backend.reset(MARIO_BLOCK + MARIO_HALVES + LUIGI_HALVES + LUIGI_BLOCK + [BLOCK_ANCILLA])
    steane.encode_logical_plus(backend, MARIO_BLOCK, BLOCK_ANCILLA, NOISELESS, MAX_ENCODING_ATTEMPTS)
    steane.encode_logical_zero(backend, LUIGI_BLOCK, BLOCK_ANCILLA, NOISELESS, MAX_ENCODING_ATTEMPTS)
    make_bell_pairs(backend, MARIO_HALVES, LUIGI_HALVES)
    if bad_pair is not None:
        backend.x([LUIGI_HALVES[bad_pair - 1]])
    m_bits, n_bits = qre_cec.teleport_cnot(backend, MARIO_BLOCK, LUIGI_BLOCK, MARIO_HALVES, LUIGI_HALVES, NOISELESS)
    raw_zz_bit, raw_xx_bit = measure_logical_parities(backend)
    luigi_z_syndrome = measure_block_syndrome(backend, LUIGI_BLOCK, "Z")
    luigi_x_syndrome = measure_block_syndrome(backend, LUIGI_BLOCK, "X")
    flip_position = steane_block.read_syndrome_position(luigi_z_syndrome)
    if flip_position != 0:
        backend.x([LUIGI_BLOCK[flip_position - 1]])
    fixed_zz_bit, fixed_xx_bit = measure_logical_parities(backend)
    return BlockRound(
        bad_pair, m_bits, n_bits, raw_zz_bit, raw_xx_bit, luigi_z_syndrome, luigi_x_syndrome, fixed_zz_bit, fixed_xx_bit
    )


def make_bell_pairs(backend: QuantumBackend, mario_halves: list[int], luigi_halves: list[int]) -> None:
    """Φ⁺ on each (Mario's half, Luigi's half). Level 1 taught heralding; here the pairs simply arrive."""
    backend.h(mario_halves)
    backend.cnot(list(zip(mario_halves, luigi_halves, strict=True)))


def measure_logical_parities(backend: QuantumBackend) -> tuple[int, int]:
    """Z̄Z̄ (Z on all 14 data qubits) and X̄X̄ (X on all 14), each with the ancilla; 0 means +1."""
    data_qubits = MARIO_BLOCK + LUIGI_BLOCK
    zz_bit = steane_block.measure_parity(backend, data_qubits, "Z", BLOCK_ANCILLA)
    xx_bit = steane_block.measure_parity(backend, data_qubits, "X", BLOCK_ANCILLA)
    return zz_bit, xx_bit


def measure_block_syndrome(backend: QuantumBackend, block: list[int], pauli_letter: str) -> list[int]:
    """One block's three checks of one type, measured with the ancilla in row order (4567, 2367, 1357)."""
    syndrome = []
    for check_positions in steane_block.list_check_positions():
        check_qubits = [block[position - 1] for position in check_positions]
        syndrome.append(steane_block.measure_parity(backend, check_qubits, pauli_letter, BLOCK_ANCILLA))
    return syndrome
