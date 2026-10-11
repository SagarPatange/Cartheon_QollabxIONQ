"""The game's seven simulator calls without a server, for Qollab, where Python runs in the browser (Pyodide).

The page calls handle(qpu_backend, "/api/teleport", '{"states": ["0"], "seed": 4}') and gets back the same JSON the
FastAPI server (server.py) returns for that request and seed. FastAPI and pydantic are not available there, so the
request rules of api_models.py are checked here in plain Python, and each response is trimmed to the fields its
pydantic model declares, with ints and floats as pydantic would serialise them.
"""

import dataclasses
import json
import random
from collections.abc import Callable

from quantum_bros.protocol import (
    logical_link,
    messaging,
    repetition_swap,
    steane_block,
    steps,
    teleport,
    teleported_cnot_lesson,
)
from quantum_bros.protocol.messaging import MAX_MESSAGE_BYTES
from quantum_bros.protocol.network import QuantumNetwork
from quantum_bros.protocol.noise import MAX_PHYSICAL_ERROR, make_uniform_noise

# Same limits as api_models.py (copied, because importing it would import pydantic).
MAX_TELEPORT_STATES = 16
MAX_SEED = 2**32 - 1
MAX_BUILD_CNOTS = 40

# Tests set this to StimBackend; None means make_simulator, the Qiskit stabilizer simulator Qollab provides.
SIMULATOR_FACTORY: Callable | None = None


class RequestError(ValueError):
    """A request that breaks the api_models.py rules; FastAPI would answer it with a 422."""


def make_simulator(seed: int):
    """The "measure now" stabilizer backend used on Qollab. Imported here so api.py loads without Qiskit."""
    from quantum_bros.backends.qiskit_backend import QiskitStabilizerBackend

    return QiskitStabilizerBackend(seed)


def build_simulator(seed: int):
    """A fresh simulator from SIMULATOR_FACTORY, or make_simulator when no factory is set. Stands in for StimBackend."""
    factory = SIMULATOR_FACTORY if SIMULATOR_FACTORY is not None else make_simulator
    return factory(seed)


def handle(qpu_backend, api_path: str, request_json: str) -> str:
    """Run one POST endpoint and return its JSON response; a bad request gives {"error", "status": 422}, an unknown
    path {"error", "status": 404}. qpu_backend is Qollab's Qiskit backend; only handlers that need hardware use it."""
    handler = HANDLERS.get(api_path)
    if handler is None:
        return json.dumps({"error": f"Unknown path {api_path}", "status": 404})
    try:
        body = json.loads(request_json) if request_json else {}
    except json.JSONDecodeError as error:
        return json.dumps({"error": f"Request is not valid JSON: {error}", "status": 422})
    if not isinstance(body, dict):
        return json.dumps({"error": "Request body must be a JSON object", "status": 422})
    try:
        response = handler(qpu_backend, body)
    except ValueError as error:  # RequestError, and the protocols' own ValueErrors (server.py turns those into 422s)
        return json.dumps({"error": str(error), "status": 422})
    return json.dumps(response)


# ---- Request checks: the api_models.py rules (pydantic's lax mode: 5.0 is an int, 1 is a float). ----


def read_optional_seed(body: dict) -> int | None:
    """seed: int | None = Field(default=None, ge=0, le=MAX_SEED)."""
    value = body.get("seed")
    if value is None:
        return None
    return check_range("seed", to_int("seed", value), 0, MAX_SEED)


def read_float(body: dict, name: str, minimum: float, maximum: float, default: float) -> float:
    """A float field with a default: a JSON number or numeric string, inside [minimum, maximum]."""
    value = body.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        raise RequestError(f"{name} must be a number")
    try:
        number = float(value)
    except ValueError as error:
        raise RequestError(f"{name} must be a number") from error
    return check_range(name, number, minimum, maximum)


def read_bool(body: dict, name: str, default: bool) -> bool:
    """A bool field: true/false, 0/1, or the strings pydantic accepts for them."""
    value = body.get(name, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"1", "true", "t", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "f", "no", "n", "off"}:
            return False
    raise RequestError(f"{name} must be a boolean")


