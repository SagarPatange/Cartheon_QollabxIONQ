"""Results table 1 of QOLLAB_README.md: the repeater circuit with 3-qubit blocks against 1-qubit blocks under noise.

Needs Qiskit Aer (not part of the game). From the project folder:
    python tools/results_repeater_noise.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "src"))
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, depolarizing_error, ReadoutError
import quantum_bros.protocol.qpu_repeater as q

def encode_any(circuit, control, target):
    circuit.h(control[0])
    for i in range(1, q.QUBITS_PER_BLOCK):
        circuit.cx(control[0], control[i])
    for i in range(q.QUBITS_PER_BLOCK):
        circuit.cx(control[i], target[i])
# The module is written for 3-qubit blocks; these two make it work for any block size, so 1 gives the unencoded chain.
q._encode_bell_pair = encode_any
q._majority = lambda bits: int(2 * sum(bits) > len(bits))

def noise(p):
    m = NoiseModel()
    m.add_all_qubit_quantum_error(depolarizing_error(p, 2), ["cx"])
    m.add_all_qubit_quantum_error(depolarizing_error(p / 10, 1), ["h", "s", "sdg", "t", "tdg"])
    m.add_all_qubit_readout_error(ReadoutError([[1 - p, p], [p, 1 - p]]))
    return m

print("p      n  ZZ      XX      F>=")
for p in [0.0, 0.002, 0.005, 0.01, 0.02, 0.05]:
    for n in (1, 3):
        q.QUBITS_PER_BLOCK = n
        r = q.run_qpu_repeater(AerSimulator(noise_model=noise(p), seed_simulator=7), shots=40000)
        print(f"{p:<6} {n}  {r['zz_correlation']:.4f}  {r['xx_correlation']:.4f}  {r['fidelity_lower_bound']:.4f}  qubits={r['qubits']}")
