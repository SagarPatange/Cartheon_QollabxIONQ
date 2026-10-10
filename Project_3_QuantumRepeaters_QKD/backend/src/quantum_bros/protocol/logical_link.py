"""Level 2: one logical Steane Bell pair Φ̄⁺ between two neighbouring nodes, Alice and Bob (docs/qre_cec_protocol.md,
phases 1-3). There is no repeater in between, so no encoded swapping and no Pauli frame.

1. Barrett–Kok heralding makes 7 physical Φ⁺ pairs on the communication qubits.
2. Alice encodes a verified |+̄⟩ and Bob a verified |0̄⟩, each checked with the ancilla.
3. The transversal teleported CNOT uses up the 7 pairs and leaves Φ̄⁺ on the two data blocks.
4. To show the result, both blocks are measured in the same random basis and decoded; Φ̄⁺ gives equal bits.
"""

import random
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol import barrett_kok, qre_cec, steane
from quantum_bros.protocol.noise import NoiseModel

# Qubit numbers: Alice's data block, Bob's data block, Alice's and Bob's communication qubits, then the ancilla.
ALICE_DATA = list(range(0, 7))
BOB_DATA = list(range(7, 14))
ALICE_COMMUNICATION = list(range(14, 21))
BOB_COMMUNICATION = list(range(21, 28))
CHECK_ANCILLA = 28

# Verification rarely rejects at the page's error rates; this many rejections in a row means something is broken.
MAX_ENCODING_ATTEMPTS = 50


@dataclass(frozen=True)
class LogicalLinkReport:
    """Everything the page animates, in protocol order.

    herald_attempts: for each of the 7 physical pairs, every Barrett–Kok attempt until it succeeded.
    alice_encoding_attempts, bob_encoding_attempts: tries until the ancilla check accepted the block (1 = first try).
    alice_cnot_bits: Alice's Z results, sent to Bob. bob_cnot_bits: Bob's X results, sent back to Alice.
    check_basis: the basis both blocks were measured in at the end.
    alice_check, bob_check: the decoded logical bits, and whether the decoder had to fix a bit.
    """

    herald_attempts: list[list[barrett_kok.HeraldAttempt]]
    alice_encoding_attempts: int
    bob_encoding_attempts: int
    alice_cnot_bits: list[int]
    bob_cnot_bits: list[int]
    check_basis: str
    alice_check: steane.LogicalMeasurement
    bob_check: steane.LogicalMeasurement


def run_logical_link(backend: QuantumBackend, noise: NoiseModel, rng: random.Random) -> LogicalLinkReport:
    """Run phases 1-3 on one link, then measure both blocks to show the pair. rng drives the toy heralding draws and
    the choice of check basis; the backend's own seed drives every quantum measurement."""
    herald_attempts = herald_all_pairs(backend, noise, rng)
    alice_encoding_attempts = steane.encode_logical_plus(
        backend, ALICE_DATA, CHECK_ANCILLA, noise, MAX_ENCODING_ATTEMPTS
    )
    bob_encoding_attempts = steane.encode_logical_zero(backend, BOB_DATA, CHECK_ANCILLA, noise, MAX_ENCODING_ATTEMPTS)
    alice_cnot_bits, bob_cnot_bits = qre_cec.teleport_cnot(
        backend, ALICE_DATA, BOB_DATA, ALICE_COMMUNICATION, BOB_COMMUNICATION, noise
    )
    check_basis = rng.choice(steane.BASES)
    return LogicalLinkReport(
        herald_attempts=herald_attempts,
        alice_encoding_attempts=alice_encoding_attempts,
        bob_encoding_attempts=bob_encoding_attempts,
        alice_cnot_bits=alice_cnot_bits,
        bob_cnot_bits=bob_cnot_bits,
        check_basis=check_basis,
        alice_check=steane.measure_logical(backend, ALICE_DATA, check_basis, noise),
        bob_check=steane.measure_logical(backend, BOB_DATA, check_basis, noise),
    )


def herald_all_pairs(
    backend: QuantumBackend, noise: NoiseModel, rng: random.Random
) -> list[list[barrett_kok.HeraldAttempt]]:
    """Phase 1: one Barrett–Kok pair per communication qubit, Alice's i-th with Bob's i-th."""
    herald_attempts = []
    for alice_qubit, bob_qubit in zip(ALICE_COMMUNICATION, BOB_COMMUNICATION, strict=True):
        herald_attempts.append(barrett_kok.herald_pair(backend, alice_qubit, bob_qubit, noise, rng))
    return herald_attempts
