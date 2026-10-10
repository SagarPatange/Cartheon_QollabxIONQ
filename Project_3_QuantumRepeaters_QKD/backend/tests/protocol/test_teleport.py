"""Level 2's teleportation: with the right fix Luigi reads what Mario sent; a wrong fix shows up as the wrong answer."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import teleport

SEED_COUNT = 40


def teleport_once(state: str, seed: int) -> teleport.TeleportResult:
    """Teleport one state with a Stim backend, the way the server does."""
    results = teleport.run_teleports(StimBackend, [state], random.Random(seed))
    return results[0]


@pytest.mark.parametrize("state", teleport.STATES)
def test_with_the_right_fix_luigi_always_reads_the_sent_state(state):
    for seed in range(SEED_COUNT):
        result = teleport_once(state, seed)
        right_fix = teleport.right_fix_for(result.bell_bits)
        assert result.luigi_reads[right_fix] == state


@pytest.mark.parametrize("state", teleport.STATES)
def test_every_fix_branch_is_reported(state):
    result = teleport_once(state, 1)
    assert list(result.luigi_reads) == list(teleport.FIXES)
    for answer in result.luigi_reads.values():
        assert answer in teleport.BASIS_ANSWERS[state]


def test_bell_bits_take_all_four_values_over_many_seeds():
    seen_bell_bits = set()
    for seed in range(SEED_COUNT):
        result = teleport_once("0", seed)
        seen_bell_bits.add((result.bell_bits.z_fix, result.bell_bits.x_fix))
    assert seen_bell_bits == {(0, 0), (0, 1), (1, 0), (1, 1)}


def test_every_branch_replays_the_same_bell_bits():
    for seed in range(SEED_COUNT):
        branch_seed = random.Random(seed).getrandbits(teleport.BRANCH_SEED_BITS)
        branch_bell_bits = []
        for fix in teleport.FIXES:
            bell_bits, _ = teleport.run_branch(StimBackend(branch_seed), "+", fix)
            branch_bell_bits.append(bell_bits)
        assert len(set(branch_bell_bits)) == 1


def test_the_same_seed_gives_the_same_results():
    states = ["1", "+", "0", "-"]
    first_run = teleport.run_teleports(StimBackend, states, random.Random(7))
    second_run = teleport.run_teleports(StimBackend, states, random.Random(7))
    assert first_run == second_run


def find_seed_with_bell_bits(state: str, z_fix: int, x_fix: int) -> teleport.TeleportResult:
    """Search seeds until the Bell measurement gives the wanted bits."""
    for seed in range(1000):
        result = teleport_once(state, seed)
        if result.bell_bits == teleport.BellBits(z_fix=z_fix, x_fix=x_fix):
            return result
    raise AssertionError(f"no seed gave z_fix={z_fix}, x_fix={x_fix}")


def test_skipping_the_needed_x_on_one_gives_zero():
    result = find_seed_with_bell_bits("1", z_fix=0, x_fix=1)
    assert result.luigi_reads["none"] == "0"
    assert result.luigi_reads["z"] == "0"
    assert result.luigi_reads["x"] == "1"


def test_skipping_the_needed_z_on_plus_gives_minus():
    result = find_seed_with_bell_bits("+", z_fix=1, x_fix=0)
    assert result.luigi_reads["none"] == "-"
    assert result.luigi_reads["x"] == "-"
    assert result.luigi_reads["z"] == "+"


def test_right_fix_names_follow_the_bell_bits():
    assert teleport.right_fix_for(teleport.BellBits(z_fix=0, x_fix=0)) == "none"
    assert teleport.right_fix_for(teleport.BellBits(z_fix=0, x_fix=1)) == "x"
    assert teleport.right_fix_for(teleport.BellBits(z_fix=1, x_fix=0)) == "z"
    assert teleport.right_fix_for(teleport.BellBits(z_fix=1, x_fix=1)) == "zx"


def test_prepare_and_read_round_trip_each_state_without_teleporting():
    for state in teleport.STATES:
        backend = StimBackend(0)
        teleport.prepare_state(backend, teleport.MESSAGE_QUBIT, state)
        assert teleport.read_in_state_basis(backend, teleport.MESSAGE_QUBIT, state) == state


def test_an_unknown_state_or_fix_is_rejected():
    with pytest.raises(ValueError, match="state"):
        teleport.run_teleports(StimBackend, ["2"], random.Random(0))
    with pytest.raises(ValueError, match="fix"):
        teleport.run_branch(StimBackend(0), "0", "y")
