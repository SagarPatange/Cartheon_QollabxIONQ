"""QRE-CEC (paper §III): distribute one logical Steane Bell pair Φ̄⁺ from Alice to David over two repeaters.

Nodes in a line: Alice ─ Bob ─ Charlie ─ David, one fiber link between each neighbour pair. Each pair goes through:

1. Heralded generation: 7 physical Bell pairs per link, on communication qubits (c_left[i], c_right[i]).
2. Encoding: the left end of every link gets a verified |+̄⟩, the right end a verified |0̄⟩.
3. Transversal teleported CNOT (Fig. 4): consumes the physical pairs and leaves Φ̄⁺ on every link.
4. Encoded swapping at Bob and Charlie: a logical Bell measurement, decoded with the Steane decoder.
5. Pauli-frame correction on David's block. Alice's and David's blocks then hold Φ̄⁺.

Cloud turtles may tap photons in step 1: an intercept-resend measurement of c_right[i] in a random basis.

Simplifications: the heralding success probability is a toy number, drawn classically for statistics and animation
only, and there is no idle decoherence (the simulation has no clock).
"""

import random
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol import steane
from quantum_bros.protocol.noise import NoiseModel

NODE_NAMES = ["Alice", "Bob", "Charlie", "David"]
LINK_COUNT = len(NODE_NAMES) - 1
REPEATER_COUNT = LINK_COUNT - 1

# Toy: chance that one heralded attempt on a link succeeds. Real links are far below this.
TOY_HERALD_SUCCESS_PROBABILITY = 0.35

# Verification rarely rejects at the page's error rates; this many rejections in a row means something is broken.
MAX_ENCODING_ATTEMPTS = 50

LEFT_SIDE = 0
RIGHT_SIDE = 1
SIDE_COUNT = 2


@dataclass(frozen=True)
class QubitLayout:
    """Where every qubit lives. One data block per link end, 7 communication qubits per link end, one verification
    ancilla, and one spare block that holds the payload of a quantum message."""

    def data_block(self, block_number: int) -> list[int]:
        """Block 0 is Alice R, then Bob L, Bob R, Charlie L, Charlie R, David L."""
        first_qubit = block_number * steane.QUBITS_PER_BLOCK
        return list(range(first_qubit, first_qubit + steane.QUBITS_PER_BLOCK))

    def left_data_block(self, link: int) -> list[int]:
        """The data block at the left end of a link (it ends up holding the |+̄⟩ side of the link's pair)."""
        return self.data_block(2 * link)

    def right_data_block(self, link: int) -> list[int]:
        """The data block at the right end of a link."""
        return self.data_block(2 * link + 1)

    def communication_qubits(self, link: int, side: int) -> list[int]:
        """The 7 communication qubits on one side of a link."""
        data_qubit_count = 2 * LINK_COUNT * steane.QUBITS_PER_BLOCK
        first_qubit = data_qubit_count + (link * SIDE_COUNT + side) * steane.QUBITS_PER_BLOCK
        return list(range(first_qubit, first_qubit + steane.QUBITS_PER_BLOCK))

    @property
    def ancilla(self) -> int:
        """The verification ancilla, right after the last communication qubit."""
        return 4 * LINK_COUNT * steane.QUBITS_PER_BLOCK

    @property
    def message_block(self) -> list[int]:
        """The spare block for quantum messages, after the ancilla."""
        first_qubit = self.ancilla + 1
        return list(range(first_qubit, first_qubit + steane.QUBITS_PER_BLOCK))

    @property
    def alice_block(self) -> list[int]:
        """Alice's half of the end-to-end pair."""
        return self.left_data_block(0)

    @property
    def david_block(self) -> list[int]:
        """David's half of the end-to-end pair."""
        return self.right_data_block(LINK_COUNT - 1)


@dataclass(frozen=True)
class PairReport:
    """What happened while distributing one logical pair, for statistics and for the page's animation."""

    heralding_attempts: list[int]
    encoding_attempts: list[int]
    decoder_corrections: list[int]
    frame_x_bit: int
    frame_z_bit: int
    tapped_links: list[int]

    @property
    def is_tapped(self) -> bool:
        """Did a turtle measure at least one photon of this pair?"""
        return len(self.tapped_links) > 0


