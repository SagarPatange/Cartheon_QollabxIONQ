"""The one-job QPU repeater circuit: noiseless it gives ⟨Z̄Z̄⟩ = ⟨X̄X̄⟩ = 1 after the classical Pauli frame, fits in 13
qubits without feed-forward, submits exactly one job, splits shots between the two readout bases, and every swap
outcome occurs."""

import json

import pytest
from qiskit import QuantumCircuit
from qiskit.providers.basic_provider import BasicSimulator
from qiskit.quantum_info import Operator

from quantum_bros.protocol import qpu_repeater

SHOTS = 1000


class CountingBackend:
    """Wraps a simulator and counts run() calls, standing in for the platform's injected `backend`."""

    def __init__(self, inner):
        self.inner = inner
        self.run_calls = 0
        self.name = getattr(inner, "name", "stub")

    def __getattr__(self, attribute):
        return getattr(self.inner, attribute)

    def run(self, circuits, **options):
        self.run_calls += 1
        assert isinstance(circuits, qpu_repeater.QuantumCircuit), "IonQ accepts one circuit per job, not a list"
        return self.inner.run(circuits, **options)


def simulators():
    backends = [pytest.param(BasicSimulator, id="basic")]
    try:
        from qiskit_aer import AerSimulator

        backends.append(pytest.param(AerSimulator, id="aer"))
    except ImportError:
        pass
    return backends


@pytest.fixture(scope="module", params=simulators())
def run_result(request):
    backend = CountingBackend(request.param())
    return backend, qpu_repeater.run_qpu_repeater(backend, shots=SHOTS)


def test_noiseless_chain_is_a_perfect_bell_pair(run_result):
    _, report = run_result
    assert report["zz_correlation"] == 1.0
    assert report["xx_correlation"] == 1.0
    assert report["fidelity_lower_bound"] == 1.0
    assert report["shots"] == SHOTS
    assert report["qubits"] == 13


def test_shots_split_between_bases(run_result):
    _, report = run_result
    per_basis = report["shots_per_basis"]
    assert set(per_basis) == {"Z", "X"}
    assert sum(per_basis.values()) == SHOTS
    assert 350 < per_basis["Z"] < 650


def test_exactly_one_job(run_result):
    backend, _ = run_result
    assert backend.run_calls == 1


def test_all_four_swap_outcomes_appear(run_result):
    _, report = run_result
    outcomes = report["swap_outcome_counts"]
    assert set(outcomes) == {"0,0", "0,1", "1,0", "1,1"}
    assert all(fraction > 0 for fraction in outcomes.values())
    assert sum(outcomes.values()) == pytest.approx(1.0)


def test_report_is_json_serialisable(run_result):
    _, report = run_result
    json.dumps(report)
    assert report["backend_name"]
    assert report["explanation"]


def test_circuit_fits_ionq_without_feed_forward():
    circuit = qpu_repeater.build_repeater_circuit()
    assert circuit.num_qubits == 13
    operations = {instruction.operation.name for instruction in circuit.data}
    assert operations <= {"h", "cx", "s", "sdg", "t", "tdg", "measure", "barrier"}
    assert "if_else" not in operations
    assert all(getattr(instruction.operation, "condition", None) is None for instruction in circuit.data)


def test_controlled_h_decomposition_is_exact():
    built = QuantumCircuit(2)
    qpu_repeater._controlled_h(built, 0, 1)
    reference = QuantumCircuit(2)
    reference.ch(0, 1)
    assert Operator(built).equiv(Operator(reference))
