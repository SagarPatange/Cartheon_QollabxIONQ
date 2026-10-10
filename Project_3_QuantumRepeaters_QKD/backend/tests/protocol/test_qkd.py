"""BBM92 on logical pairs: clean keys without turtles, an abort when they tap everything."""

import random

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import qkd
from quantum_bros.protocol.network import QuantumNetwork
from quantum_bros.protocol.noise import NoiseModel, make_uniform_noise

KEY_BITS = 32
SEED_COUNT = 5


def make_network(seed: int, noise: NoiseModel, tap_fraction: float) -> QuantumNetwork:
    """A fresh network seeded the way the server seeds it."""
    return QuantumNetwork(backend=StimBackend(seed), noise=noise, rng=random.Random(seed), tap_fraction=tap_fraction)


def test_noiseless_qkd_without_turtles_gives_identical_keys_and_zero_qber():
    report = qkd.run_qkd(make_network(1, NoiseModel(), 0), KEY_BITS)
    assert report.qber == 0
    assert not report.is_aborted
    assert len(report.alice_key) == KEY_BITS
    assert report.alice_key == report.david_key
    assert report.key_mismatches == 0
    assert report.sample_size + KEY_BITS == report.sifted_count


def test_turtles_tapping_every_photon_push_qber_past_the_threshold_and_abort():
    aborted_count = 0
    for seed in range(SEED_COUNT):
        report = qkd.run_qkd(make_network(seed, NoiseModel(), 1), KEY_BITS)
        assert report.qber > qkd.QBER_ABORT_THRESHOLD
        if report.is_aborted:
            aborted_count += 1
    assert aborted_count == SEED_COUNT


def test_the_steane_code_absorbs_rare_taps_at_low_noise():
    # Loose on purpose: a block survives one tapped photon, so a light tap rate should mostly pass the check.
    passed_count = 0
    for seed in range(SEED_COUNT):
        report = qkd.run_qkd(make_network(seed, make_uniform_noise(0.0005), 0.02), KEY_BITS)
        if not report.is_aborted:
            passed_count += 1
    assert passed_count >= SEED_COUNT - 1


def test_the_same_seed_gives_the_same_report():
    first_report = qkd.run_qkd(make_network(3, make_uniform_noise(0.002), 0.1), KEY_BITS)
    second_report = qkd.run_qkd(make_network(3, make_uniform_noise(0.002), 0.1), KEY_BITS)
    assert first_report == second_report


def test_rounds_shown_are_capped_and_carry_the_card_fields():
    report = qkd.run_qkd(make_network(4, NoiseModel(), 0), KEY_BITS)
    assert len(report.rounds_shown) == min(qkd.ROUNDS_SHOWN, report.round_count)
    assert set(report.rounds_shown[0]) == {
        "alice_basis", "david_basis", "alice_bit", "david_bit", "is_sifted", "is_sampled", "is_tapped",
    }
