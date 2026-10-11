"""Build and locally exercise a synthetic, browser-portable Qollab upload."""
import json
import runpy
import shutil
import zipfile
from pathlib import Path

from quantum.subproblem import build_subproblem


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / 'data' / 'commitment_benchmark.json'
DECISIONS = [(0, 'cheap'), (0, 'local'), (1, 'cheap'), (1, 'local')]


ENTRY = '''"""Qollab auto-calls main and injects its selected backend."""
import json
import time

from qiskit import QuantumCircuit
from quantum.qaoa import build_qaoa, score_counts, tune_qaoa


class _OneJob:
    def __init__(self, supplied):
        self.supplied = supplied
        self.calls = 0

    def run(self, circuit, *, shots):
        self.calls += 1
        if self.calls != 1:
            raise RuntimeError('Qollab permits exactly one backend job per code run')
        if not isinstance(circuit, QuantumCircuit):
            raise ValueError('Submit one joint QuantumCircuit to the IonQ backend')
        return self.supplied.run(circuit, shots=shots)


def _joint_circuit(oracle, parameters):
    width = oracle['n_bits']
    if width != 4:
        raise ValueError('This portable comparison requires the supplied four-bit oracle')
    circuit = QuantumCircuit(2 * width, 2 * width)
    circuit.h(range(width))
    circuit.compose(build_qaoa(oracle, parameters, measured=False),
                    qubits=range(width, 2 * width), inplace=True)
    circuit.measure(range(2 * width), range(2 * width))
    return circuit


def _split_counts(counts, *, width, shots):
    if type(width) is not int or width < 1 or type(shots) is not int or shots < 1 or not isinstance(counts, dict):
        raise ValueError('Require positive width and shots and complete joint counts')
    uniform, qaoa = {}, {}
    total = 0
    for bits, frequency in counts.items():
        if not isinstance(bits, str) or len(bits) != 2 * width or set(bits) - {'0', '1'}:
            raise ValueError('Malformed joint bitstring')
        if type(frequency) is not int or frequency < 0:
            raise ValueError('Joint counts must be nonnegative integers')
        total += frequency
        low, high = bits[width:], bits[:width]
        uniform[low] = uniform.get(low, 0) + frequency
        qaoa[high] = qaoa.get(high, 0) + frequency
    if total != shots:
        raise ValueError('Joint counts total does not match requested shots')
    return uniform, qaoa


def main(shots: int = 1024, seed: int = 2026, startup_cost: float = 10.0, depth: int = 2, restarts: int = 3, maxiter: int = 80):
    if type(shots) is not int or shots < 1:
        raise ValueError('shots must be a positive integer')
    if startup_cost == 10.0:
        with open('data/oracle_low.json', encoding='utf-8') as handle:
            oracle = json.load(handle)
    elif startup_cost == 1000.0:
        with open('data/oracle_high.json', encoding='utf-8') as handle:
            oracle = json.load(handle)
    else:
        raise ValueError('startup_cost must be 10.0 or 1000.0 for the supplied synthetic cases')
    tuning = tune_qaoa(oracle, depth=depth, seed=seed, restarts=restarts, maxiter=maxiter)
    circuit = _joint_circuit(oracle, tuning['parameters'])
    guarded = _OneJob(backend)
    started = time.perf_counter()
    joint_counts = guarded.run(circuit, shots=shots).result().get_counts()
    execution_seconds = time.perf_counter() - started
    uniform_counts, qaoa_counts = _split_counts(joint_counts, width=oracle['n_bits'], shots=shots)
    methods = {name: dict(counts=counts, score=score_counts(oracle, counts, shots=shots))
               for name, counts in (('uniform', uniform_counts), ('qaoa', qaoa_counts))}
    output = dict(scope='synthetic_tiny_commitment', remote_execution='this run only if executed by Qollab',
                  startup_cost_dollars=startup_cost, shots=shots, seed=seed,
                  circuit_layout='8 qubits: low four uniform, high four QAOA; one single-circuit job',
                  joint_counts=joint_counts,
                  oracle=dict(source_sha256=oracle['source_sha256'], n_bits=oracle['n_bits'],
                              decisions=oracle['decisions'], best_objective_dollars=oracle['best_objective_dollars'],
                              penalty_dollars=oracle['penalty_dollars']),
                  tuning=tuning, methods=methods,
                  timing=dict(preparation_seconds=oracle['timing']['preparation_seconds'],
                              preparation_pricing_evaluations=oracle['timing']['pricing_evaluations'],
                              tuning_seconds=tuning['tuning_seconds'], execution_seconds=execution_seconds),
                  disclosure='Oracle prepared classically with 16 original-model LP solves; no scalable advantage claim. Disjoint ideal blocks can show correlated outcomes under physical noise.')
    print(json.dumps(output, allow_nan=False))
    return output
'''


