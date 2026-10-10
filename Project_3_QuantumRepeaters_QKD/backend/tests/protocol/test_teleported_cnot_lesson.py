"""Level 4's teleported CNOT (paper Fig. 4): one pair acts as a CNOT, makes Φ⁺ from |+⟩|0⟩, and transversally makes
the logical Φ̄⁺; one flipped Bell pair spoils one qubit, which Luigi's Steane checks find and fix."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import teleported_cnot_lesson as lesson

SEED_COUNT = 40
BLOCK_SEED_COUNT = 10


def pair_round(mario_input: str, seed: int) -> tuple[int, int, dict]:
    """One one-pair round with a Stim backend, the way run_lesson runs it."""
    return lesson.run_pair_round(StimBackend, mario_input, seed)


def find_seed_with_bits(mario_input: str, wanted_m: int, wanted_n: int) -> tuple[int, int, dict]:
    """Search seeds until the measurements give the wanted m and n."""
    for seed in range(1000):
        m, n, readings = pair_round(mario_input, seed)
        if (m, n) == (wanted_m, wanted_n):
            return m, n, readings
    raise AssertionError(f"no seed gave m={wanted_m}, n={wanted_n}")


def binary_digits(position: int) -> list[int]:
    """A position as a 3-bit syndrome, most significant bit first: 6 → [1, 1, 0]."""
    return [(position >> shift) & 1 for shift in (2, 1, 0)]


def test_with_the_prescribed_fix_one_and_zero_become_one_and_one():
    for seed in range(SEED_COUNT):
        m, n, readings = pair_round(lesson.CLASSICAL_INPUT, seed)
        assert readings[lesson.right_fix_for(m, n)] == {"mario_bit": 1, "luigi_bit": 1}


def test_skipping_the_x_fix_when_m_is_one_leaves_luigis_qubit_at_zero():
    _, _, readings = find_seed_with_bits(lesson.CLASSICAL_INPUT, wanted_m=1, wanted_n=0)
    assert readings["none"] == {"mario_bit": 1, "luigi_bit": 0}


def test_on_zero_or_one_the_z_fix_never_changes_what_they_read():
    for seed in range(SEED_COUNT):
        _, _, readings = pair_round(lesson.CLASSICAL_INPUT, seed)
        assert readings["none"] == readings["z"]
        assert readings["x"] == readings["xz"]


def test_with_the_prescribed_fix_plus_and_zero_become_the_bell_pair():
    for seed in range(SEED_COUNT):
        m, n, readings = pair_round(lesson.BELL_INPUT, seed)
        assert readings[lesson.right_fix_for(m, n)] == {"zz_bit": 0, "xx_bit": 0}


def test_a_missing_x_fix_breaks_zz_and_a_missing_z_fix_breaks_xx():
    _, _, readings = find_seed_with_bits(lesson.BELL_INPUT, wanted_m=1, wanted_n=1)
    assert readings["xz"] == {"zz_bit": 0, "xx_bit": 0}
    assert readings["z"] == {"zz_bit": 1, "xx_bit": 0}
    assert readings["x"] == {"zz_bit": 0, "xx_bit": 1}
    assert readings["none"] == {"zz_bit": 1, "xx_bit": 1}


@pytest.mark.parametrize("mario_input", [lesson.CLASSICAL_INPUT, lesson.BELL_INPUT])
def test_m_and_n_take_all_four_values_over_many_seeds(mario_input):
    seen_bits = set()
    for seed in range(SEED_COUNT):
        m, n, _ = pair_round(mario_input, seed)
        seen_bits.add((m, n))
    assert seen_bits == {(0, 0), (0, 1), (1, 0), (1, 1)}


def test_the_transversal_teleported_cnot_makes_the_logical_bell_pair():
    for seed in range(BLOCK_SEED_COUNT):
        block_round = lesson.run_block_round(StimBackend(seed), bad_pair=None)
        assert (block_round.raw_zz_bit, block_round.raw_xx_bit) == (0, 0)
        assert block_round.luigi_z_syndrome == [0, 0, 0]
        assert block_round.luigi_x_syndrome == [0, 0, 0]
        assert (block_round.fixed_zz_bit, block_round.fixed_xx_bit) == (0, 0)
        assert len(block_round.m_bits) == lesson.BLOCK_SIZE
        assert len(block_round.n_bits) == lesson.BLOCK_SIZE


@pytest.mark.parametrize("bad_pair", range(1, lesson.BLOCK_SIZE + 1))
def test_one_flipped_bell_pair_spoils_one_qubit_which_luigis_checks_find_and_fix(bad_pair):
    block_round = lesson.run_block_round(StimBackend(seed=bad_pair), bad_pair=bad_pair)
    assert (block_round.raw_zz_bit, block_round.raw_xx_bit) == (1, 0)
    assert block_round.luigi_z_syndrome == binary_digits(bad_pair)
    assert block_round.luigi_x_syndrome == [0, 0, 0]
    assert (block_round.fixed_zz_bit, block_round.fixed_xx_bit) == (0, 0)


def test_the_lesson_has_four_rounds_and_repeats_with_the_same_seed():
    first_report = lesson.run_lesson(StimBackend, random.Random(3))
    second_report = lesson.run_lesson(StimBackend, random.Random(3))
    assert first_report == second_report
    assert first_report.block_rounds[0].bad_pair is None
    assert first_report.block_rounds[1].bad_pair in range(1, lesson.BLOCK_SIZE + 1)
    assert list(first_report.classical_round.readings) == list(lesson.FIXES)


def test_an_unknown_fix_fails_fast():
    backend = StimBackend(seed=1)
    with pytest.raises(ValueError):
        lesson.apply_pair_fix(backend, "y", 0, 0)
