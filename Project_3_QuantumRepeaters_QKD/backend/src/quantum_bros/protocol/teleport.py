"""Level 2 (teleport.html): Mario teleports single-qubit states to Luigi over one Bell pair. Noiseless.

Qubits per teleport: 0 = Mario's message qubit, 1 = Mario's half of the Bell pair, 2 = Luigi's half.
1. Bell pair: H(1), CNOT(1→2).
2. Bell measurement: CNOT(0→1), H(0), measure 0 → z_fix, measure 1 → x_fix.
3. Luigi's fix: X (if chosen), then Z (if chosen).
4. Luigi reads in the state's basis: Z for "0"/"1", X for "+"/"-".
Bennett et al., Phys. Rev. Lett. 70, 1895 (1993); Nielsen & Chuang, section 1.3.7 and Fig. 1.13.

The page lets the player pick the fix, so every teleport is run four times, once per fix, each branch replaying the
same backend seed. The Bell measurement happens before the fix, so the same seed gives the same bell_bits in every
branch; this is asserted, not assumed. Only QuantumBackend is used, so a Qiskit backend can replace Stim later.
"""

import random
from collections.abc import Callable
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend

MESSAGE_QUBIT = 0
MARIO_BELL_QUBIT = 1
LUIGI_QUBIT = 2
ALL_QUBITS = [MESSAGE_QUBIT, MARIO_BELL_QUBIT, LUIGI_QUBIT]

STATES = ("0", "1", "+", "-")
FIXES = ("none", "x", "z", "zx")

# Which Paulis each fix applies, as (applies_x, applies_z). X goes first, then Z, as the spec orders them.
FIX_PAULIS = {"none": (False, False), "x": (True, False), "z": (False, True), "zx": (True, True)}

# A Z-basis measurement gives 0 or 1; each state's basis turns that outcome into the answer Luigi says.
BASIS_ANSWERS = {"0": ("0", "1"), "1": ("0", "1"), "+": ("+", "-"), "-": ("+", "-")}
X_BASIS_STATES = ("+", "-")

# Each teleport gets its own backend seed, drawn from the request's rng; 32 bits matches the API's seed range.
BRANCH_SEED_BITS = 32


@dataclass(frozen=True)
class BellBits:
    """Mario's two Bell-measurement results: z_fix from the message qubit, x_fix from his Bell-pair half."""

    z_fix: int
    x_fix: int


@dataclass(frozen=True)
class TeleportResult:
    """One teleported state: the Bell bits Mario sends, and what Luigi reads after each fix (keys in FIXES order)."""

    state: str
    bell_bits: BellBits
    luigi_reads: dict[str, str]


def run_teleports(
    make_backend: Callable[[int], QuantumBackend], states: list[str], rng: random.Random
) -> list[TeleportResult]:
    """Teleport each state in order. make_backend builds a fresh backend from a seed (for example StimBackend);
    rng draws one backend seed per teleport, so the same rng seed gives the same results."""
    results = []
    for state in states:
        check_state(state)
        branch_seed = rng.getrandbits(BRANCH_SEED_BITS)
        results.append(teleport_one_state(make_backend, state, branch_seed))
    return results


def teleport_one_state(make_backend: Callable[[int], QuantumBackend], state: str, branch_seed: int) -> TeleportResult:
    """Run all four fix branches from the same seed and collect what Luigi reads in each."""
    luigi_reads = {}
    branch_bell_bits = []
    for fix in FIXES:
        bell_bits, luigi_answer = run_branch(make_backend(branch_seed), state, fix)
        branch_bell_bits.append(bell_bits)
        luigi_reads[fix] = luigi_answer
    first_bell_bits = branch_bell_bits[0]
    for bell_bits in branch_bell_bits:
        # A mismatch would mean the backend's randomness depends on gates after the Bell measurement. Raised
        # explicitly rather than with assert, so the check survives python -O.
        if bell_bits != first_bell_bits:
            raise AssertionError(f"fix branches disagree on bell bits: {branch_bell_bits}")
    return TeleportResult(state=state, bell_bits=first_bell_bits, luigi_reads=luigi_reads)


def run_branch(backend: QuantumBackend, state: str, fix: str) -> tuple[BellBits, str]:
    """One full teleport of state with Luigi applying the given fix. Returns the Bell bits and Luigi's answer."""
    check_state(state)
    check_fix(fix)
    backend.reset(ALL_QUBITS)
    prepare_state(backend, MESSAGE_QUBIT, state)
    make_bell_pair(backend)
    bell_bits = measure_bell(backend)
    apply_fix(backend, fix)
    luigi_answer = read_in_state_basis(backend, LUIGI_QUBIT, state)
    return bell_bits, luigi_answer


def prepare_state(backend: QuantumBackend, qubit: int, state: str) -> None:
    """Turn a qubit in |0⟩ into |0⟩, |1⟩, |+⟩ or |-⟩: X makes |1⟩, then H maps |0⟩ → |+⟩ and |1⟩ → |-⟩."""
    needs_flip = state in ("1", "-")
    if needs_flip:
        backend.x([qubit])
    if state in X_BASIS_STATES:
        backend.h([qubit])


def make_bell_pair(backend: QuantumBackend) -> None:
    """Put Mario's and Luigi's halves into Φ⁺ = (|00⟩ + |11⟩)/√2."""
    backend.h([MARIO_BELL_QUBIT])
    backend.cnot([(MARIO_BELL_QUBIT, LUIGI_QUBIT)])


def measure_bell(backend: QuantumBackend) -> BellBits:
    """Mario's Bell measurement on his message qubit and his Bell-pair half."""
    backend.cnot([(MESSAGE_QUBIT, MARIO_BELL_QUBIT)])
    backend.h([MESSAGE_QUBIT])
    z_fix, x_fix = backend.measure([MESSAGE_QUBIT, MARIO_BELL_QUBIT])
    return BellBits(z_fix=z_fix, x_fix=x_fix)


def apply_fix(backend: QuantumBackend, fix: str) -> None:
    """Apply Luigi's chosen fix to his qubit: X first, then Z."""
    applies_x, applies_z = FIX_PAULIS[fix]
    if applies_x:
        backend.x([LUIGI_QUBIT])
    if applies_z:
        backend.z([LUIGI_QUBIT])


def read_in_state_basis(backend: QuantumBackend, qubit: int, state: str) -> str:
    """Measure the qubit in the basis state belongs to and name the result ("0"/"1" or "+"/"-")."""
    if state in X_BASIS_STATES:
        # H turns the X basis into the Z basis, so a Z measurement then reads + as 0 and - as 1.
        backend.h([qubit])
    outcome = backend.measure([qubit])[0]
    return BASIS_ANSWERS[state][outcome]


def right_fix_for(bell_bits: BellBits) -> str:
    """The fix that undoes the Bell measurement's Paulis: X when x_fix is 1, Z when z_fix is 1."""
    for fix, (applies_x, applies_z) in FIX_PAULIS.items():
        is_matching_fix = applies_x == bool(bell_bits.x_fix) and applies_z == bool(bell_bits.z_fix)
        if is_matching_fix:
            return fix
    raise ValueError(f"bell bits must be 0 or 1, got {bell_bits}")


def check_state(state: str) -> None:
    """Fail fast on a state the level does not teleport."""
    if state not in STATES:
        raise ValueError(f"state must be one of {STATES}, got {state!r}")


def check_fix(fix: str) -> None:
    """Fail fast on a fix name Luigi cannot apply."""
    if fix not in FIXES:
        raise ValueError(f"fix must be one of {FIXES}, got {fix!r}")
