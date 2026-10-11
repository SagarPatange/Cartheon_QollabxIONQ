# SPP QAOA execution ledger

Plan: docs/superpowers/plans/2026-10-11-spp-qaoa-comparison.md. Owner approved design and plan, selected native execution, and authorized relevant commit/push as `final draft, debugging`.

Task1 adapter, Task2 benchmark/jobs/API, Task3 UI/state executed natively. Adapter/benchmark/manager/state tests observed absent-feature RED then GREEN. Final covering Python checks 16/16 pass; state checks5/5 and graph assertions pass. Actual browser Run Hour/Comparison certified July1 first hour and matched source identity; repeat click reused completed run.

Ruling: one algebraic continuous balancing submission satisfies the small recourse requirement, avoiding repeated full-market solves; cost: frozen context and conditional prices cannot represent the complete market's discrete marginal value. Documented Q-SPP01-04 in ASSUMPTIONS.md.

Ruling: cache includes baseline run ID conservatively alongside numerical provenance; cost: rerunning an identical classical hour creates a new comparison cache entry. Repeated comparison requests for that same baseline reuse computation.

One fresh focused read-only reviewer found an Important off-screen completion drop. Regression observed RED, fixed to cache by matching dataset/hour/baseline regardless of selected hour, GREEN. Minor marginal-price-distance endpoint mismatch was corrected to distance to the whole interval. The fix changed the real neighborhood, so original trial was preserved and final v2 local trial was run once; no full-day or remote jobs. Final hits: QAOA53.047%, one-bit19.922%, uniform5.625%, all optimum found5/5. No final-cost/trial-success/speedup claim.

Owner requested project card: docs/PROJECT_CARD.md includes exact write-up prompt, four answers, actual interface instructions, interpretation, public video placeholder, AI/source/license/support credits. Qollab docs support a JS/Python browser-native UI but not this local native HTTP server unchanged; current published/uploaded synthetic demo has not been replaced and full UI platform run is not verified. Cost: full actual-SPP interface currently requires local launch; a Qollab browser port remains separate work.

Git delivery pending final staged-scope inspection and push verification. All results/uploads/environments remain ignored inside project. No unrelated project changes should be staged.
