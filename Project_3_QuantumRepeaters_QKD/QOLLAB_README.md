# Quantum Bros

A Quantum Playground project: a Super Mario Bros. 3 style game that teaches the quantum internet one level at a time,
from heralded entanglement to a secret key sent across a quantum repeater chain.

Mario and Peach live at opposite ends of the Mushroom Kingdom and want to talk in secret while Qowser's turtles listen
on every fiber. Each level plays one step of a published protocol, the **quantum repeater with encoding and classical
error correction (QRE-CEC)** [1, 2]: make Bell pairs with light, protect them with an error-correcting code, swap them
across a repeater, and distil a BBM92 key. Every level runs its circuit on a simulator and replays what happened, so
nothing on screen is scripted.

The game is a teaching model, not a hardware-accurate repeater simulation. Levels 2 to 6 use Clifford circuits with
Pauli noise; photon loss, timing and memory decoherence are simplified. One experiment, the repetition-code repeater,
runs as a real circuit on the backend you select in Qollab.

## Why it matters

A quantum internet would let two parties share a key whose secrecy rests on physics, not on how hard a math problem is.
It needs entanglement between distant places, and that is hard to deliver. Optical fiber loses light exponentially
with distance, and the no-cloning theorem forbids copying and amplifying a quantum signal the way a classical repeater
does. A **quantum repeater** splits the distance into short links, makes entanglement on each link, and joins the links
with entanglement swapping. Every step adds errors, so repeaters encode their qubits in error-correcting codes
(QRE-CEC [1, 2]).

These ideas sit behind a wall of notation. Quantum Bros turns each one into something you play: you fire the photons,
place the encoder's CNOTs, choose the Pauli fix, and watch an eavesdropper get caught.

## Data

There is no external dataset. Every bit in the game comes from simulated quantum circuits, generated fresh on each
run. The inputs that play the role of data are:

| Input | Value | Source |
| --- | --- | --- |
| Protocol | Heralded Bell pairs → encoded blocks → encoded swap → Pauli frame → BBM92 key | QRE-CEC, our paper [1] |
| Chain | Alice ─ Bob ─ Charlie: 2 links, 1 repeater | Kept small so the scene stays readable |
| Code | 3-qubit repetition code on the chain; [[7,1,3]] Steane code in Levels 3–5 | [1, 4, 5] |
| Noise | One physical error rate p for every gate and measurement, set with a slider in Level 6 (up to 0.1) | Pauli noise, as in [1] |
| Eavesdropper | Qowser's turtles tap a chosen fraction of the photons (intercept-resend in a random basis) | BBM92 security check [8] |
| Seeds | Every call takes a seed, so any run can be replayed exactly | |

## Interface

- **World map:** a Super Mario Bros. 3 style map. Walk with the arrow keys or W A S D and press Enter on a level. Toad's
  huts explain BB84 and quantum error correction in illustrated panels.
- **Every level** types its goal in the sky and shows, under it, the keys that work right now. Space moves on, Enter
  confirms a choice.
- **Level 1:** story mode. Press Space to zap the Rydberg atoms, watch the photons meet at the BSM Node, and see what
  no click, one click and two clicks mean. The default settings cannot finish the round; the hint sends you to the
  gear menu to tune them.
- **Levels 2–5:** each one draws the circuit you are building. Pick a Pauli fix, place CNOTs into a 7-qubit block,
  and follow the paper's Fig. 4 teleported CNOT, while the qubit towers show each qubit's state. In Level 2, B
  reopens the lesson notes.
- **Level 6:** Mario and Peach stand at the ends of a chain of telecom towers over water. A step-by-step swap tutorial
  (Space, R for a new run, Esc to skip) comes first. Then Mario sends with **Q** (classical), **W** (one-time pad
  with a quantum key) or **E** (teleported qubits), and Peach replies with **I / O / P**. Turtles can be switched on
  to tap the fiber.
- **Run repeater on QPU** (world map, bottom right): sends the 13-qubit repeater circuit to your Select QPU backend
  and shows ⟨ZZ⟩, ⟨XX⟩ and the fidelity bound.

## What runs where on Qollab

| Part | Runs on | Qubits |
| --- | --- | --- |
| Pages, map, animations | `main.js` + `main.css` in the browser | none |
| Levels 2–6 (teleport, Steane block, teleported CNOT, logical pair, secret message) | `quantum_bros.api` in Pyodide, on a Qiskit `Clifford` stabilizer tableau | up to ~100 |
| Repetition-code repeater experiment (**Run repeater on QPU** on the world map) | **the Qollab backend from Select QPU**, as one `backend.run` job | 13 |

