# Project Cleanup Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development, separate implementation and read-only review agents. Execute only after the quantum implementation and final review are complete.

**Goal:** Organize Project1 into clear source, test, data and documentation folders while retaining verified behavior and useful evidence.

**Architecture:** Move existing engines/studies into Python packages and update consumers. Preserve application/quantum APIs, source data and solver semantics. Separate current guidance from completed planning provenance.

**Tech Stack:** Existing Python/Qiskit/SciPy, PowerShell and Node; no new dependencies.

**Spec:** 2026-10-11-project-cleanup-design.md in this directory.

## Global constraints

- Project1 only; no commits/push, paid jobs or publication; preserve other projects and existing dirty work.
- Every computed deletion/move target is checked within Project1 and uses native PowerShell LiteralPath.
- No solver objective, constraint or certificate changes; public SPP data is not MIT relicensed.
- Retain all required evidence/ledgers because work is not committed; archive completed guidance rather than destroy provenance.

## Review focus

- A moved file derives the wrong project/data root.
- A stale import or test discovery silently drops validation.
- README/module CLI commands or links stop resolving.
- A regenerated upload imports local-only modules or loses its single-job guard.
- Cleanup deletes relevant user input or study evidence.

## Task1: Migrate and verify

Files: move core five engines to optimizer/; six study/audit tools to studies/; root/application/quantum Python tests to tests/; dependency files to requirements/; explanatory markdown to docs/ and completed plans/ledgers to docs/archive/. Create package markers, update source imports/project root paths, start_application.ps1 as necessary, README and live links. Create docs/PROJECT_STRUCTURE.md and results/cleanup-development/task-1-report.md.

- [x] Inventory tracked and untracked scope, classify evidence, capture dataset hashes and source baseline snapshots; preserve unrelated changes.
- [x] Check current baseline verification evidence, move packages and update imports/paths/module entry commands without altering numerical behavior. Reuse existing tests as the regression contract; do not write tests that merely mirror moves.
- [x] Move docs/dependencies, update current README reading order/install/run commands and links. Preserve historical ledger content and recorded rulings.
- [x] Resolve and check every removal target; remove only proved disposable/obsolete items, record exact paths/reasons. Preserve current useful evidence.
- [x] Run complete Python/Node suites, fresh benchmark/export smoke and representative classical module entry points. Verify unchanged dataset hashes and portable archive size/license rules. Controller verifies restarted live app separately.
- [x] Write self-review/report and moved/deleted/retained inventory, including verification outputs and limitations.
- [ ] Fresh independent task review, fixes with focused verification and scoped re-review, then final whole-project review and one fix wave if needed.

No approval gate remains for routine organization choices under the user's explicit queued-work authorization. Any actual missing remote credentials remain a remote-only limitation.
