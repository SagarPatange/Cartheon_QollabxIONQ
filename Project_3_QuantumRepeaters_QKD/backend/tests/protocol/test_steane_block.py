"""Level 3's Steane block: building |0̄⟩ CNOT by CNOT, and finding and fixing one error from its syndromes."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import steane, steane_block

ALL_HOLD = [1, 1, 1]
ALL_RANDOM = [0, 0, 0]
# Paper Fig. 3 (Paetznick–Reichardt), read off the figure: H on wires 2, 3 and 4, then these 8 CNOTs in order.
PAPER_ENCODER_HADAMARDS = [2, 3, 4]
PAPER_ENCODER_CNOTS = [(2, 1), (4, 6), (3, 7), (2, 5), (3, 1), (4, 7), (2, 6), (7, 5)]


def build(cnot_positions: list[tuple[int, int]]) -> steane_block.BuildReport:
    """Run Part A with a Stim backend, the way the server does."""
    return steane_block.run_build(StimBackend(seed=1), cnot_positions)


def binary_digits(position: int) -> list[int]:
    """A position as a 3-bit syndrome, most significant bit first: 6 → [1, 1, 0]."""
    return [(position >> shift) & 1 for shift in (2, 1, 0)]


def test_steane_py_encoder_gives_every_check_and_logical_z_and_passes_the_ancilla_check():
    report = build(steane.ENCODER_CNOT_POSITIONS)
    assert report.x_checks == ALL_HOLD
    assert report.z_checks == ALL_HOLD
    assert report.logical_z == 1
    assert report.is_encoded
    assert report.verification_bit == 0


def test_before_any_cnot_every_check_is_random():
    report = build([])
    assert report.x_checks == ALL_RANDOM
    assert report.z_checks == ALL_RANDOM
    assert report.logical_z == 0
    assert not report.is_encoded
    assert report.verification_bit is None


def test_spreading_q4_onto_5_6_7_makes_its_check_4567_hold():
    report = build([(4, 5), (4, 6), (4, 7)])
    assert report.x_checks == [1, 0, 0]


def test_the_order_of_one_qubits_cnots_does_not_matter():
    assert build([(4, 7), (4, 5), (4, 6)]) == build([(4, 5), (4, 6), (4, 7)])


def test_a_cnot_onto_the_wrong_qubit_leaves_the_check_random():
    report = build([(4, 3), (4, 6), (4, 7)])
    assert report.x_checks[0] == 0


def test_a_wrong_cnot_after_a_right_round_breaks_the_lit_check():
    right_rounds = list(steane.ENCODER_CNOT_POSITIONS[:3])
    assert build(right_rounds).x_checks[0] == 1
    assert build(right_rounds + [(4, 2)]).x_checks[0] == 1  # onto a qubit still in |+⟩: CNOT does nothing
    assert build(right_rounds + [(5, 3)]).x_checks[0] == 0


def test_checks_never_read_minus_one_with_only_h_and_cnot():
    rng = random.Random(5)
    for _ in range(50):
        cnots = []
        for _ in range(rng.randrange(1, 12)):
            control, target = rng.sample(steane_block.POSITIONS, 2)
            cnots.append((control, target))
        report = build(cnots)
        for expectation in report.x_checks + report.z_checks + [report.logical_z]:
            assert expectation in (0, 1)


def test_the_papers_8_cnot_encoder_makes_the_same_block():
    backend = StimBackend(seed=1)
    block = steane_block.BLOCK
    backend.reset(block + [steane_block.ANCILLA])
    backend.h([block[position - 1] for position in PAPER_ENCODER_HADAMARDS])
    for control, target in PAPER_ENCODER_CNOTS:
        backend.cnot([(block[control - 1], block[target - 1])])
    assert steane_block.peek_checks(backend, "X") == ALL_HOLD
    assert steane_block.peek_checks(backend, "Z") == ALL_HOLD
    assert backend.peek_pauli_expectation(dict.fromkeys(block, "Z")) == 1
    noiseless = steane_block.NOISELESS
    assert steane.measure_logical_z_check(backend, block, steane_block.ANCILLA, noiseless) == 0


@pytest.mark.parametrize("pauli", steane_block.PAULIS)
@pytest.mark.parametrize("position", steane_block.POSITIONS)
def test_the_syndromes_name_the_flipped_qubit_in_binary(pauli, position):
    error_round = steane_block.run_error_round(StimBackend, pauli, position, round_seed=3)
    sees_bit_flip = pauli in ("X", "Y")
    sees_phase_flip = pauli in ("Z", "Y")
    assert error_round.z_syndrome == (binary_digits(position) if sees_bit_flip else [0, 0, 0])
    assert error_round.x_syndrome == (binary_digits(position) if sees_phase_flip else [0, 0, 0])
    if sees_bit_flip:
        assert steane_block.read_syndrome_position(error_round.z_syndrome) == position


@pytest.mark.parametrize("pauli", steane_block.PAULIS)
@pytest.mark.parametrize("position", steane_block.POSITIONS)
def test_only_the_matching_fix_restores_the_block(pauli, position):
    error_round = steane_block.run_error_round(StimBackend, pauli, position, round_seed=4)
    assert len(error_round.fixes) == len(steane_block.PAULIS) * len(steane_block.POSITIONS)
    for fix_name, fix_result in error_round.fixes.items():
        is_matching_fix = fix_name == f"{pauli}{position}"
        assert fix_result.is_fixed == is_matching_fix, fix_name
    right_fix = error_round.fixes[f"{pauli}{position}"]
    assert right_fix.z_syndrome == [0, 0, 0]
    assert right_fix.x_syndrome == [0, 0, 0]
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
        build([(0, 2)])
    with pytest.raises(ValueError):
        steane_block.run_error_round(StimBackend, "W", 1, round_seed=1)
