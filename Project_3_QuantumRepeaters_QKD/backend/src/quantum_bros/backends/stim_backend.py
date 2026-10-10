"""QuantumBackend implemented with Stim's TableauSimulator (Clifford gates and Pauli noise only).

A tableau simulator tracks stabilizers instead of amplitudes, so a hundred qubits cost almost nothing. The price is
that only Clifford operations exist: arbitrary rotations need a different backend (for example Qiskit).
"""

import stim


class StimBackend:
    """A seeded Stim TableauSimulator behind the QuantumBackend interface."""

    def __init__(self, seed: int) -> None:
        """Create the simulator; the same seed gives the same measurement outcomes and noise draws."""
        self.simulator = stim.TableauSimulator(seed=seed)

    def reset(self, qubits: list[int]) -> None:
        """See QuantumBackend.reset."""
        self.simulator.reset(*qubits)

    def h(self, qubits: list[int]) -> None:
        """See QuantumBackend.h."""
        self.simulator.h(*qubits)

    def x(self, qubits: list[int]) -> None:
        """See QuantumBackend.x."""
        self.simulator.x(*qubits)

    def z(self, qubits: list[int]) -> None:
        """See QuantumBackend.z."""
        self.simulator.z(*qubits)

    def cnot(self, control_target_pairs: list[tuple[int, int]]) -> None:
        """See QuantumBackend.cnot."""
        self.simulator.cnot(*flatten_pairs(control_target_pairs))

    def depolarize1(self, qubits: list[int], probability: float) -> None:
        """See QuantumBackend.depolarize1."""
        if probability > 0:
            self.simulator.depolarize1(*qubits, p=probability)

    def depolarize2(self, qubit_pairs: list[tuple[int, int]], probability: float) -> None:
        """See QuantumBackend.depolarize2."""
        if probability > 0:
            self.simulator.depolarize2(*flatten_pairs(qubit_pairs), p=probability)

    def x_error(self, qubits: list[int], probability: float) -> None:
        """See QuantumBackend.x_error."""
        if probability > 0:
            self.simulator.x_error(*qubits, p=probability)

    def measure(self, qubits: list[int]) -> list[int]:
        """See QuantumBackend.measure."""
        outcomes = self.simulator.measure_many(*qubits)
        return [int(outcome) for outcome in outcomes]


    def peek_pauli_expectation(self, paulis_by_qubit: dict[int, str]) -> int:
        """See QuantumBackend.peek_pauli_expectation. A tableau knows this exactly: ±1 or 0, never in between."""
        pauli_string = stim.PauliString(max(paulis_by_qubit) + 1)
        for qubit, pauli_letter in paulis_by_qubit.items():
            pauli_string[qubit] = pauli_letter
        return int(self.simulator.peek_observable_expectation(pauli_string))


def flatten_pairs(qubit_pairs: list[tuple[int, int]]) -> list[int]:
    """[(0, 1), (2, 3)] → [0, 1, 2, 3], the target layout Stim expects for two-qubit gates."""
    flat_targets = []
    for first_qubit, second_qubit in qubit_pairs:
        flat_targets.append(first_qubit)
        flat_targets.append(second_qubit)
    return flat_targets