Each level asks a question and has to get the answer straight away ("measure now, get the bit now"), so the
interactive levels use an in-browser stabilizer engine. The repeater experiment follows the Qollab/IonQ rules: one job,
one `QuantumCircuit`, no `if_test`/`c_if`, at most 24 qubits.

## The hardware experiment

Chain Alice ─ Bob ─ Charlie. Each link holds a Bell pair of 3-qubit repetition-code blocks (α|000⟩ + β|111⟩). Bob
joins the links with a logical Bell measurement, Pauli corrections are applied classically, and the end pair is read
in Z or X.

- **One circuit for both bases:** an extra "basis" qubit in |+⟩ controls a Hadamard on the 6 end qubits, so each shot
  reads Z or X at random. That makes 12 + 1 = 13 qubits, instead of 24 for two copies.
- **Decoding:** Z-basis logical bits by majority vote (corrects one bit flip), X-basis by parity, swap bits
  m_x = parity of d's X bits and m_z = majority of a2's Z bits.
- **Output:** ⟨ZZ⟩, ⟨XX⟩, the fidelity lower bound F ≥ (⟨XX⟩ + ⟨ZZ⟩)/2, swap-outcome frequencies and the backend
  name. A noiseless simulator gives ⟨ZZ⟩ = ⟨XX⟩ = F = 1.0.

## Levels

| Level | Teaches | Simulator call |
| --- | --- | --- |
| 1 · Heralded entanglement | Rydberg atom → photon → beam splitter; Barrett–Kok double-click heralding [3] | in-page |
| Toad's huts | BB84; the 3-qubit code, [[n,k,d]], the Steane code [4] | in-page |
| 2 · Teleportation | Bell measurement and Pauli fix | `/api/teleport` |
| 3 · Build a Steane block | Paetznick–Reichardt encoder [5], error correction | `/api/steane-block`, `/api/steane-errors` |
| 4 · Teleported CNOT | Gate teleportation between nodes [7] | `/api/teleported-cnot` |
| 5 · A logical Bell pair | Seven physical pairs → one encoded pair | `/api/logical-pair` |
| 6 · A secret key | Encoded swapping with classical error correction, BBM92 [8] | `/api/send`, `/api/repetition-swap` |

## Code reading order

1. `main.js`: the hash router (`#start`, `#level1`, `#start/map-level1`, …) and `globalThis.qollabSimulator`, which
   calls `quantum_bros.api.handle.callPromising(backend, path, json)`.
2. `quantum_bros/api.py`: one `handle()` entry point and a path → handler table. It applies the same request rules as
   the local FastAPI server, and returns `{"error", "status"}` for bad requests.
3. `quantum_bros/backends/qiskit_backend.py`: `QiskitStabilizerBackend`, a Clifford tableau updated in place with
   Qiskit's own gate updates and a numpy measurement step. Every random draw comes from one seeded generator.
4. `quantum_bros/protocol/`: the physics. `barrett_kok.py`, `teleport.py`, `steane.py`, `steane_block.py`,
   `teleported_cnot_lesson.py`, `logical_link.py`, `repetition_code.py`, `qre_cec.py`, `qkd.py`, `messaging.py`.
5. `quantum_bros/protocol/qpu_repeater.py`: `build_repeater_circuit()` and `run_qpu_repeater(backend, shots)`, the
   hardware experiment.
6. `src/`: one folder per level. `simulator_bridge.js` is the single place that reaches the simulator.

## Run

**On Qollab:** pick a simulator in Select QPU and press Run. The world map opens. Move with the arrow keys or W A S D,
press Enter on a level, Space to move on, Enter to confirm a choice. Click **Run repeater on QPU** (bottom right of
the map) to send the 13-qubit circuit to your backend. No server or install is needed: `requirements.txt` is empty
because Qiskit, NumPy and SciPy are provided.

**Locally** (full repo, Stim backend + FastAPI):

```sh
cd backend && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && cd ..
npm run backend          # http://localhost:8001
python3 tools/build_qollab.py   # rebuilds this Qollab folder
```

## Results

**1. The repeater circuit under noise.** The 13-qubit circuit (3-qubit blocks) against the same chain without encoding
(1-qubit blocks, 5 qubits). Aer, 40,000 shots each, depolarizing noise p on every CNOT, p/10 on 1-qubit gates and a
bit-flip probability p on readout.

| p | ⟨ZZ⟩ unencoded | ⟨ZZ⟩ encoded | ⟨XX⟩ unencoded | ⟨XX⟩ encoded | F ≥ unencoded | F ≥ encoded |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| 0.002 | 0.975 | **0.992** | **0.977** | 0.921 | **0.976** | 0.957 |
| 0.005 | 0.940 | **0.983** | **0.941** | 0.809 | **0.941** | 0.896 |
| 0.01 | 0.884 | **0.957** | **0.884** | 0.664 | **0.884** | 0.811 |
| 0.02 | 0.777 | **0.895** | **0.778** | 0.443 | **0.777** | 0.669 |
| 0.05 | 0.531 | **0.679** | **0.514** | 0.126 | **0.522** | 0.402 |

