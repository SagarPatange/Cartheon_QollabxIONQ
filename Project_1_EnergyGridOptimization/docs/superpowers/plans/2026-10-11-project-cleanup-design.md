# Project organization design

User scope: after the quantum implementation, clean up Project1, create useful subfolders, reorganize code, and remove obsolete material. All project artifacts remain inside Project1. No commits/push or unrelated repository changes.

The root keeps README.md, start_application.ps1, Git configuration and environment folders. Reusable classical engines move to optimizer/; historical-data studies and artifact audit commands move to studies/. Application and quantum source remain in their existing packages. All Python tests move to tests/, with package markers so root unittest discovery still works. The Node state test can remain with its application module so its import path stays direct. Dependencies move to requirements/. Data and its public-source/license declarations remain under data/.

Active explanatory documents move to docs/: ASSUMPTIONS.md, model and data explanations, Qollab research, and the latest study/application/quantum results. Completed designs, plans and execution ledgers move to docs/archive/; this retains required decision provenance without presenting completed instructions as current work. README supplies concise current run commands, reading order, assumptions and data licensing links.

Update imports to optimizer.* and studies.*, module commands, test discovery, project-root resolution and all live documentation links. Do not alter optimization equations, parameters or certificates. The Qollab portable export must remain standalone and regenerate identically in meaning after reorganization. Maintain an easy path to assumptions from README.

Remove only demonstrably disposable caches, temporary package-install downloads, old unreferenced failed/intermediate results and obsolete throwaway tooling. Keep completed study evidence, current application acceptance evidence, Qollab source evidence, quantum benchmark/export outputs and implementation/review provenance. Preserve prior user work and dataset bytes. Produce a cleanup inventory stating moved/deleted/retained scope and rationale. Existing dirty state means there is no new commit history to substitute for review evidence.

Before recursive delete/move, resolve every absolute target and verify it stays within Project1; use PowerShell LiteralPath end-to-end. Stop only our own app/headless QA processes before moving active source or profiles. Restart the application afterward; do not close the user's regular browser. No new external dependencies are needed.

Acceptance: unchanged dataset hashes, full Python/Node suites pass, current module CLI smoke checks succeed, quantum benchmark and standalone one-job export run, app serves and completes a fresh certified scenario, live documentation links resolve, independent review reports no consequential defect.
