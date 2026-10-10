# Cartheon × Qollab × IonQ

Team Cartheon's projects for the **Qollab × IonQ Hackathon** (Oct 9–11, 2026). Each project lives in its own folder
with its own README, setup and tests.

This effort is supported by Qollab & IonQ.

| Project | What it is | Status |
|---|---|---|
| [Quantum Bros](Project_3_QuantumRepeaters_QKD/) | A Super Mario Bros. 3 style game that teaches the quantum internet: repeaters, teleportation, error correction and quantum key distribution | Playable |
| [Freight Decision Intelligence](Project_2:FreightDecisionInteligence/) | A truckload dispatch simulator that compares dispatch policies on the same stream of real-shaped loads | Playable |
| [Energy Grid Optimization](Project_1:EnergyGridOptimization/) | Not started yet | Empty |

---

## Quantum Bros: quantum repeaters and QKD

Mario and Luigi want to talk in secret across the Mushroom Kingdom while Qowser's cloud turtles tap every fiber.
Each stop on the world map teaches one piece of a real protocol, the quantum repeater with encoding and classical
error correction (QRE-CEC):

- **Level 1: Quantum repeaters.** Make entanglement with light, one heralded link at a time.
- **Level 2: Teleportation.** Send a qubit using a Bell pair and two classical bits.
- **Toad's BB84 hut.** How two bases, sifting and a sample check catch an eavesdropper.
- **Toad's QEC hut.** From the 3-qubit bit-flip code to the Steane [[7,1,3]] code, its encoding circuit, fault
  tolerance and flag qubits.
- **Level 3: A logical Bell pair.** Herald 7 Bell pairs, encode two Steane blocks, and join them with a teleported
  CNOT into one error-corrected Bell pair.
- **Level 4: A secret message for Peach.** Turn the links into a QKD key and send the message.

The levels run their circuits on a stabilizer simulator in the Python backend; the page plays back what the
simulator did. The repo also has notebooks for the 3- and 5-qubit repetition-code versions of QRE-CEC.

```sh
cd Project_3_QuantumRepeaters_QKD
cd backend && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && cd ..   # once
npm run backend        # then open http://localhost:8001
npm test               # game tests
```

## Freight Decision Intelligence: truckload dispatch

A fleet simulator, not a dispatch board: loads are tendered over a week across US lanes, and each dispatch policy
decides which loads to accept and which truck hauls each. Every policy sees the same loads and is scored the same
way, so they can be compared head to head. Today the policies are a greedy nearest-truck rule and a MILP
assignment (SciPy / HiGHS) with five objectives: max profit, customer satisfaction, low cost, max revenue and
balanced. A quantum policy is planned. The data is the synthetic Logistics Operations Database from Kaggle (MIT).

```sh
cd Project_2:FreightDecisionInteligence
npm run serve          # then open http://localhost:8022, pick a month and week, press "Simulate week"
npm test               # page logic
```

## Energy Grid Optimization

Reserved for a third project; the folder only holds an empty README so far.

---

## Repo rules

[`RULES.md`](RULES.md) collects the hackathon terms every project follows (Qiskit, runnable on Qollab's free
simulators, MIT license, disclosures, accessibility) and how we write code. Each project's README needs a
`## Disclosures` section listing prior work, libraries, data and AI tools used.

All code and docs are under the [MIT License](LICENSE).
