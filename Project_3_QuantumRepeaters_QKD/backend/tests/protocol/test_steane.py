"""Steane encoder, logical gates and the classical decoder."""

import pytest
import stim

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import steane
from quantum_bros.protocol.noise import NoiseModel

BLOCK = list(range(steane.QUBITS_PER_BLOCK))
ANCILLA = steane.QUBITS_PER_BLOCK
NOISELESS = NoiseModel()
MAX_ATTEMPTS = 5


def make_stabilizer_strings() -> list[str]:
    """The six Steane stabilizers as Pauli strings, one X and one Z per row of the parity-check matrix."""
    stabilizer_strings = []
    for pauli_letter in ["X", "Z"]:
        for parity_check_row in steane.PARITY_CHECK_ROWS:
            letters = []
            for entry in parity_check_row:
                letters.append(pauli_letter if entry == 1 else "_")
            stabilizer_strings.append("".join(letters) + "_")
    return stabilizer_strings


def test_the_encoder_gives_a_plus_one_eigenstate_of_every_stabilizer_and_of_logical_z():
    backend = StimBackend(seed=1)
    attempt_count = steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
    assert attempt_count == 1
    for stabilizer_string in make_stabilizer_strings():
        assert backend.simulator.peek_observable_expectation(stim.PauliString(stabilizer_string)) == 1
    assert backend.simulator.peek_observable_expectation(stim.PauliString("ZZZZZZZ_")) == 1


def test_logical_plus_is_a_plus_one_eigenstate_of_logical_x():
    backend = StimBackend(seed=2)
    steane.encode_logical_plus(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
    assert backend.simulator.peek_observable_expectation(stim.PauliString("XXXXXXX_")) == 1


@pytest.mark.parametrize("basis", steane.BASES)
def test_logical_x_flips_the_measured_bit_in_z_and_logical_z_in_x(basis):
    backend = StimBackend(seed=3)
    steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
    if basis == steane.X_BASIS:
        steane.apply_transversal_h(backend, BLOCK, NOISELESS)
        steane.apply_logical_z(backend, BLOCK)
    else:
        steane.apply_logical_x(backend, BLOCK)
    result = steane.measure_logical(backend, BLOCK, basis, NOISELESS)
    assert result == steane.LogicalMeasurement(logical_bit=1, was_corrected=False)


@pytest.mark.parametrize("flipped_position", range(1, steane.QUBITS_PER_BLOCK + 1))
def test_every_single_x_error_is_corrected(flipped_position):
    backend = StimBackend(seed=4)
    steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
    backend.x([BLOCK[flipped_position - 1]])
    result = steane.measure_logical(backend, BLOCK, steane.Z_BASIS, NOISELESS)
    assert result == steane.LogicalMeasurement(logical_bit=0, was_corrected=True)


def test_the_syndrome_names_the_flipped_position():
    measured_bits = [0, 0, 0, 0, 1, 0, 0]
    assert steane.find_error_position(steane.compute_syndrome(measured_bits)) == 5


def test_decoding_a_codeword_with_one_flip_returns_its_parity():
    odd_codeword = [1, 1, 1, 0, 0, 0, 0]
    assert steane.decode_block(odd_codeword) == steane.LogicalMeasurement(logical_bit=1, was_corrected=False)
    flipped_codeword = [1, 1, 1, 0, 0, 0, 1]
    assert steane.decode_block(flipped_codeword) == steane.LogicalMeasurement(logical_bit=1, was_corrected=True)


def test_a_wrong_block_size_or_basis_fails_fast():
    backend = StimBackend(seed=5)
    with pytest.raises(ValueError):
        steane.compute_syndrome([0, 1])
    with pytest.raises(ValueError):
        steane.measure_logical(backend, BLOCK, "Y", NOISELESS)


def test_encoding_gives_up_after_max_attempts_when_every_check_fails():
    class AlwaysOneBackend(StimBackend):
        """Reports 1 for every measurement, so verification never accepts."""

        def measure(self, qubits):
            return [1] * len(qubits)

    with pytest.raises(steane.EncodingFailedError):
        steane.encode_logical_zero(AlwaysOneBackend(seed=6), BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
