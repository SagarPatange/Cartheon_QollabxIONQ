"""Level 2's single link: Alice's and Bob's blocks must end up holding the logical Bell pair Φ̄⁺."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import logical_link, steane
from quantum_bros.protocol.noise import NoiseModel, make_uniform_noise

NOISELESS = NoiseModel()
RUN_COUNT = 30


def run_with_check_basis(seed: int, basis: str, noise: NoiseModel) -> logical_link.LogicalLinkReport:
    """One run whose final check is forced into the given basis (by re-seeding until the draw matches)."""
    for offset in range(100):
        rng = random.Random(seed * 1000 + offset)
        report = logical_link.run_logical_link(StimBackend(seed), noise, rng)
        if report.check_basis == basis:
            return report
    raise AssertionError("could not draw the requested basis")


@pytest.mark.parametrize("basis", steane.BASES)
def test_noiseless_runs_give_equal_logical_bits_in_both_bases(basis):
    alice_bits = []
    for seed in range(RUN_COUNT):
        report = run_with_check_basis(seed, basis, NOISELESS)
        assert report.alice_check.logical_bit == report.bob_check.logical_bit
        assert not report.alice_check.was_corrected
        alice_bits.append(report.alice_check.logical_bit)
    # Φ̄⁺ gives random but equal bits, so both values must show up.
    assert set(alice_bits) == {0, 1}


def test_a_run_reports_seven_heralded_pairs_and_seven_bits_each_way():
    report = logical_link.run_logical_link(StimBackend(4), NOISELESS, random.Random(4))
    assert len(report.herald_attempts) == 7
    for attempts in report.herald_attempts:
        assert attempts[-1].is_success
    assert len(report.alice_cnot_bits) == 7
    assert len(report.bob_cnot_bits) == 7
    assert report.alice_encoding_attempts == 1
    assert report.bob_encoding_attempts == 1


def test_low_noise_almost_always_still_gives_equal_bits():
    noise = make_uniform_noise(0.001)
    equal_count = 0
    for seed in range(RUN_COUNT):
        report = logical_link.run_logical_link(StimBackend(seed), noise, random.Random(seed))
        equal_count += int(report.alice_check.logical_bit == report.bob_check.logical_bit)
    assert equal_count >= RUN_COUNT - 1