def distribute_logical_pair(
    backend: QuantumBackend, layout: QubitLayout, noise: NoiseModel, rng: random.Random, tap_fraction: float
) -> PairReport:
    """Run all five QRE-CEC phases once; afterwards layout.alice_block and layout.david_block hold Φ̄⁺.

    rng drives the classical draws (heralding attempts, turtle taps). tap_fraction is the chance each photon is
    tapped; 0 means no turtles.
    """
    if not 0 <= tap_fraction <= 1:
        raise ValueError(f"tap_fraction must be between 0 and 1, got {tap_fraction}")
    heralding_attempts = []
    tapped_links = []
    for link in range(LINK_COUNT):
        heralding_attempts.append(herald_link(backend, layout, link, noise, rng))
        if tap_link(backend, layout, link, rng, tap_fraction):
            tapped_links.append(link)
    encoding_attempts = encode_all_links(backend, layout, noise)
    for link in range(LINK_COUNT):
        teleport_cnot_across_link(backend, layout, link, noise)
    frame_x_bit, frame_z_bit, decoder_corrections = swap_at_repeaters(backend, layout, noise)
    correct_pauli_frame(backend, layout.david_block, frame_x_bit, frame_z_bit)
    return PairReport(
        heralding_attempts=heralding_attempts,
        encoding_attempts=encoding_attempts,
        decoder_corrections=decoder_corrections,
        frame_x_bit=frame_x_bit,
        frame_z_bit=frame_z_bit,
        tapped_links=tapped_links,
    )


def herald_link(backend: QuantumBackend, layout: QubitLayout, link: int, noise: NoiseModel, rng: random.Random) -> int:
    """Phase 1: make 7 noisy physical Φ⁺ pairs on the link; return how many toy heralding attempts that took."""
    left_qubits = layout.communication_qubits(link, LEFT_SIDE)
    right_qubits = layout.communication_qubits(link, RIGHT_SIDE)
    bell_pairs = list(zip(left_qubits, right_qubits, strict=True))
    backend.reset(left_qubits + right_qubits)
    backend.h(left_qubits)
    backend.cnot(bell_pairs)
    backend.depolarize2(bell_pairs, noise.bell_pair_error)

    attempt_count = 0
    for _ in bell_pairs:
        attempt_count += draw_heralding_attempts(rng)
    return attempt_count


def draw_heralding_attempts(rng: random.Random) -> int:
    """How many tries until one heralded success: a geometric draw with the toy success probability."""
    attempt_count = 1
    while rng.random() >= TOY_HERALD_SUCCESS_PROBABILITY:
        attempt_count += 1
    return attempt_count


def tap_link(backend: QuantumBackend, layout: QubitLayout, link: int, rng: random.Random, tap_fraction: float) -> bool:
    """Turtle intercept-resend: each photon is measured in a random basis with chance tap_fraction.

    The measurement collapses the receiving-side qubit and the turtle resends the eigenstate it saw, which is
    what leaving the collapsed qubit in place models. Returns whether any photon on this link was tapped.
    """
    is_link_tapped = False
    for qubit in layout.communication_qubits(link, RIGHT_SIDE):
        if rng.random() >= tap_fraction:
            continue
        is_link_tapped = True
        is_x_basis = rng.random() < 0.5
        if is_x_basis:
            backend.h([qubit])
        backend.measure([qubit])
        if is_x_basis:
            backend.h([qubit])
    return is_link_tapped


def encode_all_links(backend: QuantumBackend, layout: QubitLayout, noise: NoiseModel) -> list[int]:
    """Phase 2: |+̄⟩ on every link's left block, |0̄⟩ on its right block. Returns attempts per block, in block order."""
    encoding_attempts = []
    for link in range(LINK_COUNT):
        left_block = layout.left_data_block(link)
        right_block = layout.right_data_block(link)
        encoding_attempts.append(
            steane.encode_logical_plus(backend, left_block, layout.ancilla, noise, MAX_ENCODING_ATTEMPTS)
        )
        encoding_attempts.append(
            steane.encode_logical_zero(backend, right_block, layout.ancilla, noise, MAX_ENCODING_ATTEMPTS)
        )
    return encoding_attempts


