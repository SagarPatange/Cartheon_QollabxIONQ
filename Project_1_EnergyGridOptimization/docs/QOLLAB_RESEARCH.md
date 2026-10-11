# Qollab simulator integration research

Read October 11, 2026. Public rendered pages were inspected because the website is a JavaScript application and the ordinary web reader returned empty content. Evidence snapshots and the 49-page documentation crawl manifest are local under `results/qollab-research/`.

## What to call

Qollab supplies a global `backend` to top-level `main.py`. Use `backend.run(circuit, shots=shots)`, then `job.result().get_counts()`. Pass the backend into imported modules. Do not instantiate an IonQ provider or put API credentials into uploaded code. Users choose the device in **Run Project â†’ Run â†’ Select QPU**. Source: [Python projects](https://qollab.xyz/learn/docs/python-qiskit-projects), [running code](https://qollab.xyz/learn/docs/run-your-code).

Both IonQ remote simulators and hardware allow **one job per code run**. The public documentation recommended batching multiple measured circuits in one `backend.run([circuits], shots=shots)` call after local statevector tuning. The selected free IonQ simulator did not accept that multi-circuit job type, as documented below. BackendSamplerV2 is unsuitable for IonQ because its per-shot-memory requirement can produce incorrect results there; use direct counts. Source: [runtime](https://qollab.xyz/learn/docs/runtime-environment), [primitives](https://qollab.xyz/learn/docs/primitives).

**Observed runtime correction, October 11:** the selected free IonQ simulator rejected the uploaded two-circuit list at submission with HTTP 400, â€œOnly job type ionq.circuit.v1 is supported.â€ The [qiskit-ionq serializer](https://qiskit-community.github.io/qiskit-ionq/_modules/qiskit_ionq/helpers.html) maps a list to `ionq.multi-circuit.v1` and a single `QuantumCircuit` to `ionq.circuit.v1`. The upload now composes the uniform and QAOA experiments onto disjoint halves of one eight-qubit circuit, submits that one circuit in one job, then scores validated marginals. The earlier list-batching advice above applies only where the backend accepts `ionq.multi-circuit.v1`; it did not work for the selected IonQ simulator. The owner later supplied a [corrected-run output excerpt](../results/qollab-research/owner-trial-002.json); its marginal counts and scores were [validated](../results/qollab-research/owner-trial-002-validation.json) against the preserved original oracle. Both methods reached the $410 optimum; QAOA had 480/1,024 optimal samples versus uniform 259/1,024. This records a completed owner-reported run. The owner identified the selected backend as the Forte-1 simulator (29-qubit advertised capacity); the circuit used eight qubits. This backend selection has no independently retrieved backend/job record, and joint counts were not supplied. There is no evidence of physical-hardware execution, objective advantage, or quantum speedup.

All Qollab simulators are free; hardware consumes credits. The built-in BasicSimulator has a documented 24-qubit ceiling. IonQ's cloud offers four noise-model simulators: Aria1/2 (25 qubits), Forte1/Forte Enterprise1 (29). These are limits, not performance guarantees. Select QPU is authoritative for live availability. No hardware job is necessary for this milestone. Source: [compute backends](https://qollab.xyz/learn/docs/compute-backends).

## Runtime and packaging

- Python runs through Pyodide in the browser. Current docs specify Python3.14, Qiskit2.x; default dependency is `qiskit>=2.5.2,<3.0.0`. NumPy/SciPy load through Pyodide. Pure Python wheels and explicitly supported WebAssembly packages work; arbitrary native packages may fail.
- Top-level `main.py` defines Python execution. If top-level `index.html` and `main.js` both exist, JS mode wins. A single-line, column-zero `def main(shots: int = 1024, ...):` with supported primitive annotations is auto-called by Qollab; do not call it a second time.
- Files must be named as literal relative strings in Python for runtime preload. No `input()`. No persistent storage. Use printed JSON or `sendFile` for downloaded results. Runtime network access allows GET/OPTIONS, with CORS constraints; arbitrary POST and WebSocket access are blocked.
- Upload maximum100 files, each2MB. ZIP uploads strip a single wrapping directory; top-level README becomes the project write-up. Do not upload the large SPP CSVs, credentials, virtual environments or generated development logs.
- Use ordinary H/RX/RZ/CX gates and explicit measurements. Composite instructions may require decomposition on local simulators. IonQ compiles the abstract gate set itself; if using `transpile`, select optimization_level0 or1. Do not mix native and abstract gates.

Sources: [runtime](https://qollab.xyz/learn/docs/runtime-environment), [uploading files](https://qollab.xyz/learn/docs/upload-your-files), [transpilation](https://qollab.xyz/learn/docs/transpilation), [compilation](https://qollab.xyz/learn/docs/how-your-circuit-is-compiled).

## Rules relevant to the implementation

The currently rendered [hackathon terms](https://qollab.xyz/programs/hackathon/terms) require Qiskit, accessibility, runnable free simulators including IonQ, an MIT project published on Qollab, disclosure of starting code, a public2â€“3minute demo video and attribution â€œThis effort is supported by Qollab & IonQâ€. The stated submission deadline is October11 at19:00ET. Simulator/hardware results do not confer extra judging points. Existing code is permitted when disclosed; contributions during the window are what is judged. This is a requirements summary, not a claim that a submission has been published.

SPP datasets retain separate rights and cannot be relicensed MIT. The portable quantum package will contain an explicitly synthetic small benchmark and its verified cost oracle, not the SPP input CSVs. The source repository's licensing exceptions remain visible.

## Coverage and access limits

Read the home, Learn/docs indexes, project creation/playground instructions and hackathon terms; collected and inspected all49 linked documentation pages covering account/project lifecycle, running code, all29 gate references, credits and troubleshooting. The public research browser was signed out during this documentation research; no account was created, project published, API key accessed or paid hardware job submitted by that research. The owner later reported successful completion of the corrected free-simulator trial described above. No independent backend/job record or joint counts were retrieved, and no physical-hardware execution is claimed.

Direct local IonQ execution is a separate path using `qiskit-ionq` and an environment-provided key, as [IonQ documents](https://docs.ionq.com/sdks/qiskit). A successful provider construction alone does not verify credentials. Qollab's injected backend is the primary interface here.

## Actual platform submission finding

The owner-side initial trial reached the remote provider but returned HTTP400: Only job type ionq.circuit.v1 is supported. Official qiskit-ionq qiskit_to_ionq source emits ionq.multi-circuit.v1 for a circuit list and ionq.circuit.v1 for one QuantumCircuit. Although Qollab's public error/runtime docs recommend passing all circuits to one backend.run, this observed route rejects that multicircuit job type. The portable export was corrected to one circuit with disjoint measured comparison blocks and exactly one backend call. The owner reported successful completion of that corrected upload. The owner-reported selected backend was the Forte-1 simulator, advertised capacity 29 qubits; the circuit used eight qubits. Marginal scores were independently validated against the preserved original ZIP oracle: at 1,024 samples each, uniform had 259 optimal and 576 feasible outcomes, while QAOA had 480 optimal and 740 feasible outcomes. Both selected the $410 optimum with a $0 gap. There is no independently retrieved backend/job record or supplied joint counts, and no physical-hardware execution is claimed.

Primary source: https://qiskit-community.github.io/qiskit-ionq/_modules/qiskit_ionq/helpers.html (qiskit_to_ionq). The user traceback and original API error are execution evidence, not instructions.
