# Bounded commitment candidate subroutine

User authorization: after the completed cabinet goal, research Qollab, implement the subroutine using suitable libraries, then reorganize Project1. The user granted access permissions for these queued tasks. Continue autonomously within that scope; no Git push or paid hardware execution is part of it.

## Purpose and choice

Generate small binary unit-commitment candidates with QAOA, validate feasibility and cost against the existing exact classical model, and compare with enumeration, uniform sampling and a classical local-search heuristic. Preserve the same objective and physical constraints. This is a bounded research experiment, not evidence that historical SPP optimization or LMP fidelity improves.

A direct full-day QUBO would introduce approximations and many qubits. Grover search would need an expensive reversible feasibility/cost oracle. Choose a small exact diagonal cost oracle plus QAOA: transparent encoding, arbitrary constraint support and compatible Qiskit gates. Its exponential classical oracle preparation is explicitly charged and prevents claiming a scalable quantum speedup.

## Encoding and validation

`quantum/subproblem.py` creates a table over at most8 selected on/off decisions. Each bit refers to an explicit interval/unit pair; q0 is the rightmost displayed bit. Nonselected commitment entries remain fixed. Every schedule is passed to existing `price_fixed_commitment`, whose original-parameter certificate must pass. Feasible entries store actual full objective; explicit infeasible entries get a penalty strictly above every feasible cost. Unexpected solver/export failures must propagate, never become infeasible. Reject a table with no feasible entries. No repair: invalid measured candidates are discarded and counted.

The initial4-qubit benchmark is `data/commitment_benchmark.json` (two units/two hours), evaluated at startup costs10 and1000 dollars. The independently known optimal costs are410 and1000 dollars. Also run a4-bit neighborhood of the24-hour declared operating case with all other commitment decisions fixed to its certified MILP solution. This second experiment validates integration; a certified optimum cannot be improved by reducing its objective.

## Circuit and optimization

`quantum/qaoa.py` converts the finite cost table into exact diagonal Pauli-Z products by a Walsh transform, removes only the global-phase constant, and applies each term with CX parity ladders and RZ. Use H initialization, RX mixers, p=2 by default, and explicit measurements for backend execution. Verify every basis-state phase, little-endian decode and normalization against independent numeric references.

SciPy COBYLA tunes expected penalized cost through Qiskit Statevector, with deterministic multistart seeds and a finite evaluation budget. Keep tuning evaluations and measured evaluation samples separate. Return parameters, evaluation count, stopping status and tuning time; do not treat a termination limit as a convergence certificate.

Measured candidate selection uses complete counts, with no low-probability filtering. Reject malformed counts, incorrect width, noninteger/negative values, zero total and mismatch with requested shots. Select the lowest actual feasible objective among observed candidates. Report observed feasible rate, optimal-hit rate and best gap against exact enumeration, including the no-feasible-sample outcome.

## Execution and evidence

`quantum/benchmark.py` executes repeated local BasicSimulator runs at equal shot/candidate budgets, alongside uniform sampling and a deterministic one-bit hill-climb. Include oracle preparation, tuning, circuit execution, decode/selection and classical verification in timings; shared preprocessing must be clearly counted for all methods. Retain complete oracle/scenario/certificate inputs, seeds, shots, environment, baseline objectives and results under ignored `results/quantum-*`. Never report changed-input savings as algorithmic improvement.

`quantum/qollab_export.py` builds a small upload package under ignored results. It contains top-level `main.py`, requirements, synthetic benchmark/oracle, minimal quantum modules, README and MIT code license. Qollab main uses its injected backend, does local statevector tuning, and submits exactly one eight-qubit circuit in one job: low four qubits encode uniform samples, high four encode QAOA samples. It validates joint counts and scores their four-bit marginals; results are printed as JSON. The two blocks are independent in an ideal simulator but noise may correlate measured outcomes. The original two-circuit list produced `ionq.multi-circuit.v1`, which the selected Qollab IonQ simulator rejected with HTTP 400; the single-circuit layout produces `ionq.circuit.v1`. This remote submission finding supersedes the earlier batching design. The export includes explicit source/provenance, synthetic scope, oracle-preparation overhead and attribution. Data files are literal paths and each file is below2MB. Do not bundle SPP data or the local HTTP cabinet; that server architecture cannot run unchanged inside Qollab's sandbox.

The same upload entry point is exercised locally with an injected BasicSimulator, including a backend guard that rejects a second submission. Remote IonQ success is recorded only after an actual remote result; credentials/session access remain separate from local correctness.

## Boundaries and handoff

No application solver mathematics or historical data changes. Minimal local dependency: compatible Qiskit2.x in the existing project environment, pinned after installation; SciPy/NumPy are already present. New assumptions and penalty/seed decisions go into ASSUMPTIONS before use. Separate implementation and review agents continue the user's selected workflow. Cleanup follows verified quantum implementation and preserves required source/data/evidence.
