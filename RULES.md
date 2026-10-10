# Project rules

Rules every project in this repo follows during the **Qollab × IonQ Hackathon**. Part A comes from the official
terms (https://qollab.xyz/programs/hackathon/terms); breaking one of those can get the project disqualified or
scored 0. Part B is how we write code. For line-level style, see
[`Project_3_QuantumRepeaters_QKD/CODING_STYLE.md`](Project_3_QuantumRepeaters_QKD/CODING_STYLE.md).

**Deadline: Sat Oct 11, 2026, 19:00 ET.** Build window opened Fri Oct 9, 19:00 ET.

---

## Part A: Hackathon rules (required)

### A1. Quantum stack
- **Quantum circuits use Qiskit.** The terms require the Qiskit framework, and every Qollab project is a Qiskit
  project. Qollab installs `qiskit>=2.5.2,<3.0.0` automatically.
- **The project must be published and runnable on Qollab.xyz**, on Qollab's free simulators. Judges press **Run**
  on a free local simulator. Results from IonQ simulators or hardware gain or lose no points.
- **No API keys, paid accounts or outside services** are needed for a full run.

### A2. Simulators we can use
All simulators are free. Only IonQ hardware costs credits. Sources: [Qollab compute backends](https://qollab.xyz/learn/docs/compute-backends),
[IonQ noise models](https://docs.ionq.com/guides/simulation-with-noise-models), checked Oct 9, 2026.

| Backend in the Select QPU dialog | Where it runs | Max qubits | Noise | Jobs per run |
|---|---|---|---|---|
| **Built-in simulator** | Browser (WebAssembly) | 24 | Ideal | Many |
| AWS Braket local simulator | Browser | 25 | Ideal | Many |
| IBM Boston / Pittsburgh / Aachen (Heron r3) | Browser | 156 | IBM device model | Many |
| IBM Kingston / Fez / Marrakesh (Heron r2) | Browser | 156 | IBM device model | Many |
| IBM Miami / Berlin (Nighthawk r1) | Browser | 120 | IBM device model | Many |
| **IonQ Forte 1 / Forte Enterprise 1 simulator** | IonQ cloud | 29 | Forte noise model | **One** |
| IonQ Aria 1 / Aria 2 simulator | IonQ cloud | 25 | Aria model (QPU retired) | **One** |
| IonQ Forte 1 / Forte Enterprise 1 hardware | Real QPU | 36 | Real device | **One**, uses credits |

Rules that follow from this:
- **Target the built-in simulator first.** It is what judges will most likely run, starts instantly, and is ideal
  (noise-free). Keep every circuit at **24 qubits or fewer** so it runs on every free backend.
- **Never choose the backend in code.** The person pressing Run picks one, and Qollab passes it in as the global
  `backend`. Use `backend.run(...)` (Python) or `await backend.run(circuit, { shots })` (JS). Never create
  `AerSimulator()`, `IonQProvider()` or a hard-coded backend: the dialog's choice would be ignored.
- **Send one job per run** if the project should also work on IonQ: put every circuit into a single
  `backend.run([circuit_a, circuit_b, ...])` call. A second job on IonQ stops the run with an error.
- **For realistic noise, use the IonQ Forte 1 simulator** (the Aria models describe retired hardware) or an IBM
  noise-model backend. Qubit limits are maximums; circuits near 29 qubits on Forte can still fail.
- Noisy simulators slow down as shots go up. Keep the default shot count modest (e.g. 1,000) and expose it as a
  `main()` parameter.

### A3. Qollab runtime limits
Code runs **in the browser** (Pyodide for Python, the page for JS). Only remote IonQ jobs run on a server. Source:
[Qollab runtime environment](https://qollab.xyz/learn/docs/runtime-environment).
- **Entry point:** a top-level `main.py` (Python, output to console) or `index.html` + `main.js` (JS page; can call
  Python modules via `.callPromising`). `main.css` is the only stylesheet; `<script>` tags in `index.html` don't
  run. Recent Chrome, Edge, Opera or Firefox 153+; **Safari can't run projects**.
- **No local server.** FastAPI/uvicorn backends can't run on Qollab. Network access is GET-only to CORS-enabled
  servers, and the project must still work without them.
- **Packages:** list extras in `requirements.txt` (`name==1.2.3`). Only pure-Python wheels or Pyodide builds install.
  NumPy, SciPy and Matplotlib are bundled. **Stim has no WebAssembly wheel (checked PyPI, stim 1.16.0), so Stim can't
  run on Qollab.** Use Qiskit for every circuit the judges run.
- **Files:** at most 100 files of 2 MB each. Data file paths must be plain string literals in code (no f-strings or
  `os.path.join`). JS can't read project files; read them in Python and pass the data back.
- **Nothing persists between runs.** No `localStorage`, cookies or IndexedDB. Ship any starting state as a project
  file (e.g. `states/demo.json`).
- `main()` with one-line, typed parameters (`int`, `float`, `str`, `bool`) becomes a Run settings form. Don't call
  it yourself. `input()` doesn't work.

### A4. Originality and disclosure
- **New work only.** The submission must be "substantially new work built during the hackathon window." Code
  written before Oct 9, 19:00 ET counts only as a starting point.
- **Disclose every starting point** in the project README under a `## Disclosures` section:
  - code written before the build window (which files, what they did)
  - libraries, tutorials, templates and papers used
  - AI tools used (e.g. Claude Code) and what they were used for
- Undisclosed copying, unmodified prior work, or near-copies of another team's project lead to disqualification.
  When in doubt, disclose.
- **Go beyond the tutorial.** A textbook circuit (Bell pair, BB84, teleportation) on its own can score 0 on Novelty
  and Technical Execution. Every project needs a part that is clearly ours.

### A5. License and attribution
- **All our code and docs are MIT** (`LICENSE` at the repo root). Do not add a file under another license.
- **Any outside repo the project relies on must be MIT-licensed**, "such as a frontend or backend hosted
  elsewhere" (terms). This covers our own repos outside Qollab (e.g. this GitHub repo), not installed packages like
  Qiskit (Apache-2.0). Still list every package and its license in `## Disclosures`.
- **Every project page and README includes, word for word:**
  > This effort is supported by Qollab & IonQ.

### A6. Accessibility (UI)
The terms require accessibility best practices. For every page in `game/`:
- Everything can be done with the keyboard alone, and the focused element is visible.
- Each canvas or image has a text alternative (`aria-label`, `alt`, or a visible text summary of the state).
- Information is never carried by color alone (D+ / D− clicks, errors, success): add a label, icon or shape.
- Text meets WCAG AA contrast (4.5:1 for body text).
- Animations respect `prefers-reduced-motion`.
- Each page has a `<title>`, `lang`, and headings in order.

### A7. Submission
Before the deadline, all of these exist:
- [ ] Project published on Qollab as a **public default version**, with its project page
- [ ] **Run** works on the built-in simulator from a fresh browser session (Chrome)
- [ ] Public demo video, **2 to 3 minutes**
- [ ] MIT license, attribution line, `## Disclosures` section
- [ ] README / project page that says what it does, which backend to pick, and what to expect

Judging weighs **Novelty & Creativity, Technical Execution, Impact Potential, and Documentation Quality** equally
in spirit: the README and docs are part of the score, not an afterthought.

---

## Part B: Engineering rules

### B1. Readability first
Follow `CODING_STYLE.md`: names that say what a thing is, functions of about 30 lines with one job, one step per
line, docstrings on every module and function, comments that say *why*, no magic numbers, no dead code.

### B2. JavaScript (`game/`)
The same ideas as the Python style guide, in JS:
- `camelCase` for variables and functions, `PascalCase` for classes, `ALL_CAPS` for constants. File names are
  `snake_case.js`, as they are now.
- ES modules only (`import`/`export`), no globals, `const` by default, `let` when it changes, never `var`.
- Each file starts with a comment saying what it is for; each exported function has a JSDoc comment.
- Keep game logic (state, rules, physics) in plain functions that tests can call without a browser; drawing and
  DOM code calls them.

### B3. Physics must be right
- Every physics claim in code or docs cites its source: a paper in `docs/` or the README references (`[1]`, `[2]`…).
- Quantum results come from the simulator, never hard-coded in the front end. The page plays back what the
  backend computed.
- Every protocol step has a test with a known answer (e.g. a noiseless Bell pair always gives correlated outcomes;
  the Steane code corrects any single-qubit error).

### B4. Reproducible results
- Every random draw comes from a seeded generator (`seeded_random.js` in the game, an explicit seed in the backend).
  The seed is shown or logged with any result.
- Pin package versions in `requirements.txt` (e.g. `qiskit==2.5.2`) so a seed gives the same result on every run.

### B5. Tests and checks pass before every commit
```sh
npm test               # game tests
npm run test:backend   # pytest + ruff
```
A red test is fixed or removed with a reason, never skipped silently.

### B6. Git
- Small commits with messages that say what changed and why.
- Commit often during the build window: the history is evidence that the work was done during the hackathon.
- No secrets, API keys or `.venv/` in the repo or the Qollab project.
