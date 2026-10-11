"""QiskitStabilizerBackend behind the QuantumBackend interface, and the protocols running on it.

The protocol checks mirror tests/protocol: the physics must not depend on which simulator is behind the interface.
"""

import random

import pytest

from quantum_bros.backends.qiskit_backend import QiskitStabilizerBackend
from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import logical_link, qkd, qre_cec, repetition_code, steane, teleport
from quantum_bros.protocol.network import QuantumNetwork
from quantum_bros.protocol.noise import NoiseModel

NOISELESS = NoiseModel()
BLOCK = list(range(steane.QUBITS_PER_BLOCK))
ANCILLA = steane.QUBITS_PER_BLOCK
MAX_ATTEMPTS = 5


def make_bell_pair(seed: int) -> QiskitStabilizerBackend:
    """Qubits 0 and 1 in Φ⁺."""
    backend = QiskitStabilizerBackend(seed)
    backend.h([0])
    backend.cnot([(0, 1)])
    return backend


def test_a_bell_pair_measures_equal_bits_and_both_values_show_up():
    first_bits = set()
    for seed in range(30):
        first_bit, second_bit = make_bell_pair(seed).measure([0, 1])
        assert first_bit == second_bit
        first_bits.add(first_bit)
    assert first_bits == {0, 1}


def test_reset_of_an_entangled_qubit_gives_zero_and_leaves_the_partner_unentangled():
    for seed in range(20):
        backend = make_bell_pair(seed)
        backend.reset([0])
        assert backend.peek_pauli_expectation({0: "Z"}) == 1
        assert backend.peek_pauli_expectation({0: "Z", 1: "Z"}) in (1, -1)
        assert backend.peek_pauli_expectation({0: "X", 1: "X"}) == 0
        assert backend.measure([0]) == [0]


def test_the_same_seed_gives_the_same_outcomes():
    outcomes_per_run = []
    for _ in range(2):
        backend = QiskitStabilizerBackend(seed=42)
        backend.h(list(range(16)))
        backend.depolarize1(list(range(16)), 0.3)
        outcomes_per_run.append(backend.measure(list(range(16))))
    assert outcomes_per_run[0] == outcomes_per_run[1]
    assert set(outcomes_per_run[0]) == {0, 1}


def test_peeking_a_bell_pair_gives_plus_one_for_xx_and_zz_and_zero_for_one_qubit():
    backend = make_bell_pair(seed=1)
    assert backend.peek_pauli_expectation({0: "X", 1: "X"}) == 1
    assert backend.peek_pauli_expectation({0: "Z", 1: "Z"}) == 1
    assert backend.peek_pauli_expectation({0: "Y", 1: "Y"}) == -1
    assert backend.peek_pauli_expectation({0: "Z"}) == 0


def test_peeking_zero_gives_one_for_z_and_zero_for_x_and_leaves_the_state_alone():
    backend = QiskitStabilizerBackend(seed=2)
    backend.reset([0])
    assert backend.peek_pauli_expectation({0: "Z"}) == 1
    assert backend.peek_pauli_expectation({0: "X"}) == 0
    backend.x([0])
    assert backend.peek_pauli_expectation({0: "Z"}) == -1
    backend.h([0])
    for _ in range(5):
        assert backend.peek_pauli_expectation({0: "Z"}) == 0
    assert backend.peek_pauli_expectation({0: "X"}) == -1


def test_zero_probability_noise_is_a_no_op():
    backend = make_bell_pair(seed=3)
    rng_state = backend.rng.getstate()
    tableau_before = backend.clifford.tableau.copy()
    backend.depolarize1([0, 1], 0)
    backend.depolarize2([(0, 1)], 0)
    backend.x_error([0, 1], 0)
    assert (backend.clifford.tableau == tableau_before).all()
    assert backend.rng.getstate() == rng_state


def test_certain_x_error_flips_and_large_indices_grow_the_tableau():
    backend = QiskitStabilizerBackend(seed=4)
    backend.x_error([90], 1)
    assert backend.num_qubits > 90
    assert backend.measure([90, 3]) == [1, 0]


