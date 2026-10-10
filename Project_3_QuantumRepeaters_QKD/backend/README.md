# Quantum Bros backend

Stim-backed simulator for World 1-K: QRE-CEC logical Bell pairs, BBM92 QKD on them, and three ways to send a
message. `POST /api/send` runs one message and returns the steps the page animates.

```sh
.venv/bin/pip install -e '.[dev]'
.venv/bin/python -m uvicorn quantum_bros.server:app --port 8001
.venv/bin/python -m pytest -q && .venv/bin/ruff check src tests
```

No `__init__.py` files: folders are namespace packages.

| File | What it does |
|---|---|
| `src/quantum_bros/backends/quantum_backend.py` | `QuantumBackend` Protocol every simulator implements |
| `src/quantum_bros/backends/stim_backend.py` | `StimBackend`: seeded `stim.TableauSimulator` |
| `src/quantum_bros/protocol/noise.py` | `NoiseModel` error probabilities, `make_uniform_noise` |
| `src/quantum_bros/protocol/steane.py` | Verified \|0̄⟩/\|+̄⟩ encoding, logical Paulis, logical measurement and decoding |
| `src/quantum_bros/protocol/qre_cec.py` | Qubit layout and the five QRE-CEC phases for one Alice–David pair |
| `src/quantum_bros/protocol/network.py` | One run: backend, noise, generator, tap fraction and pair statistics |
| `src/quantum_bros/protocol/qkd.py` | BBM92: random bases, sifting, sampled QBER check, key |
| `src/quantum_bros/protocol/messaging.py` | Classical, encrypted and quantum (teleported) messages |
| `src/quantum_bros/protocol/steps.py` | Turns a result into the `{phase, title, detail}` animation steps |
| `src/quantum_bros/api_models.py` | Pydantic request/response models (422 on bad input) |
| `src/quantum_bros/server.py` | FastAPI app; serves only the game pages and their `src/` and `styles/` from `../game/` |
| `tests/` | pytest, mirroring `src/` |

A seed fixes both Stim's random stream and the classical `random.Random`, so the same request gives the same
response. Stim is pinned for that reason.
