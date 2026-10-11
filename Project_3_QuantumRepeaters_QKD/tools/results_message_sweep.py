"""Results table 2 of QOLLAB_README.md: the Level 6 pipeline (heralding -> encoded swap -> BBM92 -> one-time pad)
swept over noise and eavesdropping, 40 seeds per row. From the project folder:
    backend/.venv/bin/python tools/results_message_sweep.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "src"))
import json
from quantum_bros import api
from quantum_bros.backends.stim_backend import StimBackend
api.SIMULATOR_FACTORY = StimBackend
SEEDS = range(40)

def sweep(p, turtles):
    key_bits = mismatches = aborts = exact = 0
    for seed in SEEDS:
        r = json.loads(api.handle(None, "/api/send", json.dumps({"sender": "mario", "kind": "encrypted", "text": "QUANTUM!",
                                                                 "seed": seed, "physical_error": p, "turtles_on": turtles})))
        k = r["qkd"]
        aborts += k["is_aborted"]
        key_bits += len(k["alice_key"])
        mismatches += k["key_mismatches"]
        exact += (not k["is_aborted"]) and r["text_received"] == "QUANTUM!"
    n = len(SEEDS)
    return mismatches / max(key_bits, 1), key_bits / n, aborts / n, exact / n

print("p       turtles  key_error  key_bits  abort  delivered_exact")
for p in [0.0, 0.001, 0.005, 0.01, 0.02, 0.05]:
    e, b, a, x = sweep(p, False)
    print(f"{p:<7} off      {e:.4f}     {b:6.1f}    {a:.2f}   {x:.2f}")
for p in [0.0, 0.001]:
    e, b, a, x = sweep(p, True)
    print(f"{p:<7} on       {e:.4f}     {b:6.1f}    {a:.2f}   {x:.2f}")
