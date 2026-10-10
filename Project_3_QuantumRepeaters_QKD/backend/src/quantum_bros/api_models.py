"""Request and response shapes for POST /api/send (Level 3) and POST /api/logical-pair (Level 2). Pydantic rejects a
bad request with a 422 before any simulation."""

from typing import Literal

from pydantic import BaseModel, Field

from quantum_bros.protocol.messaging import MAX_MESSAGE_BYTES
from quantum_bros.protocol.noise import MAX_PHYSICAL_ERROR

# Seeds go into Stim and random.Random; keep them in the range both accept and JSON carries exactly.
MAX_SEED = 2**32 - 1


class SendRequest(BaseModel):
    """One message: who sends it, how, and the simulation settings. No seed means the server picks one."""

    sender: Literal["mario", "luigi"]
    kind: Literal["classical", "encrypted", "quantum"]
    text: str = Field(min_length=1, max_length=MAX_MESSAGE_BYTES)
    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)
    physical_error: float = Field(default=0.001, ge=0, le=MAX_PHYSICAL_ERROR)
    turtles_on: bool = False
    tap_fraction: float = Field(default=1.0, ge=0, le=1)


class AnimationStep(BaseModel):
    """One step of the playback: phase picks the visual, title and detail go in the message box."""

    phase: str
    title: str
    detail: str


class SendResponse(BaseModel):
    """Everything the page shows, plus the settings echoed back so a run can be repeated."""

    steps: list[AnimationStep]
    sender: str
    receiver: str
    kind: str
    text_sent: str
    text_received: str | None
    channel_view: str | None
    ciphertext_hex: str | None
    bit_errors: int
    qre_cec: dict
    qkd: dict | None
    seed: int
    physical_error: float
    turtles_on: bool
    tap_fraction: float


class LogicalPairRequest(BaseModel):
    """Level 2: one logical Bell pair between Alice and Bob. No seed means the server picks one."""

    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)
    physical_error: float = Field(default=0.001, ge=0, le=MAX_PHYSICAL_ERROR)


class HeraldAttemptModel(BaseModel):
    """One Barrett–Kok attempt: which detector clicked in each round ("D+", "D-"), or null for no click."""

    round_one_detector: str | None
    round_two_detector: str | None


class LogicalCheckModel(BaseModel):
    """The decoded logical bit of one block, and whether the decoder had to fix a bit to get it."""

    logical_bit: int
    was_corrected: bool


class LogicalPairResponse(BaseModel):
    """What the simulator did, phase by phase, for the page to play back; plus the settings to repeat the run."""

    herald_attempts: list[list[HeraldAttemptModel]]
    alice_encoding_attempts: int
    bob_encoding_attempts: int
    alice_cnot_bits: list[int]
    bob_cnot_bits: list[int]
    check_basis: Literal["Z", "X"]
    alice_check: LogicalCheckModel
    bob_check: LogicalCheckModel
    seed: int
    physical_error: float
