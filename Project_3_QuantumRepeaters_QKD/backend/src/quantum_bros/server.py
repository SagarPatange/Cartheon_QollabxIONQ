"""HTTP server: POST /api/send runs one Level 3 message and POST /api/logical-pair one Level 2 logical pair through the
simulator; the pages are served alongside them.

Run from backend/:  .venv/bin/python -m uvicorn quantum_bros.server:app --port 8001
then open http://localhost:8001. Only the pages, src/ and styles/ are served from the repo root.
"""

import dataclasses
import random
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from quantum_bros.api_models import MAX_SEED, LogicalPairRequest, LogicalPairResponse, SendRequest, SendResponse
from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import logical_link, messaging, steps
from quantum_bros.protocol.network import QuantumNetwork
from quantum_bros.protocol.noise import make_uniform_noise

# backend/src/quantum_bros/server.py → the repo root is three folders up; game/ there holds all the browser loads.
GAME_ROOT = Path(__file__).resolve().parents[3] / "game"
PAGE_NAMES = ["start.html", "level1.html", "hut.html", "level2.html", "qkd.html"]

app = FastAPI(title="Quantum Bros simulator")


@app.middleware("http")
async def ask_browsers_to_revalidate(request: Request, call_next) -> Response:
    """Pages and scripts change often while the game is built; without this, browsers show stale CSS and JS."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.post("/api/send")
def send_message(request: SendRequest) -> SendResponse:
    """Simulate one message and return the steps to animate. A message over the byte limit gets a 422."""
    seed = request.seed
    if seed is None:
        seed = random.randrange(MAX_SEED + 1)
    try:
        return run_send(request, seed)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def run_send(request: SendRequest, seed: int) -> SendResponse:
    """Build a fresh network from the seed, send the message, and package the result for the page."""
    tap_fraction = request.tap_fraction if request.turtles_on else 0.0
    network = QuantumNetwork(
        backend=StimBackend(seed),
        noise=make_uniform_noise(request.physical_error),
        rng=random.Random(seed),
        tap_fraction=tap_fraction,
    )
    result = dispatch_message(network, request)
    qkd_summary = None
    if result.qkd_report is not None:
        qkd_summary = dataclasses.asdict(result.qkd_report)
    return SendResponse(
        steps=steps.build_steps(result, network.statistics),
        sender=result.sender,
        receiver=result.receiver,
        kind=result.kind,
        text_sent=result.text_sent,
        text_received=result.text_received,
        channel_view=result.channel_view,
        ciphertext_hex=result.ciphertext_hex,
        bit_errors=result.bit_errors,
        qre_cec=dataclasses.asdict(network.statistics),
        qkd=qkd_summary,
        seed=seed,
        physical_error=request.physical_error,
        turtles_on=request.turtles_on,
        tap_fraction=request.tap_fraction,
    )


@app.post("/api/logical-pair")
def make_logical_pair(request: LogicalPairRequest) -> LogicalPairResponse:
    """Level 2: run one Alice–Bob logical Bell pair and return every click and bit for the page to animate."""
    seed = request.seed
    if seed is None:
        seed = random.randrange(MAX_SEED + 1)
    report = logical_link.run_logical_link(
        StimBackend(seed), make_uniform_noise(request.physical_error), random.Random(seed)
    )
    return LogicalPairResponse(**dataclasses.asdict(report), seed=seed, physical_error=request.physical_error)


def dispatch_message(network: QuantumNetwork, request: SendRequest) -> messaging.MessageResult:
    """Call the sender for the requested kind of message."""
    if request.kind == messaging.CLASSICAL:
        return messaging.send_classical(request.text, request.sender, request.turtles_on)
    if request.kind == messaging.ENCRYPTED:
        return messaging.send_encrypted(network, request.text, request.sender)
    return messaging.send_quantum(network, request.text, request.sender)


@app.get("/")
def redirect_to_start_page() -> RedirectResponse:
    """The game opens on its title screen."""
    return RedirectResponse(url="/start.html")


@app.get("/{page_name}")
def serve_page(page_name: str) -> FileResponse:
    """Serve one of the pages; anything else at the root is a 404, so backend/ never leaks."""
    if page_name not in PAGE_NAMES:
        raise HTTPException(status_code=404)
    return FileResponse(GAME_ROOT / page_name)


app.mount("/src", StaticFiles(directory=GAME_ROOT / "src"), name="src")
app.mount("/styles", StaticFiles(directory=GAME_ROOT / "styles"), name="styles")
