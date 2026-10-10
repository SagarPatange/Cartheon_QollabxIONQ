"""Barrett–Kok: every success leaves Φ⁺, whichever detectors clicked."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import barrett_kok
from quantum_bros.protocol.noise import NoiseModel

NOISELESS = NoiseModel()
ALICE_QUBIT = 0
BOB_QUBIT = 1


def measure_pair(backend: StimBackend, basis: str) -> tuple[int, int]:
    """Measure both qubits in the Z or X basis."""
    if basis == "X":
        backend.h([ALICE_QUBIT, BOB_QUBIT])
    alice_bit, bob_bit = backend.measure([ALICE_QUBIT, BOB_QUBIT])
    return alice_bit, bob_bit


@pytest.mark.parametrize("basis", ["Z", "X"])
@pytest.mark.parametrize("detectors", [("D+", "D+"), ("D-", "D-"), ("D+", "D-"), ("D-", "D+")])
def test_both_heralded_states_are_fixed_into_phi_plus(basis, detectors):
    attempt = barrett_kok.HeraldAttempt(round_one_detector=detectors[0], round_two_detector=detectors[1])
    seen_bits = set()
    for seed in range(20):
        backend = StimBackend(seed)
        barrett_kok.prepare_heralded_pair(backend, ALICE_QUBIT, BOB_QUBIT, attempt, NOISELESS)
        alice_bit, bob_bit = measure_pair(backend, basis)
        assert alice_bit == bob_bit
        seen_bits.add(alice_bit)
    # Φ⁺ gives random but equal bits, so both values must show up.
    assert seen_bits == {0, 1}


def test_same_detector_heralds_psi_plus_and_different_detectors_psi_minus():
    assert not barrett_kok.HeraldAttempt("D+", "D+").heralds_psi_minus
    assert barrett_kok.HeraldAttempt("D+", "D-").heralds_psi_minus


def test_only_the_last_attempt_succeeds_and_a_round_one_miss_skips_round_two():
    rng = random.Random(3)
    attempts = barrett_kok.herald_pair(StimBackend(3), ALICE_QUBIT, BOB_QUBIT, NOISELESS, rng)
    assert attempts[-1].is_success
    for attempt in attempts[:-1]:
        assert not attempt.is_success
        if attempt.round_one_detector is None:
            assert attempt.round_two_detector is None


def test_attempts_fail_often_enough_to_show_on_screen():
    rng = random.Random(11)
    attempt_counts = [len(barrett_kok.herald_pair(StimBackend(0), 0, 1, NOISELESS, rng)) for _ in range(200)]
    assert max(attempt_counts) > 1
    assert 1.5 < sum(attempt_counts) / len(attempt_counts) < 5
