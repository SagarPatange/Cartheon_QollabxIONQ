"""Shor's algorithm for N = 15 in Qiskit: the same circuit the Shor's Key lock walks through, small enough
(8 counting + 4 work = 12 qubits) to run on Qollab's free built-in simulator.

The controlled a^x mod 15 gates follow the Qiskit textbook construction for N = 15. The backend is the one
picked in Qollab's Run dialog, passed in as the global `backend`.
"""
from fractions import Fraction
from math import gcd

from qiskit import QuantumCircuit, transpile
from qiskit.circuit.library import QFT

N = 15
COUNT = 8  # counting register: 2n qubits for n = 4


def amod15(a: int, power: int):
    """Controlled-U gate for U|y> = |a*y mod 15>, applied `power` times (Qiskit textbook construction)."""
    U = QuantumCircuit(4)
    for _ in range(power):
        if a in (2, 13):
            U.swap(2, 3); U.swap(1, 2); U.swap(0, 1)
        if a in (7, 8):
            U.swap(0, 1); U.swap(1, 2); U.swap(2, 3)
        if a in (4, 11):
            U.swap(1, 3); U.swap(0, 2)
        if a in (7, 11, 13):
            for q in range(4):
                U.x(q)
    gate = U.to_gate()
    gate.name = f"{a}^{power} mod 15"
    return gate.control()


def shor_circuit(a: int) -> QuantumCircuit:
    """H on the counting register, |1> on the work register, controlled powers of a, inverse QFT, measure."""
    qc = QuantumCircuit(COUNT + 4, COUNT)
    qc.h(range(COUNT))
    qc.x(COUNT)
    for q in range(COUNT):
        qc.append(amod15(a, 2**q), [q] + [COUNT + i for i in range(4)])
    qc.append(QFT(COUNT, inverse=True), range(COUNT))
    qc.measure(range(COUNT), range(COUNT))
    return qc


def main(a: int = 7, shots: int = 1000):
    """Run Shor's circuit for N = 15 with key a (2, 4, 7, 8, 11 or 13) and read the factors from the counts."""
    qc = transpile(shor_circuit(a), backend)  # noqa: F821  (Qollab provides `backend`)
    counts = backend.run(qc, shots=shots).result().get_counts()  # noqa: F821
    print(f"N = {N}, a = {a}, shots = {shots}")
    for bits, c in sorted(counts.items(), key=lambda kv: -kv[1])[:8]:
        k = int(bits, 2)
        r = Fraction(k, 2**COUNT).limit_denominator(N).denominator
        found = ""
        if r % 2 == 0 and pow(a, r, N) == 1:
            x = pow(a, r // 2, N)
            p, q = gcd(x - 1, N), gcd(x + 1, N)
            if 1 < p < N:
                found = f"  ->  {N} = {p} x {q}"
        print(f"k = {k:3d} ({c} shots)  k/256 ~ {k}/{2**COUNT}  ->  R = {r}{found}")
