"""POST /api/send, POST /api/logical-pair, POST /api/teleport and the static pages."""

import pytest
from fastapi.testclient import TestClient

from quantum_bros.protocol.steps import PHASES
from quantum_bros.server import PAGE_NAMES, app

client = TestClient(app)

# Luigi undoes X when x_fix is 1 and Z when z_fix is 1; keys are (z_fix, x_fix).
RIGHT_FIX_FOR_BELL_BITS = {(0, 0): "none", (0, 1): "x", (1, 0): "z", (1, 1): "zx"}


@pytest.mark.parametrize("kind", ["classical", "encrypted", "quantum"])
def test_each_kind_of_message_returns_steps_and_the_received_text(kind):
    request_body = {"sender": "luigi", "kind": kind, "text": "Mamma mia", "seed": 5, "physical_error": 0}
    response = client.post("/api/send", json=request_body)
    assert response.status_code == 200
    body = response.json()
    assert body["text_received"] == "Mamma mia"
    assert body["seed"] == 5
    assert body["steps"][-1]["phase"] == "deliver"
    for step in body["steps"]:
        assert step["phase"] in PHASES


def test_the_same_seed_gives_the_same_response():
    request_body = {"sender": "mario", "kind": "encrypted", "text": "hi", "seed": 9, "turtles_on": True,
                    "tap_fraction": 0.1}
    assert client.post("/api/send", json=request_body).json() == client.post("/api/send", json=request_body).json()


def test_turtles_on_full_tap_end_the_encrypted_steps_with_an_abort():
    request_body = {"sender": "mario", "kind": "encrypted", "text": "hi", "seed": 2, "turtles_on": True}
    body = client.post("/api/send", json=request_body).json()
    assert body["steps"][-1]["phase"] == "abort"
    assert body["text_received"] is None


@pytest.mark.parametrize(
    "bad_field",
    [{"sender": "peach"}, {"kind": "telepathy"}, {"text": ""}, {"physical_error": 0.5}, {"text": "★" * 9}],
)
def test_a_bad_request_gets_a_422(bad_field):
    request_body = {"sender": "mario", "kind": "classical", "text": "hi"} | bad_field
    assert client.post("/api/send", json=request_body).status_code == 422


def test_the_pages_are_served_but_the_backend_folder_is_not():
    assert client.get("/qkd.html").status_code == 200
    for page_name in ["start.html", "level1.html", "hut.html", "level2.html"]:
        assert client.get(f"/{page_name}").status_code == 200
    assert client.get("/start.html").headers["cache-control"] == "no-cache"
    assert client.get("/", follow_redirects=False).headers["location"] == "/start.html"
    assert client.get("/src/page_helpers.js").status_code == 200
    assert client.get("/pyproject.toml").status_code == 404
    assert client.get("/backend/pyproject.toml").status_code == 404


def test_a_logical_pair_run_returns_seven_heralded_pairs_and_matching_checks():
    body = client.post("/api/logical-pair", json={"seed": 12, "physical_error": 0}).json()
    assert len(body["herald_attempts"]) == 7
    for attempts in body["herald_attempts"]:
        last_attempt = attempts[-1]
        assert last_attempt["round_one_detector"] in ["D+", "D-"]
        assert last_attempt["round_two_detector"] in ["D+", "D-"]
    assert len(body["alice_cnot_bits"]) == 7
    assert body["alice_check"]["logical_bit"] == body["bob_check"]["logical_bit"]
    assert body["seed"] == 12


def test_the_same_logical_pair_seed_gives_the_same_run_and_bad_settings_get_a_422():
    request_body = {"seed": 3}
    assert client.post("/api/logical-pair", json=request_body).json() == client.post(
        "/api/logical-pair", json=request_body
    ).json()
    assert client.post("/api/logical-pair", json={"physical_error": 0.5}).status_code == 422


def test_index_page_is_gone_and_styles_are_served():
    assert client.get("/index.html").status_code == 404
    assert client.get("/styles/world.css").status_code == 200


def test_a_teleport_run_returns_one_entry_per_state_with_the_right_fix_reading_the_state():
    body = client.post("/api/teleport", json={"states": ["1", "+", "0", "-"], "seed": 21}).json()
    assert body["seed"] == 21
    assert [teleport["state"] for teleport in body["teleports"]] == ["1", "+", "0", "-"]
    for teleport in body["teleports"]:
        assert list(teleport["luigi_reads"]) == ["none", "x", "z", "zx"]
        bell_bits = (teleport["bell_bits"]["z_fix"], teleport["bell_bits"]["x_fix"])
        right_fix = RIGHT_FIX_FOR_BELL_BITS[bell_bits]
        assert teleport["luigi_reads"][right_fix] == teleport["state"]


def test_the_same_teleport_seed_gives_the_same_response_and_no_seed_still_works():
    request_body = {"states": ["0", "1", "+", "-", "1"], "seed": 4}
    assert client.post("/api/teleport", json=request_body).json() == client.post(
        "/api/teleport", json=request_body
    ).json()
    unseeded_response = client.post("/api/teleport", json={"states": ["0"]})
    assert unseeded_response.status_code == 200
    assert 0 <= unseeded_response.json()["seed"] <= 2**32 - 1


@pytest.mark.parametrize(
    "request_body",
    [{"states": ["2"]}, {"states": []}, {"states": ["0"] * 17}, {"states": ["0"], "seed": -1}, {}],
)
def test_a_bad_teleport_request_gets_a_422(request_body):
    assert client.post("/api/teleport", json=request_body).status_code == 422


def test_the_new_level_pages_are_listed():
    assert "teleport.html" in PAGE_NAMES
    assert "bb84_hut.html" in PAGE_NAMES
