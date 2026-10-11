"""QuantumBackend implemented with Qiskit's stabilizer formalism (qiskit.quantum_info.Clifford).

Why this exists: Stim is a compiled extension that cannot run in the browser (Pyodide), but Qiskit is pure Python on
top of numpy, so this backend runs anywhere Qiskit does, including Qollab.

Why it does not just call StabilizerState.measure / Clifford.compose per gate: those build a new object for every
call, and Qiskit's measurement walks every qubit in a Python loop. The protocols apply tens of thousands of gates per
request, so this backend keeps ONE Clifford tableau and mutates it in place:

* gates use Qiskit's own in-place tableau updates (clifford_circuits._append_h / _append_x / _append_z / _append_cx);
* measurement is the same Aaronson-Gottesman update as StabilizerState._measure_and_update, with the row products
  (rowsum) vectorized over qubits with numpy instead of looped in Python;
* peeking uses StabilizerState.expectation_value, which never changes the state.

All randomness (measurement outcomes and Pauli noise) comes from one random.Random(seed), so a seed reproduces a run.
The outcomes differ from StimBackend's for the same seed (different random streams), but the physics is the same.
"""

import random

import numpy as np
from qiskit.quantum_info import Clifford, Pauli, StabilizerState
from qiskit.quantum_info.operators.symplectic.clifford_circuits import _append_cx, _append_h, _append_x, _append_z

# The tableau grows in steps of this many qubits, so a protocol that touches qubits 0, 1, 2, ... one at a time does
# not rebuild the tableau at every new index.
GROWTH_STEP = 16

# Single-qubit Paulis by index, the order used to pick depolarizing errors: 0 = I, 1 = X, 2 = Y, 3 = Z.
PAULI_LETTERS = "IXYZ"


