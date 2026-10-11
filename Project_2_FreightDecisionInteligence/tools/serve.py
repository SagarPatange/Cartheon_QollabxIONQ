"""Local development server: the page's files, plus /api/simulate to run one week of the simulator.

Run from the project folder:
    python tools/serve.py            # then open http://localhost:8022

GET /api/simulate?start=2022-03-07&policy=milp&objective=service&seed=1 returns the replay JSON
(freight_sim/replay.py). GET /api/compare?start=2022-03-07&seed=1 returns one row of totals per policy and objective
for that week.
On Qollab there is no server; the page calls the same Python function through the runtime instead.
"""

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from freight_sim.replay import compare_objectives, parse_simulation_request, simulate_week  # noqa: E402

PORT = 8022
SIMULATE_PATH = "/api/simulate"
COMPARE_PATH = "/api/compare"


class DispatchRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        # A development server: the browser must never keep an old copy of the page's files, or a page and a server
        # from different versions meet (as on 2026-10-10, "Cannot read properties of undefined").
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        url = urlsplit(self.path)
        if url.path not in (SIMULATE_PATH, COMPARE_PATH, "/api/quantum"):
            super().do_GET()
            return
        try:
            start_date, policy_name, objective_key, seed = parse_simulation_request(url.query)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        if url.path == "/api/quantum":
            try:
                from qiskit.providers.basic_provider import BasicSimulator
                from qollab_app.bridge import prepare_oracle
                from freight_sim.quantum.comparison import run_comparison
                oracle = prepare_oracle(start_date, seed, objective_key)
                result = run_comparison(BasicSimulator(), oracle, shots=256, seed=2026, depth=1, restarts=1, maxiter=40)
                self.send_json(200, {"oracle": oracle, "comparison": result})
            except ImportError as error:
                self.send_json(500, {"error": "Quantum dependencies are unavailable in the server's Python environment. "
                                "Install requirements-local.txt with that Python, then restart tools/serve.py. "
                                f"Details: {error}"})
            except Exception as error:
                self.send_json(500, {"error": str(error)})
            return
        if url.path == COMPARE_PATH:
            self.send_json(200, {"start_date": start_date, "seed": seed, "runs": compare_objectives(start_date, seed)})
            return
        self.send_json(200, simulate_week(start_date, policy_name, seed, objective_key))

    def send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), DispatchRequestHandler)
    print(f"Serving on http://localhost:{PORT}")
    server.serve_forever()
