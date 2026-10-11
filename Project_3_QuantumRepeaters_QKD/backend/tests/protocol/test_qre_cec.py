"""QRE-CEC: the logical pair Alice–Charlie must be Φ̄⁺."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import qre_cec, repetition_code
from quantum_bros.protocol.noise import NoiseModel

NOISELESS = NoiseModel()
PAIR_COUNT = 40


def measure_both_ends(seed: int, basis: str, tap_fraction: float) -> list[tuple[int, int]]:
    """Distribute PAIR_COUNT pairs and measure both ends in the given basis."""
    backend = StimBackend(seed)
    layout = qre_cec.QubitLayout()
    rng = random.Random(seed)
    bit_pairs = []
    for _ in range(PAIR_COUNT):
        qre_cec.distribute_logical_pair(backend, layout, NOISELESS, rng, tap_fraction)
        alice_bit = repetition_code.measure_logical(backend, layout.alice_block, basis, NOISELESS).logical_bit
        david_bit = repetition_code.measure_logical(backend, layout.david_block, basis, NOISELESS).logical_bit
        bit_pairs.append((alice_bit, david_bit))
    return bit_pairs


@pytest.mark.parametrize("basis", repetition_code.BASES)
def test_noiseless_pairs_without_turtles_give_equal_bits_in_both_bases(basis):
    bit_pairs = measure_both_ends(seed=7, basis=basis, tap_fraction=0)
    alice_bits = []
    for alice_bit, david_bit in bit_pairs:
        assert alice_bit == david_bit
        alice_bits.append(alice_bit)
    # Φ̄⁺ gives random but equal bits, so both values must show up.
    assert set(alice_bits) == {0, 1}


def test_tapping_every_photon_breaks_the_correlation():
    bit_pairs = measure_both_ends(seed=8, basis=repetition_code.X_BASIS, tap_fraction=1)
    mismatch_count = 0
    for alice_bit, david_bit in bit_pairs:
        if alice_bit != david_bit:
            mismatch_count += 1
    assert mismatch_count > PAIR_COUNT // 5


def test_the_layout_gives_every_qubit_one_role():
    layout = qre_cec.QubitLayout()
    all_qubits = []
    for block_number in range(2 * qre_cec.LINK_COUNT):
        all_qubits.extend(layout.data_block(block_number))
    for link in range(qre_cec.LINK_COUNT):
        all_qubits.extend(layout.communication_qubits(link, qre_cec.LEFT_SIDE))
        all_qubits.extend(layout.communication_qubits(link, qre_cec.RIGHT_SIDE))
    all_qubits.extend(layout.message_block)
    # Per link: two data blocks and two sides of communication qubits; then the message block.
    expected_qubit_count = (4 * qre_cec.LINK_COUNT + 1) * repetition_code.QUBITS_PER_BLOCK
    assert expected_qubit_count == 27
    assert sorted(all_qubits) == list(range(expected_qubit_count))


def test_a_report_records_one_entry_per_link_block_and_repeater():
    report = qre_cec.distribute_logical_pair(
        StimBackend(9), qre_cec.QubitLayout(), NOISELESS, random.Random(9), tap_fraction=1
    )
    assert len(report.heralding_attempts) == qre_cec.LINK_COUNT
    assert min(report.heralding_attempts) >= repetition_code.QUBITS_PER_BLOCK
    assert len(report.decoder_corrections) == qre_cec.REPEATER_COUNT
    assert report.tapped_links == list(range(qre_cec.LINK_COUNT))
    assert report.is_tapped


def test_a_tap_fraction_outside_zero_to_one_fails_fast():
    with pytest.raises(ValueError):
        qre_cec.distribute_logical_pair(StimBackend(1), qre_cec.QubitLayout(), NOISELESS, random.Random(1), 1.5)


def test_each_tower_holds_6_12_6_qubits():
    layout = qre_cec.QubitLayout()
    alice_qubits = layout.alice_block + layout.communication_qubits(0, qre_cec.LEFT_SIDE)
    bob_qubits = (
        layout.right_data_block(0) + layout.communication_qubits(0, qre_cec.RIGHT_SIDE)
        + layout.left_data_block(1) + layout.communication_qubits(1, qre_cec.LEFT_SIDE)
    )
    charlie_qubits = layout.david_block + layout.communication_qubits(1, qre_cec.RIGHT_SIDE)
    assert [len(alice_qubits), len(bob_qubits), len(charlie_qubits)] == [6, 12, 6]