def read_choice(body: dict, name: str, choices: list[str]) -> str:
    """A required Literal field."""
    value = read_required(body, name)
    if value not in choices or not isinstance(value, str):
        raise RequestError(f"{name} must be one of {choices}")
    return value


def read_required(body: dict, name: str):
    """A field with no default: its value, or an error when it is missing."""
    if name not in body:
        raise RequestError(f"{name} is required")
    return body[name]


def to_int(name: str, value) -> int:
    """Pydantic's lax int: true is 1, 5.0 and "5" are 5, 5.5 is an error."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            pass
    raise RequestError(f"{name} must be an integer")


def check_range(name: str, value, minimum, maximum):
    """The ge/le bounds of a Field."""
    if minimum is not None and value < minimum:
        raise RequestError(f"{name} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise RequestError(f"{name} must be at most {maximum}")
    return value


def pick_seed(requested_seed: int | None) -> int:
    """The request's seed, or a fresh one when it gave none."""
    if requested_seed is None:
        return random.randrange(MAX_SEED + 1)
    return requested_seed


# ---- Response shapes: each pydantic response model's fields, so extra dataclass fields are dropped as pydantic does.
# A shape is "int", "float", "any", a dict of field → shape (a model), or ("list" | "dict" | "optional", shape).

ANIMATION_STEP = {"phase": "any", "title": "any", "detail": "any"}
SEND_RESPONSE = {
    "steps": ("list", ANIMATION_STEP),
    "sender": "any",
    "receiver": "any",
    "kind": "any",
    "text_sent": "any",
    "text_received": "any",
    "channel_view": "any",
    "ciphertext_hex": "any",
    "bit_errors": "int",
    "qre_cec": "any",
    "qkd": "any",
    "seed": "int",
    "physical_error": "float",
    "turtles_on": "any",
    "tap_fraction": "float",
}
HERALD_ATTEMPT = {"round_one_detector": "any", "round_two_detector": "any"}
LOGICAL_CHECK = {"logical_bit": "int", "was_corrected": "any"}
LOGICAL_PAIR_RESPONSE = {
    "herald_attempts": ("list", ("list", HERALD_ATTEMPT)),
    "alice_encoding_attempts": "int",
    "bob_encoding_attempts": "int",
    "alice_cnot_bits": ("list", "int"),
    "bob_cnot_bits": ("list", "int"),
    "check_basis": "any",
    "alice_check": LOGICAL_CHECK,
    "bob_check": LOGICAL_CHECK,
    "seed": "int",
    "physical_error": "float",
}
TELEPORT_RESPONSE = {
    "seed": "int",
    "teleports": (
        "list",
        {
            "state": "any",
            "bell_bits": {"z_fix": "int", "x_fix": "int"},
            "luigi_reads": {"none": "any", "x": "any", "z": "any", "zx": "any"},
        },
    ),
}
STEANE_BLOCK_RESPONSE = {
    "x_checks": ("list", "int"),
    "z_checks": ("list", "int"),
    "logical_z": "int",
    "is_encoded": "any",
    "verification_bit": ("optional", "int"),
}
FIX_RESULT = {"z_syndrome": ("list", "int"), "x_syndrome": ("list", "int"), "logical_bit": "int", "is_fixed": "any"}
STEANE_ERRORS_RESPONSE = {
    "seed": "int",
    "rounds": (
        "list",
        {
            "pauli": "any",
            "position": "int",
            "z_syndrome": ("list", "int"),
            "x_syndrome": ("list", "int"),
            "fixes": ("dict", FIX_RESULT),
        },
    ),
}
PAIR_ROUND = {"m": "int", "n": "int", "readings": ("dict", ("dict", "int"))}
BLOCK_ROUND = {
    "bad_pair": ("optional", "int"),
    "m_bits": ("list", "int"),
    "n_bits": ("list", "int"),
    "raw_zz_bit": "int",
    "raw_xx_bit": "int",
    "luigi_z_syndrome": ("list", "int"),
    "luigi_x_syndrome": ("list", "int"),
    "fixed_zz_bit": "int",
    "fixed_xx_bit": "int",
}
TELEPORTED_CNOT_RESPONSE = {
    "seed": "int",
    "classical_round": PAIR_ROUND,
    "bell_round": PAIR_ROUND,
    "block_rounds": ("list", BLOCK_ROUND),
}
CORRELATORS = {"xx": "int", "yy": "int", "zz": "int", "fidelity": "float"}
REPETITION_SWAP_RESPONSE = {
    "seed": "int",
    "links": ("list", {"m_bits": ("list", "int"), "n_bits": ("list", "int"), "zz": "int", "xx": "int"}),
    "swap": {
        "flipped_qubit": "int",
        "x_bits": ("list", "int"),
        "z_bits": ("list", "int"),
        "syndrome": ("list", "int"),
        "fixed_qubit": ("optional", "int"),
        "fixed_z_bits": ("list", "int"),
        "m_x": "int",
        "m_z": "int",
        "m_z_without_fix": "int",
    },
    "before_frame": CORRELATORS,
    "after_frame": CORRELATORS,
    "without_fix": CORRELATORS,
}


