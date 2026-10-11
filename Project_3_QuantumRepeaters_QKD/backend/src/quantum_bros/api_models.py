"""Request and response shapes for POST /api/send (qkd.html), POST /api/logical-pair (level2.html), POST /api/teleport
(teleport.html), POST /api/steane-block and /api/steane-errors (steane_block.html), POST /api/teleported-cnot
(teleported_cnot.html) and POST /api/repetition-swap (qkd.html's swap tutorial). Pydantic rejects a bad request with a
422 before any simulation."""

from typing import Literal

from pydantic import BaseModel, Field

from quantum_bros.protocol.messaging import MAX_MESSAGE_BYTES
from quantum_bros.protocol.noise import MAX_PHYSICAL_ERROR

# The teleport challenge sends "HI" as 10 bits; 16 leaves room without letting one request run long.
MAX_TELEPORT_STATES = 16

# Seeds go into Stim and random.Random; keep them in the range both accept and JSON carries exactly.
MAX_SEED = 2**32 - 1

# Level 3's encoder needs 11 CNOTs; this leaves room for wrong tries the player has not undone yet.
MAX_BUILD_CNOTS = 40


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
    """Level 5: one logical Bell pair between Alice and Bob. No seed means the server picks one."""

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


class TeleportRequest(BaseModel):
    """teleport.html: the states Mario teleports to Luigi, in order. No seed means the server picks one."""

    states: list[Literal["0", "1", "+", "-"]] = Field(min_length=1, max_length=MAX_TELEPORT_STATES)
    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)


class BellBitsModel(BaseModel):
    """Mario's Bell-measurement bits: z_fix says Luigi needs Z, x_fix says he needs X."""

    z_fix: int
    x_fix: int


class LuigiReadsModel(BaseModel):
    """What Luigi reads after each possible fix ("none", "x", "z", "zx"), in the sent state's basis."""

    none: str
    x: str
    z: str
    zx: str


class TeleportModel(BaseModel):
    """One teleported state: the bits Mario sends and Luigi's answer for every fix the player could pick."""

    state: str
    bell_bits: BellBitsModel
    luigi_reads: LuigiReadsModel


class TeleportResponse(BaseModel):
    """Every teleport in request order, plus the seed so the run can be repeated."""

    seed: int
    teleports: list[TeleportModel]


class SeededRequest(BaseModel):
    """A run that needs only a seed. No seed means the server picks one."""

    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)


class SteaneBlockRequest(BaseModel):
    """steane_block.html, Part A: the player's CNOTs so far, as (control, target) qubits 0-6."""

    cnots: list[tuple[int, int]] = Field(default_factory=list, max_length=MAX_BUILD_CNOTS)


class SteaneBlockResponse(BaseModel):
    """What each check would read (+1 or 0 = random), Z̄, whether the block is |0̄⟩, and the ancilla check's bit."""

    x_checks: list[int]
    z_checks: list[int]
    logical_z: int
    is_encoded: bool
    verification_bit: int | None


class FixResultModel(BaseModel):
    """The syndromes and the Z̄ check's bit after one fix, and whether the block is |0̄⟩ again."""

    z_syndrome: list[int]
    x_syndrome: list[int]
    logical_bit: int
    is_fixed: bool


class ErrorRoundModel(BaseModel):
    """One error: its Pauli and qubit (0-6), the measured syndromes, and every fix's result (keys like "X6")."""

    pauli: Literal["X", "Z", "Y"]
    position: int
    z_syndrome: list[int]
    x_syndrome: list[int]
    fixes: dict[str, FixResultModel]


class SteaneErrorsResponse(BaseModel):
    """steane_block.html, Part B: the three error rounds, plus the seed so the run can be repeated."""

    seed: int
    rounds: list[ErrorRoundModel]


class PairRoundModel(BaseModel):
    """A one-pair round: Mario's bit m, Luigi's bit n, and the readings after each fix ("none", "x", "z", "xz")."""

    m: int
    n: int
    readings: dict[str, dict[str, int]]


class BlockRoundModel(BaseModel):
    """A transversal round on two Steane blocks; bad_pair is the Bell pair a turtle flipped (1-7), or null."""

    bad_pair: int | None
    m_bits: list[int]
    n_bits: list[int]
    raw_zz_bit: int
    raw_xx_bit: int
    luigi_z_syndrome: list[int]
    luigi_x_syndrome: list[int]
    fixed_zz_bit: int
    fixed_xx_bit: int


class TeleportedCnotResponse(BaseModel):
    """teleported_cnot.html: all four rounds, plus the seed so the run can be repeated."""

    seed: int
    classical_round: PairRoundModel
    bell_round: PairRoundModel
    block_rounds: list[BlockRoundModel]


class SwapLinkModel(BaseModel):
    """One link after notebook Steps 1-5: the teleported CNOT's bits and ⟨Z̄Z̄⟩, ⟨X̄X̄⟩ of its data blocks."""

    m_bits: list[int]
    n_bits: list[int]
    zz: int
    xx: int


class SwapModel(BaseModel):
    """Steps 8-9 at Bob: the flipped a2 qubit (0-2), d's X bits, a2's Z bits, the syndrome, the fix, logical bits."""

    flipped_qubit: int
    x_bits: list[int]
    z_bits: list[int]
    syndrome: list[int]
    fixed_qubit: int | None
    fixed_z_bits: list[int]
    m_x: int
    m_z: int
    m_z_without_fix: int


class CorrelatorsModel(BaseModel):
    """⟨X̄X̄⟩, ⟨ȲȲ⟩, ⟨Z̄Z̄⟩ on Alice's and David's blocks and the fidelity with Φ̄⁺."""

    xx: int
    yy: int
    zz: int
    fidelity: float


class RepetitionSwapResponse(BaseModel):
    """qkd.html's swap tutorial (QRECEC_3QubitRepetition.ipynb): both links, the swap, and the Bell pair check
    before the frame, after it, and as it would be without Bob's decoding; plus the seed to repeat the run."""

    seed: int
    links: list[SwapLinkModel]
    swap: SwapModel
    before_frame: CorrelatorsModel
    after_frame: CorrelatorsModel
    without_fix: CorrelatorsModel