The repetition code does what it promises: majority voting fixes single bit flips, so ⟨ZZ⟩ stays much closer to 1
(error 0.008 vs 0.025 at p = 0.002). It cannot see phase flips, and three qubits collect about three times as many, so
⟨XX⟩ falls faster and the overall fidelity is lower than without encoding. The encoded circuit also pays for 6
controlled-H readouts instead of 2. This is why the game moves on to the Steane code, which corrects both kinds of
error. The **Run repeater on QPU** button runs the same 13-qubit circuit on your chosen backend, so this trade-off
can be measured on real noise.

**2. The secret message (Level 6 pipeline).** Heralding → encoded swap → BBM92 → one-time pad, sending "QUANTUM!"
(64 key bits). Stim, 40 seeds per row. The check aborts when the sampled error rate is above 11%.

| p | Eavesdropper | Key bit error rate | Aborted | Message arrived exactly |
| --- | --- | --- | --- | --- |
| 0 | off | 0.0% | 0% | 100% |
| 0.001 | off | 1.9% | 0% | 30% |
| 0.005 | off | 8.6% | 25% | 0% |
| 0.01 | off | 15.6% | 72% | 0% |
| 0.02 | off | 24.8% | 88% | 0% |
| 0.05 | off | 36.9% | 100% | 0% |
| 0 | **on** | 38.3% | **100%** | 0% |
| 0.001 | **on** | 38.9% | **100%** | 0% |

- **An eavesdropper is always caught.** Measuring the pairs pushes the key error to about 38%, and every run aborts
  before a single message bit is sent.
- **Noise alone looks like an eavesdropper.** As p grows the key errors rise until the check aborts.
- **The game has no key reconciliation.** At p = 0.001 the key error is only 1.9%, but one wrong bit in 64 corrupts
  a character, so only 30% of messages arrive exactly. Real QKD adds error correction and privacy amplification
  here; the game leaves them out so that the effect of noise stays visible.

Both tables come from `tools/results_repeater_noise.py` and `tools/results_message_sweep.py`. They run the code in
this project with fixed seeds, so every row can be reproduced.

## Verification

- 244 backend tests (`pytest`), including 26 for the Qiskit engine: 15 random circuits are checked against Stim
  Pauli by Pauli, and the Steane, teleport, QRE-CEC and QKD protocols run on it noiselessly.
- 28 tests run 12 requests through both `api.handle` and the FastAPI server, and require identical JSON, plus 14 bad
  requests that both must reject.
- 7 tests for the 13-qubit repeater circuit: gate set, one job, ⟨ZZ⟩ = ⟨XX⟩ = 1 when noiseless.
- 207 game tests (`node --test`).
- This build is checked with Stim, FastAPI, pydantic and Qiskit Aer blocked from import: all 8 API paths run, and a
  full encrypted message takes about 0.2 s in CPython. Headless Chrome then loads all 9 pages and the map → level → map
  navigation with no console errors.

## References

1. S. Patange *et al.*, "Realistic simulation of quantum repeater with encoding and classical error correction,"
   arXiv:2605.06928.
2. L. Jiang *et al.*, "Quantum repeater with encoding," *Phys. Rev. A* **79**, 032325 (2009).
3. S. D. Barrett and P. Kok, *Phys. Rev. A* **71**, 060310(R) (2005).
4. A. M. Steane, *Phys. Rev. Lett.* **77**, 793 (1996).
5. A. Paetznick and B. W. Reichardt, *Quantum Inf. Comput.* **12**, 1034 (2012).
6. C. Gidney, "Stim," *Quantum* **5**, 497 (2021).
7. L. Jiang *et al.*, *Phys. Rev. A* **76**, 062323 (2007).
8. C. H. Bennett, G. Brassard and N. D. Mermin, *Phys. Rev. Lett.* **68**, 557 (1992).

The full tutorial, with every level's physics, is in [GUIDE.md](GUIDE.md).

## Disclosures

Original code and documentation are under the repository's MIT license. Mario, Peach and Toad belong to Nintendo;
this is a non-commercial fan project, and all pixel art is drawn in code. Font: Press Start 2P (SIL OFL).
Libraries: Qiskit (Apache-2.0), NumPy/SciPy (BSD); locally also Stim (Apache-2.0) and FastAPI (MIT). The protocol
comes from our paper [1]. Claude Code (Anthropic) helped write code, tests and documentation.

This effort is supported by Qollab & IonQ.
