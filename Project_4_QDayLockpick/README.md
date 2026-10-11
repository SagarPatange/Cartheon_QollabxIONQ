# Shor's Key

This effort is supported by Qollab & IonQ.

**Shor's Key** teaches Shor's algorithm as a pin-tumbler lock. N = 851 is the lock and your guess a is the key.
Each level is one step of the circuit: initialise, Hadamard, modular exponentiation, inverse QFT, measurement and
continued fractions. You act first, predict what the lock will show, then see it, until the shackle pops at
851 = 23 × 37. Level 1-1 asks you to factor 851 by hand first, to show why classical factoring breaks down.

## How to run

Open the project and press **Run**. Pick the **Built-in simulator**. The page opens on the title screen: press
Start, then Play on each gate of the circuit map. Keyboard: arrows, Enter, Esc.

`shor15.py` is the Qiskit version of the same circuit for N = 15 (8 counting + 4 work = 12 qubits, fits every
free backend). `main(a=7, shots=1000)` runs it on the selected `backend` and prints the measured k, the period R
read by continued fractions, and the factors 15 = 3 × 5.

## What to expect

N = 851 needs 30 qubits, more than the free simulators allow, so the lock's 851 run is an exact state-vector
calculation in the page (closed-form inverse-QFT distribution, `src/shor/math.ts`, unit tested). The Qiskit file
runs the real circuit at a size the simulators accept.

## Disclosures

- Built during the hackathon window by Team Cartheon.
- AI coding tools were used to help write code, styling and text under our direction.
- Libraries: React 19 (MIT), GSAP 3 (GreenSock standard licence, free), Vite (MIT), TypeScript (Apache-2.0),
  Vitest (MIT), Qiskit (Apache-2.0).
- The controlled a^x mod 15 gates in `shor15.py` follow the Qiskit textbook construction for N = 15.
- References: P. W. Shor, "Polynomial-time algorithms for prime factorization and discrete logarithms on a
  quantum computer", SIAM J. Comput. 26 (1997).
- Font: Source Sans 3 (SIL OFL) from Google Fonts.

MIT licensed.