class QiskitStabilizerBackend:
    """A seeded, in-place Qiskit Clifford tableau behind the QuantumBackend interface."""

    def __init__(self, seed: int, num_qubits: int = 0) -> None:
        """Start with every qubit in |0⟩; the same seed gives the same measurement outcomes and noise draws.

        num_qubits is only a starting size: any larger qubit index grows the tableau (new qubits start in |0⟩), so
        callers can construct this exactly like StimBackend(seed)."""
        self.rng = random.Random(seed)
        self.clifford = make_zero_state_clifford(0)
        if num_qubits > 0:
            self._ensure_qubits([num_qubits - 1])

    @property
    def num_qubits(self) -> int:
        """How many qubits the tableau currently holds."""
        return self.clifford.num_qubits

    def _ensure_qubits(self, qubits: list[int]) -> None:
        """Grow the tableau so every listed index exists. New qubits are appended in |0⟩ (stabilized by +Z) and
        untouched old rows keep their meaning, so this is a tensor product with |0...0⟩."""
        if not qubits:
            return
        needed = max(qubits) + 1
        old_count = self.clifford.num_qubits
        if needed <= old_count:
            return
        new_count = -(-needed // GROWTH_STEP) * GROWTH_STEP
        old_tableau = self.clifford.tableau
        grown = make_zero_state_clifford(new_count)
        new_tableau = grown.tableau
        # Tableau layout: rows [0, n) destabilizers, [n, 2n) stabilizers; columns [0, n) X, [n, 2n) Z, last = sign.
        for old_rows, new_rows in ((slice(0, old_count), slice(0, old_count)),
                                   (slice(old_count, 2 * old_count), slice(new_count, new_count + old_count))):
            new_tableau[new_rows, :] = False
            new_tableau[new_rows, 0:old_count] = old_tableau[old_rows, 0:old_count]
            new_tableau[new_rows, new_count:new_count + old_count] = old_tableau[old_rows, old_count:2 * old_count]
            new_tableau[new_rows, -1] = old_tableau[old_rows, -1]
        self.clifford = grown

    def reset(self, qubits: list[int]) -> None:
        """See QuantumBackend.reset. Like Stim: measure, then flip a 1 back to 0, which also breaks entanglement."""
        for qubit, outcome in zip(qubits, self.measure(qubits), strict=True):
            if outcome:
                _append_x(self.clifford, qubit)

    def h(self, qubits: list[int]) -> None:
        """See QuantumBackend.h."""
        self._ensure_qubits(qubits)
        for qubit in qubits:
            _append_h(self.clifford, qubit)

    def x(self, qubits: list[int]) -> None:
        """See QuantumBackend.x."""
        self._ensure_qubits(qubits)
        for qubit in qubits:
            _append_x(self.clifford, qubit)

    def z(self, qubits: list[int]) -> None:
        """See QuantumBackend.z."""
        self._ensure_qubits(qubits)
        for qubit in qubits:
            _append_z(self.clifford, qubit)

    def cnot(self, control_target_pairs: list[tuple[int, int]]) -> None:
        """See QuantumBackend.cnot."""
        self._ensure_qubits([qubit for pair in control_target_pairs for qubit in pair])
        for control, target in control_target_pairs:
            _append_cx(self.clifford, control, target)

    def _apply_pauli(self, qubit: int, pauli_index: int) -> None:
        """Apply I, X, Y or Z (index 0-3). Y = XZ up to a global phase, which a stabilizer state does not track."""
        if pauli_index in (1, 2):
            _append_x(self.clifford, qubit)
        if pauli_index in (2, 3):
            _append_z(self.clifford, qubit)

    def depolarize1(self, qubits: list[int], probability: float) -> None:
        """See QuantumBackend.depolarize1. A hit picks X, Y or Z uniformly, as Stim's DEPOLARIZE1 does."""
        if probability <= 0:
            return
        self._ensure_qubits(qubits)
        for qubit in qubits:
            if self.rng.random() < probability:
                self._apply_pauli(qubit, self.rng.randint(1, 3))

    def depolarize2(self, qubit_pairs: list[tuple[int, int]], probability: float) -> None:
        """See QuantumBackend.depolarize2. A hit picks one of the 15 non-identity two-qubit Paulis uniformly."""
        if probability <= 0:
            return
        self._ensure_qubits([qubit for pair in qubit_pairs for qubit in pair])
        for first_qubit, second_qubit in qubit_pairs:
            if self.rng.random() < probability:
                two_qubit_pauli = self.rng.randint(1, 15)
                self._apply_pauli(first_qubit, two_qubit_pauli // 4)
                self._apply_pauli(second_qubit, two_qubit_pauli % 4)

    def x_error(self, qubits: list[int], probability: float) -> None:
        """See QuantumBackend.x_error."""
        if probability <= 0:
            return
        self._ensure_qubits(qubits)
        for qubit in qubits:
            if self.rng.random() < probability:
                _append_x(self.clifford, qubit)

    def measure(self, qubits: list[int]) -> list[int]:
        """See QuantumBackend.measure."""
        self._ensure_qubits(qubits)
        return [self._measure_one(qubit) for qubit in qubits]

    def _measure_one(self, qubit: int) -> int:
        """Z measurement of one qubit, updating the tableau in place.

        Same algorithm as StabilizerState._measure_and_update (Aaronson-Gottesman): if some stabilizer anticommutes
        with Z_qubit the outcome is a fair coin and the tableau is rewritten so Z_qubit (with that sign) becomes a
        stabilizer; otherwise the outcome is fixed and is read off as the sign of a product of stabilizers."""
        tableau = self.clifford.tableau
        count = self.clifford.num_qubits
        x_column = tableau[:, qubit]
        anticommuting_stabilizers = np.flatnonzero(x_column[count:])

        if anticommuting_stabilizers.size == 0:
            # Z_qubit = ± product of the stabilizers whose destabilizer has X on this qubit; the sign is the outcome.
            rows = count + np.flatnonzero(x_column[:count])
            return product_sign(tableau[rows], count)

        outcome = self.rng.randint(0, 1)
        pivot = count + int(anticommuting_stabilizers[0])
        others = np.flatnonzero(x_column)
        others = others[(others != pivot) & (others != pivot - count)]
        if others.size:
            updated = tableau[others]
            multiply_rows_into(updated, tableau[pivot], count)
            tableau[others] = updated
        tableau[pivot - count] = tableau[pivot]
        tableau[pivot] = False
        tableau[pivot, count + qubit] = True
        tableau[pivot, -1] = bool(outcome)
        return outcome

    def peek_pauli_expectation(self, paulis_by_qubit: dict[int, str]) -> int:
        """See QuantumBackend.peek_pauli_expectation. Uses Qiskit's StabilizerState.expectation_value, which only
        reads the tableau, so the state is left exactly as it was."""
        self._ensure_qubits(list(paulis_by_qubit))
        count = self.clifford.num_qubits
        z_bits = np.zeros(count, dtype=bool)
        x_bits = np.zeros(count, dtype=bool)
        for qubit, pauli_letter in paulis_by_qubit.items():
            x_bits[qubit] = pauli_letter in ("X", "Y")
            z_bits[qubit] = pauli_letter in ("Z", "Y")
        state = StabilizerState(self.clifford, validate=False)
        expectation = state.expectation_value(Pauli((z_bits, x_bits)))
        return int(round(complex(expectation).real))


def make_zero_state_clifford(num_qubits: int) -> Clifford:
    """The identity Clifford on num_qubits, i.e. the tableau of |0...0⟩ (stabilizers +Z_i)."""
    tableau = np.zeros((2 * num_qubits, 2 * num_qubits + 1), dtype=bool)
    tableau[:, : 2 * num_qubits] = np.eye(2 * num_qubits, dtype=bool)
    return Clifford(tableau, validate=False)


def multiply_rows_into(accumulators: np.ndarray, row: np.ndarray, count: int) -> None:
    """Replace each accumulator Pauli row A with row·A, tracking the sign: the Aaronson-Gottesman rowsum.

    Rows use the tableau layout (X bits, Z bits, sign bit). The phase exponent is the same per-qubit formula as
    StabilizerState._phase_exponent, summed over qubits with numpy for all accumulators at once."""
    row_x = row[:count].astype(np.int8)
    row_z = row[count : 2 * count].astype(np.int8)
    acc_x = accumulators[:, :count].astype(np.int8)
    acc_z = accumulators[:, count : 2 * count].astype(np.int8)
    per_qubit = acc_x * row_z * (1 + 2 * acc_z + 2 * row_x) - row_x * acc_z * (1 + 2 * row_z + 2 * acc_x)
    exponent = (per_qubit.sum(axis=1, dtype=np.int64) + 2 * int(row[-1]) + 2 * accumulators[:, -1]) % 4
    accumulators[:, -1] = exponent == 2
    accumulators[:, :-1] ^= row[:-1]


def product_sign(rows: np.ndarray, count: int) -> int:
    """The sign bit (0 for +, 1 for -) of the product of commuting Pauli rows, taken in order.

    Equivalent to folding multiply_rows_into over the rows one at a time, but done in one shot: the running product
    before row j is the XOR of all earlier rows (a cumulative XOR), so every step's phase exponent is computed at once.
    This is the hot path of deterministic measurements, which the protocols do thousands of times."""
    if rows.shape[0] == 0:
        return 0
    paulis = rows[:, :-1]
    running = np.logical_xor.accumulate(paulis, axis=0)
    before = np.zeros_like(paulis)
    before[1:] = running[:-1]
    row_x = paulis[:, :count].astype(np.int8)
    row_z = paulis[:, count:].astype(np.int8)
    acc_x = before[:, :count].astype(np.int8)
    acc_z = before[:, count:].astype(np.int8)
    per_qubit = acc_x * row_z * (1 + 2 * acc_z + 2 * row_x) - row_x * acc_z * (1 + 2 * row_z + 2 * acc_x)
    exponent = (int(per_qubit.sum(dtype=np.int64)) + 2 * int(rows[:, -1].sum())) % 4
    return int(exponent == 2)
