"""The interface every quantum simulator behind the protocols must provide.

The protocol code (Steane encoding, QRE-CEC, QKD, messaging) only ever talks to a QuantumBackend, never to Stim or
Qiskit directly. That is what lets a Qiskit backend replace the Stim one later without touching the protocols.

The interface is "measure now, get the bit now": protocols branch on measurement results (verification retries,
Pauli corrections), so a backend must return outcomes immediately, like a tableau or statevector simulator does.
Every gate that takes many qubits applies the same gate to each of them (transversal use is the common case).
"""

from typing import Protocol


class QuantumBackend(Protocol):
    """Gates, Pauli noise and Z-basis measurement on integer-indexed qubits."""

    def reset(self, qubits: list[int]) -> None:
        """Put each qubit in |0⟩."""

    def h(self, qubits: list[int]) -> None:
        """Hadamard on each qubit."""

    def x(self, qubits: list[int]) -> None:
        """Pauli X on each qubit."""

    def z(self, qubits: list[int]) -> None:
        """Pauli Z on each qubit."""

    def cnot(self, control_target_pairs: list[tuple[int, int]]) -> None:
        """CNOT on each (control, target) pair, in order."""

    def depolarize1(self, qubits: list[int], probability: float) -> None:
        """Independently apply a random X, Y or Z to each qubit with the given total probability."""

    def depolarize2(self, qubit_pairs: list[tuple[int, int]], probability: float) -> None:
        """Independently apply one of the 15 non-identity two-qubit Paulis to each pair with the given probability."""

    def x_error(self, qubits: list[int], probability: float) -> None:
        """Independently flip each qubit with X with the given probability (used for measurement errors)."""

    def measure(self, qubits: list[int]) -> list[int]:
        """Measure each qubit in the Z basis and return the outcomes as 0/1, in the same order."""
