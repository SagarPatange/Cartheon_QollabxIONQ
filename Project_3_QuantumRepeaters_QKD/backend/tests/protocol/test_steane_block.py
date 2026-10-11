"""Level 3's Steane block: building one with the Error Correction Zoo's encoder CNOT by CNOT, and finding and fixing
one error from its syndromes."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import steane, steane_block

ALL_HOLD = [1, 1, 1]
ALL_RANDOM = [0, 0, 0]
# The Error Correction Zoo's Steane encoder (errorcorrectionzoo.org/c/steane), read off its figure, in order.
ZOO_CNOTS = [(0, 1), (0, 2), (6, 0), (6, 1), (6, 3), (5, 0), (5, 2), (5, 3), (4, 1), (4, 2), (4, 3)]
# Paper Fig. 3 (Paetznick–Reichardt), read off the figure: H on wires 2, 3 and 4, then these 8 CNOTs in order, in
# the textbook layout of steane.py (1-based wires).
PAPER_ENCODER_HADAMARDS = [2, 3, 4]
PAPER_ENCODER_CNOTS = [(2, 1), (4, 6), (3, 7), (2, 5), (3, 1), (4, 7), (2, 6), (7, 5)]


def build(cnot_positions: list[tuple[int, int]]) -> steane_block.BuildReport:
    """Run Part A with a Stim backend, the way the server does."""
    return steane_block.run_build(StimBackend(seed=1), cnot_positions)


def test_the_circles_are_the_zoo_codes_three_checks():
    assert steane_block.CHECK_POSITIONS == ([0, 1, 3, 6], [0, 2, 3, 5], [1, 2, 3, 4])
    assert steane_block.HADAMARD_POSITIONS == (4, 5, 6)
    assert steane_block.LOGICAL_Z_POSITIONS == (0, 1, 2)


def test_the_zoo_encoder_gives_every_check_and_logical_z_and_passes_the_ancilla_check():
    report = build(ZOO_CNOTS)
    assert report.x_checks == ALL_HOLD
    assert report.z_checks == ALL_HOLD
    assert report.logical_z == 1
    assert report.is_encoded
    assert report.verification_bit == 0


def test_the_encoder_carries_psi_into_the_block_so_one_encodes_to_logical_one():
    backend = StimBackend(seed=1)
    backend.reset(steane_block.BLOCK + [steane_block.ANCILLA])
    backend.x([steane_block.BLOCK[steane_block.DATA_POSITION]])
    steane_block.run_encoder(backend)
    logical_z = dict.fromkeys(steane_block.qubits_at_positions(steane_block.LOGICAL_Z_POSITIONS), "Z")
    assert backend.peek_pauli_expectation(logical_z) == -1
    assert steane_block.peek_checks(backend, "X") == ALL_HOLD


def test_before_any_cnot_no_circle_holds_and_the_block_is_not_encoded():
    report = build([])
    assert report.x_checks == ALL_RANDOM
    assert report.z_checks == ALL_RANDOM
    assert not report.is_encoded
    assert report.verification_bit is None


def test_copying_psi_while_it_is_zero_changes_no_reading():
    assert build([(0, 1), (0, 2)]) == build([])


def test_each_hadamard_qubits_round_makes_its_own_circle_hold():
    assert build(ZOO_CNOTS[:5]).x_checks == [1, 0, 0]
    assert build(ZOO_CNOTS[:8]).x_checks == [1, 1, 0]


def test_a_cnot_onto_the_wrong_qubit_leaves_its_circle_random():
    assert build([(0, 1), (0, 2), (6, 0), (6, 1), (6, 2)]).x_checks[0] == 0


def test_checks_never_read_minus_one_with_only_h_and_cnot():
    rng = random.Random(5)
    for _ in range(50):
        cnots = []
        for _ in range(rng.randrange(1, 14)):
            control, target = rng.sample(steane_block.POSITIONS, 2)
            cnots.append((control, target))
        report = build(cnots)
        for expectation in report.x_checks + report.z_checks + [report.logical_z]:
            assert expectation in (0, 1)


def test_the_papers_8_cnot_encoder_makes_the_textbook_block():
    backend = StimBackend(seed=1)
    block = steane_block.BLOCK
    backend.reset(block + [steane_block.ANCILLA])
    backend.h([block[position - 1] for position in PAPER_ENCODER_HADAMARDS])
    for control, target in PAPER_ENCODER_CNOTS:
        backend.cnot([(block[control - 1], block[target - 1])])
    for check_positions in steane_block.list_check_positions():
        for letter in ("X", "Z"):
            check = dict.fromkeys([block[position - 1] for position in check_positions], letter)
            assert backend.peek_pauli_expectation(check) == 1
    assert backend.peek_pauli_expectation(dict.fromkeys(block, "Z")) == 1
    noiseless = steane_block.NOISELESS
    assert steane.measure_logical_z_check(backend, block, steane_block.ANCILLA, noiseless) == 0


@pytest.mark.parametrize("pauli", steane_block.PAULIS)
@pytest.mark.parametrize("position", steane_block.POSITIONS)
def test_the_syndrome_fires_exactly_the_circles_that_hold_the_flipped_qubit(pauli, position):
    error_round = steane_block.run_error_round(StimBackend, pauli, position, round_seed=3)
    circles_holding = [int(position in check) for check in steane_block.CHECK_POSITIONS]
    sees_bit_flip = pauli in ("X", "Y")
    sees_phase_flip = pauli in ("Z", "Y")
    assert error_round.z_syndrome == (circles_holding if sees_bit_flip else ALL_RANDOM)
    assert error_round.x_syndrome == (circles_holding if sees_phase_flip else ALL_RANDOM)
    assert steane_block.find_flipped_position(circles_holding) == position


def test_no_fired_circle_names_no_qubit():
    assert steane_block.find_flipped_position([0, 0, 0]) is None


@pytest.mark.parametrize("pauli", steane_block.PAULIS)
@pytest.mark.parametrize("position", steane_block.POSITIONS)
def test_only_the_matching_fix_restores_the_block(pauli, position):
    error_round = steane_block.run_error_round(StimBackend, pauli, position, round_seed=4)
    assert len(error_round.fixes) == len(steane_block.PAULIS) * len(steane_block.POSITIONS)
    for fix_name, fix_result in error_round.fixes.items():
        is_matching_fix = fix_name == f"{pauli}{position}"
        assert fix_result.is_fixed == is_matching_fix, fix_name
    right_fix = error_round.fixes[f"{pauli}{position}"]
    assert right_fix.z_syndrome == ALL_RANDOM
    assert right_fix.x_syndrome == ALL_RANDOM
    assert right_fix.logical_bit == 0


def test_the_rounds_go_x_then_z_then_y_on_three_different_qubits_and_repeat_with_the_same_seed():
    first_rounds = steane_block.run_error_rounds(StimBackend, random.Random(9))
    second_rounds = steane_block.run_error_rounds(StimBackend, random.Random(9))
    assert [error_round.pauli for error_round in first_rounds] == ["X", "Z", "Y"]
    assert first_rounds == second_rounds
    for seed in range(30):
        rounds = steane_block.run_error_rounds(StimBackend, random.Random(seed))
        assert len({error_round.position for error_round in rounds}) == len(rounds)


def test_a_bad_cnot_or_pauli_fails_fast():
    with pytest.raises(ValueError):
        build([(3, 3)])
    with pytest.raises(ValueError):
        build([(7, 2)])
    with pytest.raises(ValueError):
        build([(-1, 2)])
    with pytest.raises(ValueError):
        steane_block.run_error_round(StimBackend, "W", 1, round_seed=1)
