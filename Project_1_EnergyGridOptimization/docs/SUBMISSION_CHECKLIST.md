# Qollab × IonQ submission checklist

Checked October 11, 2026 against the owner's supplied submission-video transcript, previously collected [official terms](https://qollab.xyz/programs/hackathon/terms), existing implementation and recorded execution evidence. Deadline stated in the transcript: **October 11, 2026, 7 PM Eastern / 6 PM America/Chicago**. This checklist does not claim publication or submission has occurred.

| Requirement | Evidence / remaining action |
| --- | --- |
| Use Qiskit | Covered: Qiskit circuit construction and execution in the portable upload. |
| Run on free Qollab simulators | Owner-reported successful Forte-1 simulator run; pasted marginal counts and scores checked against the original oracle. |
| Judges can press Run on a free local simulator | Standalone package already passed local BasicSimulator execution. **Still record one run using Qollab's built-in local simulator** before publishing; no additional backend benchmarking needed. |
| Runnable entry and dependencies | Covered: root `main.py`, `requirements.txt`, synthetic data and quantum module in the upload. |
| MIT project | MIT LICENSE included in the portable package. Original SPP datasets/reference materials are excluded from MIT and from that upload. |
| Beginner-readable project page: problem, behavior and instructions | Packaged README covers behavior/instructions. **Confirm the public write-up contains them**; uploading into an existing project skips README import. Explain the energy-market motivation and synthetic test scope. |
| Disclose starting code/templates/forks/AI and credit sources | Source starting point and Qiskit/NumPy/SciPy appear in the packaged README. **Add explicit AI assistance disclosure** and a link to the source repository on the page. Clearly distinguish starting code from contributions made during the hackathon. |
| Support attribution | Covered in packaged README: **This effort is supported by Qollab & IonQ.** Confirm it also appears on the project page. |
| Public 2–3 minute demo video, no sign-in | **Not supplied or verified.** Record/upload and add a publicly accessible link. |
| Publish on Qollab before deadline | **Not verified.** Publish the intended runnable version under MIT and confirm its public visibility. |
| Select a theme | Intended theme: **Quantum Impact**. Select it in the submission form. |
| Captain submits from registration page | **Not verified.** Submit the published project and video link, then retain the confirmation. Publication alone is not submission. |
| Maximum five projects; edits until deadline | Taken into account; this project occupies one entry. Finish edits before the stated deadline. |
| Eligibility, originality and award conditions | Read in the prior terms research. Captain must confirm team-specific eligibility, truthful contribution disclosure and registration details. |

## Page disclosure text to include

> This project builds on the classical Energy Grid Optimization code in https://github.com/SagarPatange/Cartheon_QollabxIONQ. Development used AI assistance through OpenAI Codex for implementation, documentation and review. The quantum experiment uses Qiskit, NumPy and SciPy. The portable demo uses synthetic scheduling data; original public SPP datasets used in the broader classical study retain their own rights and are not relicensed under MIT or included in this upload. Starting code and changes contributed during the hackathon should be identified accurately in the project write-up. This effort is supported by Qollab & IonQ.

## Judging presentation

Use **Quantum Impact** and explain the concrete research question: can a bounded quantum candidate generator help explore energy-resource commitment decisions while a classical model checks cost and feasibility?

The owner-reported Forte-1 trial found the $410 minimum with both methods. QAOA sampled optimal schedules 480/1,024 times (46.875%), versus uniform 259/1,024 (25.293%). It produced 740 feasible samples versus 576. This is a higher optimal-hit frequency in one simulator trial, **not demonstrated cost savings, speedup or physical-hardware performance**. Preparation enumerated 16 original-model LP solves; QAOA tuning used 240 classical statevector evaluations. The uploaded demo is a four-decision synthetic test, not a reproduction of SPP market clearing.

For novelty/creativity and technical execution, show the commitment encoding, exact objective/certificate link, equal-shot comparator and feasibility checks rather than presenting a generic QAOA tutorial. For impact potential, explain the actual day-ahead scheduling problem and what would be needed to scale. For documentation, include settings, bit ordering, expected $410 result, limitations, credits and reproducible instructions. IonQ hardware results are unnecessary for the judging process described in the transcript.

Suggested 2–3 minute demo: briefly introduce the energy-market problem; show the classical control cabinet and declared model assumptions; run the Qollab local-simulator demo; explain cost, optimal-hit frequency and feasibility; finish with limitations and the next research step. Clearly identify the local cabinet and the separate portable Qollab experiment.

No additional solver suite, hardware run, paid job or overlapping code review is required by this checklist.