def teleport_cnot_across_link(backend: QuantumBackend, layout: QubitLayout, link: int, noise: NoiseModel) -> None:
    """Phase 3 on one link of the chain: the teleported CNOT from the link's left block to its right block."""
    teleport_cnot(
        backend,
        layout.left_data_block(link),
        layout.right_data_block(link),
        layout.communication_qubits(link, LEFT_SIDE),
        layout.communication_qubits(link, RIGHT_SIDE),
        noise,
    )


def teleport_cnot(
    backend: QuantumBackend,
    left_data: list[int],
    right_data: list[int],
    left_communication: list[int],
    right_communication: list[int],
    noise: NoiseModel,
) -> tuple[list[int], list[int]]:
    """Phase 3 (paper Fig. 4): a transversal CNOT from left_data to right_data, carried by the Bell pairs on the
    communication qubits, which it uses up.

    For each i: CNOT d_left→c_left and measure c_left in Z (m); CNOT c_right→d_right and measure c_right in X (n);
    then X^m on d_right and Z^n on d_left. |+̄⟩ ⊗ |0̄⟩ becomes Φ̄⁺. Returns (m bits sent right, n bits sent left).
    """
    left_pairs = list(zip(left_data, left_communication, strict=True))
    backend.cnot(left_pairs)
    backend.depolarize2(left_pairs, noise.gate_error_2q)
    z_outcomes = measure_physical(backend, left_communication, steane.Z_BASIS, noise)

    right_pairs = list(zip(right_communication, right_data, strict=True))
    backend.cnot(right_pairs)
    backend.depolarize2(right_pairs, noise.gate_error_2q)
    x_outcomes = measure_physical(backend, right_communication, steane.X_BASIS, noise)

    backend.x(select_where_set(right_data, z_outcomes))
    backend.z(select_where_set(left_data, x_outcomes))
    return z_outcomes, x_outcomes


def measure_physical(backend: QuantumBackend, qubits: list[int], basis: str, noise: NoiseModel) -> list[int]:
    """Measure bare qubits in the Z or X basis, with a measurement bit-flip error."""
    if basis == steane.X_BASIS:
        backend.h(qubits)
        backend.depolarize1(qubits, noise.gate_error_1q)
    backend.x_error(qubits, noise.measurement_error)
    return backend.measure(qubits)


def select_where_set(qubits: list[int], bits: list[int]) -> list[int]:
    """The qubits whose matching bit is 1."""
    selected_qubits = []
    for qubit, bit in zip(qubits, bits, strict=True):
        if bit == 1:
            selected_qubits.append(qubit)
    return selected_qubits


def swap_at_repeaters(backend: QuantumBackend, layout: QubitLayout, noise: NoiseModel) -> tuple[int, int, list[int]]:
    """Phase 4: encoded swapping at every repeater.

    Returns (frame_x_bit, frame_z_bit, corrections), where the frame bits are the XOR of every repeater's b_z and b_x
    and corrections counts, per repeater, how many of its two blocks the decoder had to fix.
    """
    frame_x_bit = 0
    frame_z_bit = 0
    decoder_corrections = []
    for repeater in range(REPEATER_COUNT):
        incoming_block = layout.right_data_block(repeater)
        outgoing_block = layout.left_data_block(repeater + 1)
        steane.apply_transversal_cnot(backend, incoming_block, outgoing_block, noise)
        x_basis_result = steane.measure_logical(backend, incoming_block, steane.X_BASIS, noise)
        z_basis_result = steane.measure_logical(backend, outgoing_block, steane.Z_BASIS, noise)
        frame_z_bit ^= x_basis_result.logical_bit
        frame_x_bit ^= z_basis_result.logical_bit
        decoder_corrections.append(int(x_basis_result.was_corrected) + int(z_basis_result.was_corrected))
    return frame_x_bit, frame_z_bit, decoder_corrections


def correct_pauli_frame(backend: QuantumBackend, block: list[int], frame_x_bit: int, frame_z_bit: int) -> None:
    """Phase 5: apply X̄^frame_x Z̄^frame_z to the far end's block so the end-to-end pair is Φ̄⁺."""
    if frame_x_bit == 1:
        steane.apply_logical_x(backend, block)
    if frame_z_bit == 1:
        steane.apply_logical_z(backend, block)
