"""The repetition-code repeater chain (QRECEC_3QubitRepetition.ipynb) as ONE Qiskit circuit for a real QPU via Qollab.

Chain Alice ─ Bob ─ David: link 1 holds the encoded Bell pair a–d, link 2 holds a2–d2, and Bob joins them with a
logical Bell measurement on d and a2. Every block is the 3-qubit repetition code: α|0⟩ + β|1⟩ → α|000⟩ + β|111⟩,
logical X̄ = XXX, logical Z̄ = Z on any one qubit.

Hardware and platform constraints (RULES.md Part A) shape the circuit:

- IonQ takes one job holding one QuantumCircuit, so the Z-basis and the X-basis readout of the end pair cannot be
  two circuits. Two side-by-side copies would need 24 qubits, too many for Qollab's in-browser statevector
  simulator. Instead one extra "basis" qubit is put in |+⟩ and controls a Hadamard on each of the 6 end-block qubits
  (a and d2) just before they are measured: a shot with basis bit 0 reads the end pair in Z, one with basis bit 1
  reads it in X. That is 12 + 1 = 13 qubits. The shots are split by the basis bit afterwards.
- The controlled-H is written with basic gates only (s, h, t, cx, tdg, sdg), Qiskit's own CH decomposition.
- No mid-circuit feed-forward (no if_test / c_if), so the Pauli frame X̄^{m_z} Z̄^{m_x} on David's d2 is applied
  classically after the run: X̄ flips d2's Z-basis logical bit, Z̄ flips its X-basis logical parity. This is exactly
  equivalent, because the frame is a Pauli that commutes with the final measurement up to that bit flip.
- The physical Bell-pair blocks b, c (and b2, c2) are dropped. The notebook's Step 5 shows that after the teleported
  CNOT they are disentangled (purity 1) and that a–d is left in the same state as a direct transversal CNOT a → d.
  So each link is prepared directly: a = |+̄⟩, d = |0̄⟩, then CNOT a[i] → d[i] on each row.

Decoding: end-block Z-basis bits by majority vote (corrects one bit flip), X-basis logical bits by the parity of the
3 bits (no correction possible); swap bits m_x = parity of d's X bits, m_z = majority of a2's Z bits.
"""

from collections import Counter

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile

# Qubits per repetition-code block; the chain has 4 blocks, plus the one basis qubit.
QUBITS_PER_BLOCK = 3
CIRCUIT_QUBITS = 4 * QUBITS_PER_BLOCK + 1

# Basis bit → basis the end blocks a and d2 are read in.
END_BASES = {0: "Z", 1: "X"}

EXPLANATION = (
    "Two repetition-encoded Bell pairs were joined by Bob's logical Bell measurement on the QPU, and after the "
    "classical Pauli-frame fix the Alice–David pair shows ⟨Z̄Z̄⟩ and ⟨X̄X̄⟩ correlations whose average lower-bounds "
    "its fidelity with the ideal entangled state."
)


def _majority(bits: list[int]) -> int:
    """Logical Z-basis bit of a repetition codeword: the majority, which corrects one bit flip."""
    return int(sum(bits) >= 2)


def _parity(bits: list[int]) -> int:
    """Logical X-basis bit of a repetition codeword: X̄ = XXX, so the parity of all three X-basis bits."""
    return sum(bits) % 2


def _encode_bell_pair(circuit: QuantumCircuit, control: QuantumRegister, target: QuantumRegister) -> None:
    """Encoded Φ̄⁺ on two blocks: control = |+̄⟩, target = |0̄⟩, then transversal CNOT control → target."""
    circuit.h(control[0])
    circuit.cx(control[0], control[1])
    circuit.cx(control[0], control[2])
    for i in range(QUBITS_PER_BLOCK):
        circuit.cx(control[i], target[i])


def _controlled_h(circuit: QuantumCircuit, control, target) -> None:
    """CH from basic gates (Qiskit's CH definition): S·H·T on the target, CX, then T†·H·S†."""
    circuit.s(target)
    circuit.h(target)
    circuit.t(target)
    circuit.cx(control, target)
    circuit.tdg(target)
    circuit.h(target)
    circuit.sdg(target)


