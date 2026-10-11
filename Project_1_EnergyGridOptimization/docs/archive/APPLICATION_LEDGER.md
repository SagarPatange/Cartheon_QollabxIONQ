# SDD ledger - plan: APPLICATION_PLAN.md

Design and plan approved October 10, 2026 (America/Chicago); user selected separate implementation/review agents. Baseline 80 tests pass; Node v24.18.0 available. Existing branch energy-grid-plan and pre-existing dirty project work preserved. No application implementation at baseline.

## Setup rulings

- Ruling: use the existing project folder and dedicated branch, as explicitly specified in the approved plan, instead of another worktree. Why: all project artifacts must remain in this folder, and the solver inputs/environment and prior uncommitted work are here. Cost if wrong: no second working-directory isolation; scope checks and sequential implementers limit conflict.
- Ruling: use project-local results/application-development for task briefs, snapshots and review packages, with this permanent ledger, instead of repo-root shell/commit-based skill scripts. Why: Windows/project-only/no-commit scope. Cost if wrong: file snapshot diffs and explicit evidence must replace commit-range provenance; temporary review files remain ignored, permanent decisions remain here.

## Pre-flight interface/conflict scan

| Tasks | Producer / consumer or consistency | Result |
| --- | --- | --- |
| 1 | Default controls, validation and scenario transforms vs explicit bounds/tests | Consistent; validate capacity against unchanged minimum/initial/reserve fields |
| 2 | Real solver outputs vs objective/certificate tests | Consistent; exact block offers, no approximations |
| 3 | Lifecycle API/server vs HTTP and serialized-job tests | Consistent; one worker, bounded errors |
| 4 | Browser state/diagram vs minimal-text analog and actual results | Consistent; view hour separate from input revision |
| 5 | Runtime/audits/review vs complete design | Consistent; no commit/push/quantum |
| 1-2 | scenario dict -> saved loader inputs and solver | Consistent; exact fields from approved schema |
| 1-3 | config/control validation -> HTTP submission | Consistent; no browser-supplied file paths |
| 1-4 | default controls/domains -> browser controls | Consistent; units/branches named by existing IDs |
| 2-3 | solve_scenario -> serialized result data | Consistent; only verified completion accepted |
| 2-4 | actual scenario/commitment/pricing -> rendered physical overlay | Consistent; include explicit nodes/unit mappings |
| 3-4 | revision-tagged jobs -> polling/stale protection | Consistent; unknown or older revisions cannot replace current |
| 1-5 | assumptions/controls -> full coverage audit | Consistent; all supported controls must be verified |
| 2-5 | saved reports/certificates -> independent artifact reload | Consistent; original parameter checks reused |
| 3-5 | local server/launcher -> real runtime verification | Consistent; loopback, no shared deployment |
| 4-5 | rendered layout/state -> browser/screenshots/accessibility checks | Consistent; screenshot alone cannot establish functional completion |

## Task status

Task 1: complete (file snapshot review clean; 22 new tests, 102 full tests).
Task 2: complete (15 focused tests, 117 full tests; scoped fix review clean).
Task 3: complete (15 focused tests, 132 full tests; scoped fix review clean).
Task 4: complete (7 state regressions; real default/edited/fault runs, keyboard/narrow checks; task review approved).
Task 5: complete (136 Python tests, 7 state tests; independent reloads, final review and scoped fix review clean).

Task 1 capacity interpretation - Ruling: startup/shutdown ramp capabilities are upper limits, not minimum output requirements. Retain them when capacity falls; reject capacity below fixed minimum/initial/reserve eligibility. Why: physical consistency and useful capacity controls. Cost if wrong: alternative UI policy would require rework, not a changed hidden feasible set. Sparse line overrides {} preserve global scaling. Explicit application_controls metadata carries reserve-mode intent into saved scenarios.

Browser verification: CUA kernel failed to initialize. Default-sandbox Chrome renderer/GPU processes failed with access-denied errors; automatic review approved escalation for headless local Chrome. Browser PID 17524, exec session 52979, debug endpoint 127.0.0.1:9227 responds as Chrome155. Profile stays under ignored project results. Use local CDP for rendered/runtime checks without additional dependencies.

