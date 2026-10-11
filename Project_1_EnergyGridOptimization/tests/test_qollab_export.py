"""Portable Qollab package execution and one-job contract."""
import ast
import contextlib
import io
import json
import os
import runpy
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from qiskit import QuantumCircuit
from qiskit.providers.basic_provider import BasicSimulator
from qiskit.quantum_info import Statevector

from quantum.qaoa import build_qaoa
from quantum.qollab_export import export_package, run_exported_entry


ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / 'results' / 'quantum-development' / 'temp'


class ExportTests(unittest.TestCase):
    def test_package_is_small_synthetic_and_entry_uses_one_backend_job(self):
        TEMP.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TEMP) as directory:
            bundle = export_package(Path(directory) / 'upload')
            package = Path(bundle['directory'])
            main = (package / 'main.py').read_text()
            definitions = [node for node in ast.parse(main).body
                           if isinstance(node, ast.FunctionDef) and node.name == 'main']
            self.assertEqual(len(definitions), 1)
            self.assertTrue(main.splitlines()[definitions[0].lineno - 1].startswith('def main('))
            self.assertTrue(main.splitlines()[definitions[0].lineno - 1].endswith('):'))
            self.assertEqual([arg.arg for arg in definitions[0].args.args],
                             ['shots', 'seed', 'startup_cost', 'depth', 'restarts', 'maxiter'])
            self.assertNotIn('main()', main)
            self.assertIn("open('data/oracle_low.json'", main)
            self.assertIn("open('data/oracle_high.json'", main)
            upload_guide = (package / 'README.md').read_text()
            self.assertIn('Unpack', upload_guide)
            self.assertIn('Keep and add', upload_guide)
            self.assertIn('top level', upload_guide)
            self.assertIn('project write-up', upload_guide)
            with zipfile.ZipFile(bundle['archive']) as archive:
                names = set(archive.namelist())
                self.assertIn('main.py', names)
                self.assertIn('README.md', names)
                self.assertIn('LICENSE', names)
                self.assertTrue(all(info.file_size < 2_000_000 for info in archive.infolist()))
                self.assertFalse(any('DA-' in name or 'server' in name or '.venv' in name for name in names))
            class Guard:
                def __init__(self):
                    self.calls = 0
                    self.simulator = BasicSimulator()
                def run(self, circuit, shots):
                    self.calls += 1
                    if self.calls != 1:
                        raise AssertionError('second backend job')
                    if not isinstance(circuit, QuantumCircuit):
                        raise AssertionError('IonQ accepts one QuantumCircuit, not a list')
                    self.assertion_circuit = circuit
                    return self.simulator.run(circuit, shots=shots)
            guard = Guard()
            printed = io.StringIO()
            with contextlib.redirect_stdout(printed):
                output = run_exported_entry(package, guard, shots=32, seed=4,
                                            startup_cost=10., depth=1, restarts=1, maxiter=6)
            self.assertEqual(json.loads(printed.getvalue()), output)
            self.assertEqual(guard.calls, 1)
            self.assertEqual(guard.assertion_circuit.num_qubits, 8)
            self.assertEqual(guard.assertion_circuit.num_clbits, 8)
            self.assertEqual([instruction.operation.name for instruction in guard.assertion_circuit.data[-8:]],
                             ['measure'] * 8)
            self.assertEqual(output['scope'], 'synthetic_tiny_commitment')
            self.assertEqual(output['oracle']['best_objective_dollars'], 410.)
            self.assertEqual(sum(output['joint_counts'].values()), 32)
            for method in ('uniform', 'qaoa'):
                self.assertEqual(sum(output['methods'][method]['counts'].values()), 32)
                self.assertEqual(output['methods'][method]['score']['shots'], 32)
            self.assertGreater(output['timing']['preparation_seconds'], 0)
            json.dumps(output, allow_nan=False)
            portable = '''import json,runpy
from qiskit.providers.basic_provider import BasicSimulator
import quantum.qaoa
class Guard:
    calls=0
    def run(self,circuit,shots):
        self.calls+=1
        if self.calls!=1: raise RuntimeError('second job')
        if not isinstance(circuit,quantum.qaoa.QuantumCircuit): raise TypeError('single circuit required')
        return BasicSimulator().run(circuit,shots=shots)
guard=Guard()
entry=runpy.run_path('main.py',init_globals={'backend':guard})
result=entry['main'](shots=16,seed=3,depth=1,restarts=1,maxiter=6)
print(json.dumps({'calls':guard.calls,'module':quantum.qaoa.__file__,'best':result['oracle']['best_objective_dollars']}))
'''
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', TEMP=str(TEMP), TMP=str(TEMP))
            process = subprocess.run([sys.executable, '-c', portable], cwd=package,
                                     capture_output=True, text=True, env=env, check=True)
            isolated = json.loads(process.stdout.splitlines()[-1])
            self.assertEqual(isolated['calls'], 1)
            self.assertEqual(isolated['best'], 410.)
            self.assertTrue(Path(isolated['module']).resolve().is_relative_to(package.resolve()))

    def test_joint_counts_marginalize_asymmetric_bitstrings_and_reject_bad_input(self):
        TEMP.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TEMP) as directory:
            package = Path(export_package(Path(directory) / 'upload')['directory'])
            namespace = runpy.run_path(str(package / 'main.py'))
            split = namespace['_split_counts']
            uniform, qaoa = split({'10100001': 3, '01010111': 2}, width=4, shots=5)
            self.assertEqual(uniform, {'0001': 3, '0111': 2})
            self.assertEqual(qaoa, {'1010': 3, '0101': 2})
            uniform, qaoa = split({'10100001': 3, '01010001': 2}, width=4, shots=5)
            self.assertEqual(uniform, {'0001': 5})
            self.assertEqual(qaoa, {'1010': 3, '0101': 2})
            for counts, shots in (({'1010001': 5}, 5), ({'1010000x': 5}, 5),
                                  ({'10100001': 4}, 5), ({'10100001': -1}, 5),
                                  ({'10100001': 5.0}, 5), ({'10100001': 0}, 0)):
                with self.subTest(counts=counts, shots=shots), self.assertRaises(ValueError):
                    split(counts, width=4, shots=shots)

    def test_single_joint_circuit_has_independent_ideal_statevector_marginals(self):
        TEMP.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TEMP) as directory:
            package = Path(export_package(Path(directory) / 'upload')['directory'])
            namespace = runpy.run_path(str(package / 'main.py'))
            oracle = json.loads((package / 'data' / 'oracle_low.json').read_text())
            angles = [0.37, 0.22]
            circuit = namespace['_joint_circuit'](oracle, angles)
            self.assertEqual((circuit.num_qubits, circuit.num_clbits), (8, 8))
            self.assertEqual([inst.operation.name for inst in circuit.data[-8:]], ['measure'] * 8)
            probabilities = Statevector.from_instruction(circuit.remove_final_measurements(inplace=False)).probabilities()
            qaoa_probabilities = Statevector.from_instruction(build_qaoa(oracle, angles, measured=False)).probabilities()
            for upper in range(16):
                for lower in range(16):
                    self.assertAlmostEqual(probabilities[(upper << 4) | lower], qaoa_probabilities[upper] / 16)


if __name__ == '__main__':
    unittest.main()