def shape_value(shape, value):
    """Serialise value the way pydantic serialises a field of this shape."""
    if shape == "any":
        return value
    if shape == "int":
        return int(value)
    if shape == "float":
        return float(value)
    if isinstance(shape, dict):
        return {name: shape_value(field_shape, value[name]) for name, field_shape in shape.items()}
    kind, inner = shape
    if kind == "optional":
        return None if value is None else shape_value(inner, value)
    if kind == "list":
        return [shape_value(inner, item) for item in value]
    return {key: shape_value(inner, item) for key, item in value.items()}


# ---- Handlers: one per path, each doing what the matching server.py endpoint does. ----


def handle_send(qpu_backend, body: dict) -> dict:
    """POST /api/send: one message; a message over the byte limit is a 422."""
    sender = read_choice(body, "sender", ["mario", "luigi"])
    kind = read_choice(body, "kind", ["classical", "encrypted", "quantum"])
    text = read_required(body, "text")
    if not isinstance(text, str):
        raise RequestError("text must be a string")
    if not 1 <= len(text) <= MAX_MESSAGE_BYTES:
        raise RequestError(f"text must be 1 to {MAX_MESSAGE_BYTES} characters")
    seed = pick_seed(read_optional_seed(body))
    physical_error = read_float(body, "physical_error", 0, MAX_PHYSICAL_ERROR, 0.001)
    turtles_on = read_bool(body, "turtles_on", False)
    tap_fraction = read_float(body, "tap_fraction", 0, 1, 1.0)

    network = QuantumNetwork(
        backend=build_simulator(seed),
        noise=make_uniform_noise(physical_error),
        rng=random.Random(seed),
        tap_fraction=tap_fraction if turtles_on else 0.0,
    )
    if kind == messaging.CLASSICAL:
        result = messaging.send_classical(text, sender, turtles_on)
    elif kind == messaging.ENCRYPTED:
        result = messaging.send_encrypted(network, text, sender)
    else:
        result = messaging.send_quantum(network, text, sender)
    qkd_summary = None
    if result.qkd_report is not None:
        qkd_summary = dataclasses.asdict(result.qkd_report)
    response = {
        "steps": steps.build_steps(result, network.statistics),
        "sender": result.sender,
        "receiver": result.receiver,
        "kind": result.kind,
        "text_sent": result.text_sent,
        "text_received": result.text_received,
        "channel_view": result.channel_view,
        "ciphertext_hex": result.ciphertext_hex,
        "bit_errors": result.bit_errors,
        "qre_cec": dataclasses.asdict(network.statistics),
        "qkd": qkd_summary,
        "seed": seed,
        "physical_error": physical_error,
        "turtles_on": turtles_on,
        "tap_fraction": tap_fraction,
    }
    return shape_value(SEND_RESPONSE, response)


def handle_logical_pair(qpu_backend, body: dict) -> dict:
    """POST /api/logical-pair: one Alice–Bob logical Bell pair."""
    seed = pick_seed(read_optional_seed(body))
    physical_error = read_float(body, "physical_error", 0, MAX_PHYSICAL_ERROR, 0.001)
    report = logical_link.run_logical_link(
        build_simulator(seed), make_uniform_noise(physical_error), random.Random(seed)
    )
    response = dataclasses.asdict(report) | {"seed": seed, "physical_error": physical_error}
    return shape_value(LOGICAL_PAIR_RESPONSE, response)


