"""Level 6's swap tutorial (QRECEC_3QubitRepetition.ipynb): both links hold Φ̄⁺, the decoder finds the flipped a2
qubit, the Pauli frame restores Φ̄⁺ between Alice and David, and skipping the decoding breaks it."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import repetition_swap as swap_tutorial

SEED_COUNT = 40


def run(seed: int) -> swap_tutorial.SwapTutorialReport:
    """One tutorial run, seeded the way the server seeds it."""
    return swap_tutorial.run_swap_tutorial(StimBackend(seed), random.Random(seed))


@pytest.mark.parametrize(
    ("bits", "syndrome", "fixed_qubit"),
    [
        ([0, 0, 0], [0, 0], None),
        ([1, 1, 1], [0, 0], None),
        ([1, 0, 0], [1, 0], 0),
        ([0, 1, 0], [1, 1], 1),
        ([1, 1, 0], [0, 1], 2),
    ],
)
def test_the_syndrome_names_the_one_flipped_bit(bits, syndrome, fixed_qubit):
    assert swap_tutorial.compute_syndrome(bits) == syndrome
    assert swap_tutorial.SYNDROME_TO_FLIPPED_BIT.get(tuple(syndrome)) == fixed_qubit


def test_registers_follow_the_notebook_order():
    assert swap_tutorial.find_register("a") == [0, 1, 2]
    assert swap_tutorial.find_register("d") == [9, 10, 11]
    assert swap_tutorial.find_register("d2") == [21, 22, 23]


def test_every_link_holds_the_logical_bell_pair_after_the_teleported_cnot():
    for seed in range(SEED_COUNT):
        for link in run(seed).links:
            assert (link.zz, link.xx) == (1, 1)
            assert len(link.m_bits) == len(link.n_bits) == swap_tutorial.QUBITS_PER_BLOCK


def test_the_decoder_flips_back_exactly_the_qubit_the_bit_flip_hit():
    for seed in range(SEED_COUNT):
        swap = run(seed).swap
        assert swap.fixed_qubit == swap.flipped_qubit
        assert swap.fixed_z_bits in ([0, 0, 0], [1, 1, 1])
        assert swap.m_z_without_fix != swap.m_z


def test_the_pauli_frame_leaves_alice_and_david_in_the_logical_bell_pair():
    for seed in range(SEED_COUNT):
        after_frame = run(seed).after_frame
        assert (after_frame.xx, after_frame.yy, after_frame.zz) == (1, -1, 1)
        assert after_frame.fidelity == 1


def test_sending_the_undecoded_parity_gives_the_wrong_bell_pair():
    for seed in range(SEED_COUNT):
        assert run(seed).without_fix.fidelity == 0


def test_the_frame_bits_say_which_correlators_were_wrong_before_the_frame():
    for seed in range(SEED_COUNT):
        report = run(seed)
        expected_zz = -1 if report.swap.m_z == 1 else 1
        expected_xx = -1 if report.swap.m_x == 1 else 1
        assert (report.before_frame.zz, report.before_frame.xx) == (expected_zz, expected_xx)


def test_both_frame_bits_take_both_values_over_the_seeds():
    frames = set()
    for seed in range(SEED_COUNT):
        swap = run(seed).swap
        frames.add((swap.m_x, swap.m_z))
    assert frames == {(0, 0), (0, 1), (1, 0), (1, 1)}


def test_the_same_seed_gives_the_same_report():
    assert run(7) == run(7)