def build_repeater_circuit() -> QuantumCircuit:
    """The 13-qubit chain with all measurements. Classical registers: ``end_a``, ``end_d2`` (end blocks, in Z or X
    as the basis bit says), ``swap_dx`` (d in X), ``swap_a2z`` (a2 in Z), ``basis`` (0 → Z readout, 1 → X)."""
    a, d, a2, d2 = (QuantumRegister(QUBITS_PER_BLOCK, name) for name in ("a", "d", "a2", "d2"))
    basis_qubit = QuantumRegister(1, "basis_q")
    end_a, end_d2, swap_dx, swap_a2z = (
        ClassicalRegister(QUBITS_PER_BLOCK, name) for name in ("end_a", "end_d2", "swap_dx", "swap_a2z")
    )
    basis = ClassicalRegister(1, "basis")
    circuit = QuantumCircuit(a, d, a2, d2, basis_qubit, end_a, end_d2, swap_dx, swap_a2z, basis)
    circuit.name = "qrecec_repetition_repeater"

    _encode_bell_pair(circuit, a, d)  # link 1: Alice–Bob
    _encode_bell_pair(circuit, a2, d2)  # link 2: Bob–David
    circuit.barrier()

    # Bob's logical Bell measurement: transversal CNOT d → a2, d in X, a2 in Z.
    for i in range(QUBITS_PER_BLOCK):
        circuit.cx(d[i], a2[i])
    circuit.h(d)
    circuit.measure(d, swap_dx)
    circuit.measure(a2, swap_a2z)

    # Random readout basis for the end pair: H on all 6 end qubits exactly when the basis qubit is 1.
    circuit.h(basis_qubit[0])
    for qubit in (*a, *d2):
        _controlled_h(circuit, basis_qubit[0], qubit)
    circuit.measure(basis_qubit, basis)
    circuit.measure(a, end_a)
    circuit.measure(d2, end_d2)
    return circuit


def _split_key(key: str, register_names: list[str]) -> dict[str, list[int]]:
    """Qiskit count key → bits per register, bit 0 first. Keys list registers in reverse order, space separated, and
    each register's string is printed with bit 0 rightmost."""
    parts = key.split()
    if len(parts) != len(register_names):
        raise ValueError(f"count key {key!r} does not match registers {register_names}")
    return {
        name: [int(bit) for bit in reversed(part)] for name, part in zip(reversed(register_names), parts, strict=True)
    }


def run_qpu_repeater(qpu_backend, shots: int = 1000) -> dict:
    """Run the chain on ``qpu_backend`` (the platform's global ``backend``) in exactly one job and decode it.

    Returns a JSON-serialisable dict: qubits, shots, shots_per_basis ({"Z": n0, "X": n1}, split by the basis bit),
    zz_correlation (⟨Z̄Z̄⟩ on a–d2 from basis-0 shots, after the frame), xx_correlation (⟨X̄X̄⟩ from basis-1 shots,
    after the frame), fidelity_lower_bound ((⟨X̄X̄⟩ + ⟨Z̄Z̄⟩)/2, a witness lower bound on the fidelity with Φ̄⁺, not
    the fidelity itself), swap_outcome_counts (fractions of the four (m_x, m_z) outcomes, keyed "m_x,m_z"),
    backend_name, explanation.
    """
    circuit = build_repeater_circuit()
    register_names = [register.name for register in circuit.cregs]
    job = qpu_backend.run(transpile(circuit, qpu_backend, optimization_level=1), shots=shots)
    counts = job.result().get_counts()

    correlation_sums = {basis: 0 for basis in END_BASES.values()}
    shots_per_basis = {basis: 0 for basis in END_BASES.values()}
    swap_outcomes: Counter[str] = Counter()
    for key, count in counts.items():
        bits = _split_key(key, register_names)
        basis = END_BASES[bits["basis"][0]]
        shots_per_basis[basis] += count
        m_x = _parity(bits["swap_dx"])
        m_z = _majority(bits["swap_a2z"])
        swap_outcomes[f"{m_x},{m_z}"] += count
        if basis == "Z":
            alice = _majority(bits["end_a"])
            david = _majority(bits["end_d2"]) ^ m_z  # X̄^{m_z} flips the Z-basis bit
        else:
            alice = _parity(bits["end_a"])
            david = _parity(bits["end_d2"]) ^ m_x  # Z̄^{m_x} flips the X-basis bit
        correlation_sums[basis] += count * (1 - 2 * (alice ^ david))

    total_shots = sum(shots_per_basis.values())
    zz = correlation_sums["Z"] / shots_per_basis["Z"] if shots_per_basis["Z"] else 0.0
    xx = correlation_sums["X"] / shots_per_basis["X"] if shots_per_basis["X"] else 0.0
    backend_name = getattr(qpu_backend, "name", None)
    if callable(backend_name):
        backend_name = backend_name()
    return {
        "qubits": circuit.num_qubits,
        "shots": total_shots,
        "shots_per_basis": shots_per_basis,
        "zz_correlation": zz,
        "xx_correlation": xx,
        "fidelity_lower_bound": (xx + zz) / 2,
        "swap_outcome_counts": {
            outcome: swap_outcomes[outcome] / total_shots for outcome in ("0,0", "0,1", "1,0", "1,1")
        },
        "backend_name": str(backend_name) if backend_name is not None else str(qpu_backend),
        "explanation": EXPLANATION,
    }