def handle_teleport(qpu_backend, body: dict) -> dict:
    """POST /api/teleport: teleport each state and every fix's reading."""
    states = read_required(body, "states")
    if not isinstance(states, list) or not 1 <= len(states) <= MAX_TELEPORT_STATES:
        raise RequestError(f"states must be a list of 1 to {MAX_TELEPORT_STATES} states")
    for state in states:
        if state not in ["0", "1", "+", "-"] or not isinstance(state, str):
            raise RequestError('each state must be one of "0", "1", "+", "-"')
    seed = pick_seed(read_optional_seed(body))
    results = teleport.run_teleports(build_simulator, states, random.Random(seed))
    response = {"seed": seed, "teleports": [dataclasses.asdict(result) for result in results]}
    return shape_value(TELEPORT_RESPONSE, response)


def handle_steane_block(qpu_backend, body: dict) -> dict:
    """POST /api/steane-block: what each check reads after the player's CNOTs; noiseless, so no seed."""
    cnots = body.get("cnots", [])
    if not isinstance(cnots, list) or len(cnots) > MAX_BUILD_CNOTS:
        raise RequestError(f"cnots must be a list of at most {MAX_BUILD_CNOTS} pairs")
    pairs = []
    for cnot in cnots:
        if not isinstance(cnot, list | tuple) or len(cnot) != 2:
            raise RequestError("each CNOT must be a [control, target] pair")
        pairs.append((to_int("control", cnot[0]), to_int("target", cnot[1])))
    report = steane_block.run_build(build_simulator(0), pairs)
    return shape_value(STEANE_BLOCK_RESPONSE, dataclasses.asdict(report))


def handle_steane_errors(qpu_backend, body: dict) -> dict:
    """POST /api/steane-errors: three errors, their syndromes and every fix's result."""
    seed = pick_seed(read_optional_seed(body))
    rounds = steane_block.run_error_rounds(build_simulator, random.Random(seed))
    response = {"seed": seed, "rounds": [dataclasses.asdict(error_round) for error_round in rounds]}
    return shape_value(STEANE_ERRORS_RESPONSE, response)


def handle_teleported_cnot(qpu_backend, body: dict) -> dict:
    """POST /api/teleported-cnot: the four rounds of the teleported CNOT lesson."""
    seed = pick_seed(read_optional_seed(body))
    report = teleported_cnot_lesson.run_lesson(build_simulator, random.Random(seed))
    return shape_value(TELEPORTED_CNOT_RESPONSE, {"seed": seed} | dataclasses.asdict(report))


def handle_repetition_swap(qpu_backend, body: dict) -> dict:
    """POST /api/repetition-swap: the 3-qubit repetition-code swap tutorial."""
    seed = pick_seed(read_optional_seed(body))
    report = repetition_swap.run_swap_tutorial(build_simulator(seed), random.Random(seed))
    return shape_value(REPETITION_SWAP_RESPONSE, {"seed": seed} | dataclasses.asdict(report))


MAX_QPU_SHOTS = 10_000


def handle_qpu_repeater(qpu_backend, body: dict) -> dict:
    """/api/qpu-repeater: the repetition-code repeater as ONE circuit on the backend picked in Qollab."""
    if qpu_backend is None:
        raise RequestError("No Qollab backend was given; pick one in Select QPU")
    shots = check_range("shots", to_int("shots", body.get("shots", 1000)), 1, MAX_QPU_SHOTS)
    from quantum_bros.protocol import qpu_repeater  # imports Qiskit's transpiler, so only when this path is used

    return qpu_repeater.run_qpu_repeater(qpu_backend, shots=shots)


# Path → handler(qpu_backend, request body dict) → response dict.
HANDLERS: dict[str, Callable[[object, dict], dict]] = {
    "/api/send": handle_send,
    "/api/logical-pair": handle_logical_pair,
    "/api/teleport": handle_teleport,
    "/api/steane-block": handle_steane_block,
    "/api/steane-errors": handle_steane_errors,
    "/api/teleported-cnot": handle_teleported_cnot,
    "/api/repetition-swap": handle_repetition_swap,
    "/api/qpu-repeater": handle_qpu_repeater,
}
