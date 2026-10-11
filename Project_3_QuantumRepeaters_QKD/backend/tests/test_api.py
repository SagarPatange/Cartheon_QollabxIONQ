"""api.handle, the serverless entry point Qollab calls, must answer exactly like the FastAPI server."""

import json
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from quantum_bros import api
from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.server import app

client = TestClient(app)

SAME_REQUESTS = [
    ("/api/send", {"sender": "luigi", "kind": "classical", "text": "Mamma mia", "seed": 5, "physical_error": 0}),
    ("/api/send", {"sender": "mario", "kind": "encrypted", "text": "hi", "seed": 9, "turtles_on": True,
                   "tap_fraction": 0.1}),
    ("/api/send", {"sender": "mario", "kind": "encrypted", "text": "hi", "seed": 2, "turtles_on": True}),
    ("/api/send", {"sender": "mario", "kind": "quantum", "text": "Hi", "seed": 7, "physical_error": 0.01}),
    ("/api/logical-pair", {"seed": 12, "physical_error": 0}),
    ("/api/logical-pair", {"seed": 3}),
    ("/api/teleport", {"states": ["0", "1", "+", "-"], "seed": 4}),
    ("/api/steane-block", {"cnots": [[0, 1], [2, 3]]}),
    ("/api/steane-block", {}),
    ("/api/steane-errors", {"seed": 8}),
    ("/api/teleported-cnot", {"seed": 11}),
    ("/api/repetition-swap", {"seed": 6}),
]

BAD_REQUESTS = [
    ("/api/send", {"sender": "peach", "kind": "classical", "text": "hi"}),
    ("/api/send", {"sender": "mario", "kind": "telepathy", "text": "hi"}),
    ("/api/send", {"sender": "mario", "kind": "classical", "text": ""}),
    ("/api/send", {"sender": "mario", "kind": "classical", "text": "hi", "physical_error": 0.5}),
    ("/api/send", {"sender": "mario", "kind": "classical", "text": "★" * 9}),
    ("/api/logical-pair", {"physical_error": 0.5}),
    ("/api/teleport", {"states": ["2"]}),
    ("/api/teleport", {"states": []}),
    ("/api/teleport", {"states": ["0"] * 17}),
    ("/api/teleport", {"states": ["0"], "seed": -1}),
    ("/api/teleport", {}),
    ("/api/steane-block", {"cnots": [[3, 3]]}),
    ("/api/steane-block", {"cnots": [[7, 1]]}),
    ("/api/repetition-swap", {"seed": -1}),
]


@pytest.fixture(autouse=True)
def use_stim(monkeypatch):
    """The server runs Stim; give api.handle the same simulator so the two runs match."""
    monkeypatch.setattr(api, "SIMULATOR_FACTORY", StimBackend)


@pytest.mark.parametrize(("path", "request_body"), SAME_REQUESTS)
def test_handle_returns_what_the_server_returns(path, request_body):
    server_response = client.post(path, json=request_body)
    assert server_response.status_code == 200
    assert json.loads(api.handle(None, path, json.dumps(request_body))) == server_response.json()


@pytest.mark.parametrize(("path", "request_body"), BAD_REQUESTS)
def test_a_request_the_server_rejects_gets_a_422_error(path, request_body):
    assert client.post(path, json=request_body).status_code == 422
    answer = json.loads(api.handle(None, path, json.dumps(request_body)))
    assert answer["status"] == 422
    assert answer["error"]


def test_an_unknown_path_gets_a_404_and_no_seed_still_works():
    assert json.loads(api.handle(None, "/api/nowhere", "{}"))["status"] == 404
    answer = json.loads(api.handle(None, "/api/teleport", '{"states": ["0"]}'))
    assert 0 <= answer["seed"] <= api.MAX_SEED


def test_importing_api_does_not_import_fastapi_or_pydantic():
    check = "import sys, quantum_bros.api; print(sorted({'fastapi', 'pydantic'} & set(sys.modules)))"
    output = subprocess.run([sys.executable, "-c", check], capture_output=True, text=True, check=True).stdout
    assert output.strip() == "[]"