def test_random_clifford_circuits_agree_with_stim():
    """Peeked Pauli expectations after random gates and measurements must match Stim. Stim is post-selected onto
    each outcome Qiskit drew, so both simulators follow the same branch; post-selection raises if that outcome was
    impossible, which would mean Qiskit measured something Stim considers forbidden."""
    qubit_count = 6
    for circuit_seed in range(15):
        circuit_rng = random.Random(circuit_seed)
        stim_backend = StimBackend(circuit_seed)
        qiskit_backend = QiskitStabilizerBackend(circuit_seed)
        for _ in range(40):
            gate = circuit_rng.choice(["h", "x", "z", "cnot", "measure", "reset"])
            first, second = circuit_rng.sample(range(qubit_count), 2)
            if gate == "cnot":
                stim_backend.cnot([(first, second)])
                qiskit_backend.cnot([(first, second)])
            elif gate in ("measure", "reset"):
                # A reset is a measurement plus a flip back to 0, so it is synchronised the same way.
                qiskit_bit = qiskit_backend.measure([first])[0]
                stim_backend.simulator.postselect_z(first, desired_value=bool(qiskit_bit))
                if gate == "reset" and qiskit_bit:
                    qiskit_backend.x([first])
                    stim_backend.x([first])
            else:
                getattr(stim_backend, gate)([first])
                getattr(qiskit_backend, gate)([first])
            for pauli_letters in ["XX", "ZZ", "XZ", "YY", "ZX", "Z_", "X_"]:
                paulis = {first: pauli_letters[0]}
                if pauli_letters[1] != "_":
                    paulis[second] = pauli_letters[1]
                assert qiskit_backend.peek_pauli_expectation(paulis) == stim_backend.peek_pauli_expectation(paulis)


# The protocols, run on Qiskit: the same physical facts tests/protocol checks with Stim.


def make_steane_stabilizers() -> list[dict[int, str]]:
    """The six Steane stabilizers on BLOCK, one X and one Z per row of the parity-check matrix."""
    stabilizers = []
    for pauli_letter in ["X", "Z"]:
        for parity_check_row in steane.PARITY_CHECK_ROWS:
            stabilizers.append({BLOCK[i]: pauli_letter for i, entry in enumerate(parity_check_row) if entry == 1})
    return stabilizers


def test_steane_encoder_gives_a_plus_one_eigenstate_of_every_stabilizer_and_of_logical_z():
    backend = QiskitStabilizerBackend(seed=1)
    assert steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS) == 1
    for stabilizer in make_steane_stabilizers():
        assert backend.peek_pauli_expectation(stabilizer) == 1
    assert backend.peek_pauli_expectation({qubit: "Z" for qubit in BLOCK}) == 1


@pytest.mark.parametrize("flipped_position", range(1, steane.QUBITS_PER_BLOCK + 1))
def test_steane_corrects_every_single_x_error(flipped_position):
    backend = QiskitStabilizerBackend(seed=4)
    steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
    backend.x([BLOCK[flipped_position - 1]])
    result = steane.measure_logical(backend, BLOCK, steane.Z_BASIS, NOISELESS)
    assert result == steane.LogicalMeasurement(logical_bit=0, was_corrected=True)


@pytest.mark.parametrize("basis", steane.BASES)
def test_steane_logical_x_flips_z_and_logical_z_flips_x(basis):
    backend = QiskitStabilizerBackend(seed=3)
    steane.encode_logical_zero(backend, BLOCK, ANCILLA, NOISELESS, MAX_ATTEMPTS)
    if basis == steane.X_BASIS:
        steane.apply_transversal_h(backend, BLOCK, NOISELESS)
        steane.apply_logical_z(backend, BLOCK)
    else:
        steane.apply_logical_x(backend, BLOCK)
    result = steane.measure_logical(backend, BLOCK, basis, NOISELESS)
    assert result == steane.LogicalMeasurement(logical_bit=1, was_corrected=False)


@pytest.mark.parametrize("basis", repetition_code.BASES)
def test_qre_cec_noiseless_pairs_give_equal_bits_in_both_bases(basis):
    backend = QiskitStabilizerBackend(seed=7)
    layout = qre_cec.QubitLayout()
    rng = random.Random(7)
    alice_bits = []
    for _ in range(12):
        qre_cec.distribute_logical_pair(backend, layout, NOISELESS, rng, 0)
        alice_bit = repetition_code.measure_logical(backend, layout.alice_block, basis, NOISELESS).logical_bit
        david_bit = repetition_code.measure_logical(backend, layout.david_block, basis, NOISELESS).logical_bit
        assert alice_bit == david_bit
        alice_bits.append(alice_bit)
    assert set(alice_bits) == {0, 1}


@pytest.mark.parametrize("state", teleport.STATES)
def test_teleport_with_the_right_fix_reads_the_sent_state(state):
    for seed in range(15):
        result = teleport.run_teleports(QiskitStabilizerBackend, [state], random.Random(seed))[0]
        assert result.luigi_reads[teleport.right_fix_for(result.bell_bits)] == state


def test_logical_link_noiseless_runs_give_equal_logical_bits():
    for seed in range(8):
        report = logical_link.run_logical_link(QiskitStabilizerBackend(seed), NOISELESS, random.Random(seed))
        assert report.alice_check.logical_bit == report.bob_check.logical_bit
        assert not report.alice_check.was_corrected


def test_noiseless_qkd_gives_identical_keys_and_zero_qber():
    network = QuantumNetwork(backend=QiskitStabilizerBackend(1), noise=NOISELESS, rng=random.Random(1), tap_fraction=0)
    report = qkd.run_qkd(network, 16)
    assert report.qber == 0
    assert not report.is_aborted
    assert report.alice_key == report.david_key
