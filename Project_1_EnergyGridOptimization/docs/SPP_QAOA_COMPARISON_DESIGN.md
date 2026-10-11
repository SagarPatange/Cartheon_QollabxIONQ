# SPP-derived QAOA comparison: proposed design

Status: owner approved October 11, 2026; plan approved and implemented locally. Existing QAOA results remain synthetic.

## Purpose

Show judges classical and QAOA results for the same bounded problem built from the selected uploaded SPP hour. Keep the full continuous auction as a separate reference. The most prominent result is the model marginal energy price, not a claim of operational nodal SPP LMP. Optimize integrated offer cost minus purchase bid value, then derive prices; do not minimize the price itself.

## Options and recommendation

1. Recommended first connection: a bounded, discretized SPP dispatch neighborhood. Reuse actual signed block/sloped curves, selected-hour fixed demand, and the existing finite-oracle QAOA engine. This requires declared dispatch-level discretization but no invented startup or commitment parameters.
2. SPP-based unit commitment: would reuse the existing commitment experiment more directly, but needs verified resource identity, startup/no-load costs, minimum output, ramp and minimum up/down parameters. Do not infer these from energy offers alone.
3. A larger full-auction binary encoding: much higher qubit and circuit demands; defer until the small matched comparison is correct.

## Small matched experiment

After a certified classical hour run, deterministically select a small set of actual submissions with adjustable capacity around the marginal price. Record the selection rule, source row IDs and all quantity levels. Up to four quantities each have two explicit dispatch levels, giving at most 16 states. Preserve the certified baseline quantity as one level where possible; the other is a documented feasible step. Keep a small declared set of balancing submissions continuous; freeze all other submissions at their certified awards. Subtract frozen net injections from original fixed demand to derive residual demand. Preserve source signed conventions and integrated costs. Never call these binary choices physical unit commitment.

For each binary candidate, a classical residual dispatch/pricing solve handles balancing submissions. Bounds and balance determine feasibility. Store original-curve costs and checks, conditional marginal price, and frozen cost constant. Candidates with infeasible recourse receive a disclosed penalty for circuit tuning but cannot be selected as valid outcomes. If the hour has insufficient adjustable/balancing resources or no meaningful alternative, report comparison unavailable; do not substitute synthetic inputs.

Classical exact enumeration and QAOA sampling use the identical small candidate set, demand, curves, levels and objective. The full continuous auction is a separately labeled reference and lower bound, not the equal-problem classical competitor. Because the baseline is already certified, this experiment cannot demonstrate a better cost than its full continuous optimum.

## Price interpretation

The large main readout remains the full-auction model marginal energy price. In the comparison panel, show the conditional marginal price from continuous recourse with the chosen discrete quantities fixed. This is not a dual supplied by QAOA, not necessarily the marginal value of the overall discrete optimization, and not nodal SPP LMP. If a price is nonunique, unavailable, or numerically uncertified, label it accordingly rather than inferring a price from the largest accepted offer. Compare cost gap, feasibility, selected awards and timing alongside prices. Lower price alone is not the success criterion.

## UI and execution

An explicit Run QAOA comparison action runs locally after Run Hour, never automatically with Run Day. Display side-by-side classical exact and QAOA sampled results for the matched subproblem: best feasible net cost, cost gap, conditional model price, feasibility/hit rate, and timing split into candidate preparation, classical solve, tuning and sampling. Highlight selected resource award changes. Keep full-auction reference values separate.

Use the already installed SciPy/Qiskit implementation with a free local simulator, bounded tuning and one run; no hardware or remote credit-consuming jobs. Cache by dataset hashes, UTC hour, baseline, selection, encoding, seed and tuning settings. Preparing the finite oracle enumerates every candidate classically: disclose this overhead and make no scalable quantum advantage claim. A later Qollab export must carry the exact same candidate table and provenance; remote execution is a separate action.

## Verification and assumptions

Record selection, frozen awards, residual demand, discrete levels, balancing-resource choice and conditional-pricing interpretation in ASSUMPTIONS.md before implementation. Cover one hand-verifiable signed-offer fixture and one real SPP hour, using small bounded runs. Verify that classical and QAOA scores use exactly the same table and that every selected result meets original bounds/balance; retain source hashes and settings. Do not rerun full-day benchmarks.

Implementation needs a new SPP-to-oracle adapter, result/job integration and comparison panel. Existing qaoa.py can be reused; commitment-specific subproblem.py cannot simply load the uploaded offers unchanged.


## Owner clarification: success frequency and delivery

Compare QAOA optimal-hit frequency and per-trial probability of finding the exact small-problem optimum with classical random sampling and a disclosed one-bit local-search heuristic under equal candidate occurrence budgets. Retain exhaustive enumeration as the exact reference; it always finds the finite optimum and is not a stochastic competitor. Show all outcomes, including a worse QAOA result. Several seeded trials are descriptive evidence, not proof of superiority or speedup; report tuning and oracle preparation separately. Use free local simulation only. After verified changes, commit and push relevant project changes with message `final draft, debugging`; inspect scope and exclude ignored uploads/results/cache and unrelated project changes.
