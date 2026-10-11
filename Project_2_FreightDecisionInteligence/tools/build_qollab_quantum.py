"""Package the quantum experiment for Qollab: main.py, the quantum modules and the cost table, in one ZIP.

Run from the project folder (after tools/build_quantum_oracle.py):
    python tools/build_qollab_quantum.py

Writes build/qollab-quantum.zip. In a Qollab project use Code → Files → Browse, pick the ZIP, choose Unpack, and check
that main.py sits at the project root next to data/ and freight_sim/.
"""

import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ORACLE_PATH = PROJECT_ROOT / "data" / "quantum" / "freight_oracle.json"
OUT_PATH = PROJECT_ROOT / "build" / "qollab-quantum.zip"
# (file in this project, path inside the ZIP). Only what main.py imports: no simulator, no data tools.
PACKAGE_FILES = [
    ("qollab_quantum/main.py", "main.py"),
    ("freight_sim/quantum/__init__.py", "freight_sim/quantum/__init__.py"),
    ("freight_sim/quantum/qaoa.py", "freight_sim/quantum/qaoa.py"),
    ("freight_sim/quantum/comparison.py", "freight_sim/quantum/comparison.py"),
]
# Qiskit is installed by Qollab; NumPy and SciPy come with Pyodide. Nothing else is needed.
REQUIREMENTS_TEXT = ""


def build_package() -> Path:
    if not ORACLE_PATH.exists():
        raise FileNotFoundError(f"{ORACLE_PATH} is missing; run tools/build_quantum_oracle.py first")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED) as package:
        for source, packaged_path in PACKAGE_FILES:
            package.write(PROJECT_ROOT / source, packaged_path)
        package.writestr("freight_sim/__init__.py", "")
        package.write(ORACLE_PATH, "data/freight_oracle.json")
        package.writestr("requirements.txt", REQUIREMENTS_TEXT)
    return OUT_PATH


if __name__ == "__main__":
    print(f"wrote {build_package()}")
