"""Local development server: the page's files, plus /api/simulate to run one week of the simulator.

Run from the project folder:
    python tools/serve.py            # then open http://localhost:8022

GET /api/simulate?start=2022-03-07&policy=greedy&seed=1 returns the replay JSON (freight_sim/replay.py).
On Qollab there is no server; the page calls the same Python function through the runtime instead.
"""

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from freight_sim.replay import parse_simulation_request, simulate_week  # noqa: E402

PORT = 8022
SIMULATE_PATH = "/api/simulate"


class DispatchRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        url = urlsplit(self.path)
        if url.path != SIMULATE_PATH:
            super().do_GET()
            return
        try:
            start_date, policy_name, seed = parse_simulation_request(url.query)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        self.send_json(200, simulate_week(start_date, policy_name, seed))

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
