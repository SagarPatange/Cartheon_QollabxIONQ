"""Check the Qollab build in headless Chrome without Qollab.

Builds qollab_build_test/ (qollab_build/ plus an import map that maps 'quantum_bros.api' to a JS shim POSTing to the
real FastAPI server), serves it with a tiny static server that proxies /api/* to the backend, and runs
tools/qollab_browser_check.mjs, which loads every page by its hash, clicks map -> level1, and screenshots each page.

Usage: python3 tools/test_qollab_build.py [screenshot_dir] [--backend http://localhost:8011]
"""

from __future__ import annotations

import http.server
import socket
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from functools import partial
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_qollab  # noqa: E402

TEST_OUTPUT_DIR = build_qollab.PROJECT_DIR / "qollab_build_test"
DEFAULT_BACKEND = "http://localhost:8011"

SHIM_JS = """// Test-only stand-in for the Pyodide module quantum_bros.api: forwards to the FastAPI server via /api/*.
export const handle = {
    async callPromising(qpuBackend, apiPath, requestJson) {
        const response = await fetch(apiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestJson,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            return JSON.stringify({ error: String(body.detail ?? response.status), status: response.status });
        }
        return JSON.stringify(body);
    },
};
"""

TEST_HEAD = """
    <link rel="stylesheet" href="main.css">
    <script type="importmap">{"imports": {"quantum_bros.api": "./qollab_test_shim.js"}}</script>
    <script type="module" src="main.js"></script>"""


def make_handler(directory: Path, backend: str):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if not self.path.startswith("/api/"):
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", 0))
            request = urllib.request.Request(backend + self.path, data=self.rfile.read(length), method="POST",
                                             headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    status, body = response.status, response.read()
            except urllib.error.HTTPError as error:
                status, body = error.code, error.read()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return partial(Handler, directory=str(directory))


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main() -> int:
    args = sys.argv[1:]
    backend = DEFAULT_BACKEND
    if "--backend" in args:
        backend = args[args.index("--backend") + 1]
        args = [a for a in args if a not in ("--backend", backend)]
    screenshot_dir = Path(args[0]) if args else build_qollab.PROJECT_DIR / ".screenshots" / "qollab"
    build_qollab.build(TEST_OUTPUT_DIR, extra_head=TEST_HEAD, extra_files={"qollab_test_shim.js": SHIM_JS})
    port = free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), make_handler(TEST_OUTPUT_DIR, backend))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"test_qollab_build: serving {TEST_OUTPUT_DIR} on http://127.0.0.1:{port} (proxy /api -> {backend})")
    try:
        check = subprocess.run(["node", str(Path(__file__).resolve().parent / "qollab_browser_check.mjs"),
                                f"http://127.0.0.1:{port}/index.html", str(screenshot_dir),
                                ",".join(build_qollab.PAGE_NAMES)])
    finally:
        server.shutdown()
    return check.returncode


if __name__ == "__main__":
    sys.exit(main())