def export_package(output_dir=None):
    """Write only declared synthetic files and a flat upload ZIP."""
    folder = Path(output_dir or PROJECT / 'results' / 'quantum-export' / 'upload')
    data = folder / 'data'
    quantum = folder / 'quantum'
    data.mkdir(parents=True, exist_ok=True)
    quantum.mkdir(parents=True, exist_ok=True)
    source = json.loads(SOURCE.read_text())
    files = []
    for startup, name in ((10, 'low'), (1000, 'high')):
        case = json.loads(json.dumps(source))
        case['units'][0]['commitment']['startup_cost_dollars'] = startup
        case_path = data / f'case_{name}.json'
        case_path.write_text(json.dumps(case, indent=2) + '\n')
        oracle = build_subproblem(case_path, [[0, 1], [0, 1]], DECISIONS)
        oracle['source_path'] = f'data/case_{name}.json'
        (data / f'oracle_{name}.json').write_text(json.dumps(oracle, indent=2, allow_nan=False) + '\n')
        files.extend([case_path, data / f'oracle_{name}.json'])
    (folder / 'main.py').write_text(ENTRY)
    shutil.copyfile(PROJECT / 'quantum' / 'qaoa.py', quantum / 'qaoa.py')
    (quantum / '__init__.py').write_text('"""Portable finite-oracle QAOA support."""\n')
    (folder / 'requirements.txt').write_text('qiskit>=2.5.2,<3.0.0\nnumpy\nscipy\n')
    (folder / 'README.md').write_text(
        '# Synthetic commitment QAOA benchmark\n\n'
        'To add this package to an existing Qollab project, use Code > Files > Browse and select '
        '`qollab-upload.zip`. Choose **Unpack**, then **Keep and add**. Check that `main.py` and '
        '`requirements.txt` are at the top level, beside `data/` and `quantum/`; if `main.py` appears '
        'inside another folder, the runtime will not detect it. Existing-project ZIP uploads skip '
        '`README.md`, so paste this text into the project write-up separately.\n\n'
        'Expected project root after Unpack:\n\n'
        '```text\nmain.py\nrequirements.txt\ndata/\nquantum/\n```\n\n'
        'This upload tests four binary on/off choices for two named synthetic units over two intervals. '
        'The classical oracle contains all 16 schedules, prepared by the original fixed-commitment optimizer '
        'and certified before packaging. Choose the free simulator and run `main.py`; Qollab injects `backend` '
        'and auto-calls `main`. Its optional controls are `shots`, `seed`, `startup_cost` (10.0 or 1000.0), '
        '`depth`, `restarts`, and `maxiter`. One eight-qubit circuit places uniform choices on '
        'the low four bits and tuned QAOA choices on the high four bits. A single backend job '
        'returns joint counts; the program reports both four-bit marginals in plain JSON. '
        'The disjoint ideal blocks can have correlated measured outcomes under physical noise.\n\n'
        'Oracle preparation uses 16 classical LPs per case, while statevector QAOA tuning is local; '
        'neither cost is a quantum speedup. `timing` discloses preparation and tuning. '
        'Counts are selected against original-objective entries without repair. The case and oracle files are '
        'synthetic and contain no SPP data. Source began in the Energy Grid Optimization project; '
        'the portable quantum code and this package are MIT licensed. The project uses Qiskit, NumPy and SciPy. '
        'This effort is supported by Qollab & IonQ.\n')
    license_path = PROJECT.parent / 'LICENSE'
    if not license_path.exists():
        raise FileNotFoundError('Repository MIT license is required for the upload')
    shutil.copyfile(license_path, folder / 'LICENSE')
    files.extend([folder / 'main.py', quantum / 'qaoa.py', quantum / '__init__.py',
                  folder / 'requirements.txt', folder / 'README.md', folder / 'LICENSE'])
    for file in files:
        if file.stat().st_size >= 2_000_000:
            raise ValueError(f'Qollab file exceeds 2 MB: {file}')
    archive = folder.parent / 'qollab-upload.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for file in files:
            package.write(file, file.relative_to(folder).as_posix())
    return dict(directory=str(folder), archive=str(archive), files=[str(file.relative_to(folder)) for file in files])


def run_exported_entry(package_dir, backend, **parameters):
    """Execute uploaded main.py locally with an injected backend."""
    import os
    previous = Path.cwd()
    try:
        os.chdir(package_dir)
        namespace = runpy.run_path('main.py', init_globals={'backend': backend})
        return namespace['main'](**parameters)
    finally:
        os.chdir(previous)


def main():
    print(json.dumps(export_package(), indent=2))


if __name__ == '__main__':
    main()
