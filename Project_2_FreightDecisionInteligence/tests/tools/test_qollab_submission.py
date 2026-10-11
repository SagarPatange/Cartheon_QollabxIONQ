"""Portable package keeps the full simulator and runs one real freight comparison."""

import json
import os
import subprocess
import sys
import zipfile

from build_qollab_submission import build_package


def test_submission_has_visual_entrypoint_small_text_files_and_a_real_quantum_run(tmp_path):
    archive = build_package(tmp_path)
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert len(package.namelist()) <= 100
        assert {"index.html", "main.js", "main.css", "README.md", "LICENSE"} <= set(package.namelist())
        assert all(info.file_size < 2_000_000 for info in package.infolist())
        package.extractall(tmp_path / "unpacked")
    script = '''
import json
from qollab_app import bridge
from qiskit.providers.basic_provider import BasicSimulator
result = json.loads(bridge.quantum_compare(BasicSimulator(), "2022-03-07", 1, "profit", 64))
assert len(result["oracle"]["entries"]) == 2 ** result["oracle"]["n_bits"]
assert set(result["comparison"]["methods"]) == {"uniform", "one_bit_search", "qaoa"}
assert all(sum(m["counts"].values()) == 64 for m in result["comparison"]["methods"].values())
print(json.dumps({"bits": result["oracle"]["n_bits"], "methods": result["comparison"]["methods"]}))
'''
    environment = dict(os.environ)
    environment.pop("PYTHONPATH", None)
    completed = subprocess.run([sys.executable, "-c", script], cwd=tmp_path / "unpacked",
                               env=environment, capture_output=True, text=True, timeout=180)
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout)["bits"] > 0
