# Freight Decision Intelligence

A visual truckload-dispatch simulator with a Qiskit QAOA experiment on competing load–truck assignments.

**Theme: Quantum Impact.** This effort is supported by Qollab & IonQ.

## What is it?

The application simulates a carrier's weekly decisions: accept a load with a truck, decline it, or hold it for later. Watch trucks on the US freight network, inspect decisions, and compare greedy dispatch with five classical assignment objectives. A separate quantum panel compares QAOA, classical random sampling and classical one-bit search on one contested assignment from the selected week's MILP run.

## Why does it matter?

Assigning scarce trucks affects profit, customer coverage and wasted empty miles. This experiment asks whether a hybrid quantum sampler can concentrate candidate assignments on valid and optimal choices. The data is a synthetic Kaggle carrier, not confidential carrier records, and the model simplifies real operations.

## How does the quantum part work?

Each of at most eight bits selects a specific load–truck pair. No load or truck can be assigned twice. Valid assignments receive their objective score; invalid ones get a penalty. All candidates are enumerated classically and the best is checked against the matching MILP. QAOA applies the table's diagonal cost phases and RX mixers, with angles tuned locally using SciPy COBYLA. One measured circuit samples QAOA and uniform random blocks; classical one-bit search receives the same candidate budget.

This is a bounded dispatch subproblem, not a QAOA policy controlling the weekly fleet. Table preparation and classical tuning are overhead. Exact enumeration already finds the optimum; hit rates do not prove quantum speedup or general superiority.

## How to run in Qollab

Upload and unpack **qollab-submission.zip**. `index.html`, `main.js` and `main.css` must sit at the root. Select the **free built-in BasicSimulator**, then press Qollab **Run**. The preview opens the full application, solves the default week and automatically runs one 256-candidate-per-method quantum comparison. No keys, paid services or remote compute are required. Allow the Python runtime and solver to load; the status line reports progress.

Each Qollab Run submits at most one backend job (at most 16 qubits). The comparison button is disabled after that job; press Qollab Run again for another quantum experiment. Classical week simulations can still be run inside the preview. Use the free built-in simulator; hardware and noisy simulator results are unnecessary for judging.

## Use the interface

Choose a month, one of its first four Monday-starting weeks, a policy, an objective and a tender/fleet seed. **Simulate week** computes fresh classical dispatch for those settings. **Play**, the time slider and speed control replay truck movements; the side panel reports profit, accepted loads, empty miles and fleet state. **Decision by decision** explains individual assignments. **Compare objectives** runs greedy and all five classical objectives on the same week and seed.

The Qollab map uses real city coordinates and bundled OSRM road paths, with no external background tiles. Purple filled arrows indicate loaded trucks, outlines indicate empty travel, dim arrows are parked and gray arrows are out of service. This does not represent live freight or traffic.

The automatic Qollab comparison uses March 7, 2022, seed 1, profit objective. Classical controls can explore every packaged week afterward. For interactive quantum comparisons on another week, use **Run quantum comparison** in the local application. Do not interpret the initial Qollab quantum result as belonging to a different week selected afterward.

## Interpret the comparison

**Optimal hits** is the share of candidate occurrences equal to the exact subproblem optimum. **Valid samples** satisfies the unique-load/unique-truck constraints. **Best objective score** is the highest-scoring feasible sampled assignment; its meaning follows the selected objective, and it is not total weekly profit. **Gap to optimum** is zero when the best sample matches the exact answer. A method can find the optimum once while having a low optimal-hit rate; repeated candidates count as repeated occurrences. Settings, preparation, tuning and backend time are disclosed in the dropdown. One run is descriptive evidence, not statistical proof.

## Demo video

**Public 2–3 minute video:** ADD YOUR PUBLIC VIDEO LINK HERE.

## License and disclosures

Our code and documentation are MIT licensed. The Logistics Operations Database by yogape on Kaggle is synthetic and MIT licensed; only simulator-required columns are packaged. Personal driver fields are omitted. City coordinates are from the public-domain US Census Gazetteer. OSRM distances and road paths derive from OpenStreetMap and retain ODbL attribution; they are not relicensed MIT. See `DATA_LICENSE.md`.

The QAOA implementation was adapted from this team's Project 1 in the same repository (MIT), then connected to the freight assignment problem. Libraries: Qiskit (Apache-2.0), NumPy and SciPy/HiGHS (BSD); the local map uses Leaflet (BSD-2-Clause). Claude Code and OpenAI Codex assisted with research, code, tests, packaging and documentation. Do not claim the reused quantum method itself is novel; the freight modeling and application are the project contribution.

Source: https://github.com/SagarPatange/Cartheon_QollabxIONQ/tree/main/Project_2_FreightDecisionInteligence

Dataset: https://www.kaggle.com/datasets/yogape/logistics-operations-database