Task 1 reviewer: spec compliant, task quality approved. Minor deferred: unittest stderr captured through PowerShell Tee-Object has misleading NativeCommandError formatting despite exit0/OK; subsequent task logs should use direct subprocess stream capture. Registration ordering: APP assumptions were written before implementation/use per implementer report and observed task progression; baseline/isolation are controller-owned in this ledger. Later solver/runtime/style checks belong to Tasks2-5.

Task 2: fix round 1/5 started - important acceptance gap: finite but inconsistent/open MILP bound/gap and null/fractional status/node metadata could be accepted. Reviewer focused reproduction returned complete with gap0.75 and an invalid lower bound. Reproduce, tighten exact-result acceptance, rerun covering tests; no core mathematics change requested.

Task 2: fix round 1/5 complete (1 addressed, 0 open). Exact current HiGHS optimal status, nonnegative integer node count, non-Boolean gap <=1e-9 and objective/bound closure now required. No completed report on rejection; scoped re-review approved with no new breakage. Future Task3 integration cannot be verified yet and is explicitly owned by the next task.

Task3 recovery: original application_server agent ended with usage-limit error before creating any task-owned source/test files. Current disk inspected (only Task1/2 application files, no Task3report); no live server/task3 implementation existed to resume. Fresh implementer application_server_recovery on available standard model receives identical approved brief/interfaces. No completed task was restarted.

Task3 review fix round1 started: incomplete acceptedPOST blocks subsequentrequests; malformedOrigin and deeplynestedJSON escape structurederrors; defaultlauncher may mistakepreexistingapp for its own newlyspawnedserver. Concrete reviewer reproductions; route all findings to original replacementimplementer, no controllercodefix. Controller localserver pre-fix: session57844, 127.0.0.1:8765; restartafterfix beforeUI verification.


Task3 fix round1/5 complete: all3 addressed,0 open; scoped reviewer found no new blocker. Successful browser opening belongs to Tasks4-5. Stopped pre-fix server57844; restart fixed source for UI verification.


Task4 reviewer approved spec and quality. Controller viewed final desktop screenshot: populated inspector and actual costs; narrow screenshot controls readable, trace then corrected and reviewed. Cannot-verify cross-task items resolved by Task1-3 reviewed code/reports, controller observed APP04 registration before diagram implementation, no commits/push/quantum actions performed. Minor deferred: cabinet.css long rule lines affect maintenance readability; final reviewer to triage. Final Task5 independently reloads outputs/full control coverage.
Fixed server live session38107 on8765; Chrome52979/PID17524 on9227. Task4 evidence in results/application-development/task-4-report.md.

Task5 controller launch verification: direct ps1 invocation blocked by host script policy; process-scoped powershell.exe -NoProfile -ExecutionPolicy Bypass -File worked through child readiness but sandbox denied opening URL. Automatic review approved same launch outside sandbox. Successful default-browser path from workspace parent on port8766: session18166, ownchild startup acknowledged, index200 and4units/9buses confirmed. No persistent execution-policy change. Keep app live8766; server8765 remains QA only until review finishes.

Final review: important confirmed idle/header TCP connection blocks synchronous HTTPServer before POST timeout. QA readonlyprobeGET timedout3.11sec untilidleclosed. One final fixwave assigned server concurrency + early sockettimeouts + bounded shutdown + regression; preserve serialized solverworker. Minor CSS compressedrules and expected clientdisconnect tracebacks included samewave. Declined-to-judge accepted: oldclassicalscope separatelyreviewed; realSPP/quantum/cloud/sessionrestore excluded; narrowinternalscroll documented usable; rawPowerShellwrapper supersededcleanlogs. All registration/noexternalactions history controllerobserved.


Final fixwave complete: important idle/header stall + minor CSSformat + minor expectedreset/brokenpipe logs all3 addressed,0 open; scopedreview clean. Full136Python passed,7unchangedstate tests apply. Controller stopped oldQA38107 andoldlauncher18166; restarted fixeduserlauncher session17581 on8766. Final live idle+partialheader bothopen: config200/.0916sec,cabinet200/.0027sec,bothclients expired. FreshactualUI solve2d32c7674be34a7c953b85417c24e154 VERIFIED cost82039.2757548886, certificatespassed, finalfixed screenshot visuallyinspected. BrowserQA52979/9227 retained. No commit/push/quantum work during application milestone. User has now authorized subsequent Qollab research/subroutine then Project1reorganization; these begin after goalcompletion.
