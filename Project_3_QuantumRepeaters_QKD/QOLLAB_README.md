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
