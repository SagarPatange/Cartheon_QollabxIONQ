"""Mario and Peach send a text message three ways: in the clear, one-time-pad encrypted with a QKD key, or teleported
bit by bit over logical Bell pairs.

Mario stands at Alice's end of the chain and Peach at Charlie's. Either one can send. Peach's sender id is still
"luigi" (LUIGI below), so the page's requests and the API did not change when she took Luigi's place.

Simplification for quantum messages: Stim only simulates Clifford circuits, so a quantum message carries each text
bit as a logical |0̄⟩ or |1̄⟩. Teleporting arbitrary qubit states needs a non-Clifford backend such as Qiskit.
"""

from dataclasses import dataclass

from quantum_bros.protocol import qkd, qre_cec, repetition_code
from quantum_bros.protocol.network import QuantumNetwork

MARIO = "mario"
LUIGI = "luigi"
SENDERS = [MARIO, LUIGI]

CLASSICAL = "classical"
ENCRYPTED = "encrypted"
QUANTUM = "quantum"
MESSAGE_KINDS = [CLASSICAL, ENCRYPTED, QUANTUM]

# 24 bytes is 192 key bits, about 520 logical pairs: a few tenths of a second on the Stim backend.
MAX_MESSAGE_BYTES = 24

BITS_PER_BYTE = 8


@dataclass(frozen=True)
class MessageResult:
    """What the receiver got and what an eavesdropper on the fiber saw.

    channel_view is None when the turtles are off. text_received is None when the exchange aborted.
    """

    kind: str
    sender: str
    receiver: str
    text_sent: str
    text_received: str | None
    channel_view: str | None
    ciphertext_hex: str | None
    qkd_report: qkd.QkdReport | None
    bit_errors: int


def send_classical(text: str, sender: str, are_turtles_on: bool) -> MessageResult:
    """Plaintext over a classical channel: anyone listening reads it as it is."""
    check_message(text, sender)
    channel_view = text if are_turtles_on else None
    return MessageResult(
        kind=CLASSICAL,
        sender=sender,
        receiver=find_receiver(sender),
        text_sent=text,
        text_received=text,
        channel_view=channel_view,
        ciphertext_hex=None,
        qkd_report=None,
        bit_errors=0,
    )


def send_encrypted(network: QuantumNetwork, text: str, sender: str) -> MessageResult:
    """Run QKD for one key bit per message bit, then send message XOR key over the classical channel.

    The receiver XORs with their own key. If the error check aborts, nothing is sent.
    """
    check_message(text, sender)
    message_bits = text_to_bits(text)
    qkd_report = qkd.run_qkd(network, len(message_bits))
    are_turtles_on = network.tap_fraction > 0
    if qkd_report.is_aborted:
        return make_aborted_result(text, sender, qkd_report, are_turtles_on)

    sender_key, receiver_key = pick_keys(qkd_report, sender)
    ciphertext_bits = xor_bits(message_bits, sender_key)
    received_bits = xor_bits(ciphertext_bits, receiver_key)
    ciphertext_hex = bits_to_bytes(ciphertext_bits).hex()
    return MessageResult(
        kind=ENCRYPTED,
        sender=sender,
        receiver=find_receiver(sender),
        text_sent=text,
        text_received=bits_to_text(received_bits),
        channel_view=ciphertext_hex if are_turtles_on else None,
        ciphertext_hex=ciphertext_hex,
        qkd_report=qkd_report,
        bit_errors=count_differences(message_bits, received_bits),
    )


def make_aborted_result(text: str, sender: str, qkd_report: qkd.QkdReport, are_turtles_on: bool) -> MessageResult:
    """The error check caught the turtles: the key is thrown away and no ciphertext goes out."""
    return MessageResult(
        kind=ENCRYPTED,
        sender=sender,
        receiver=find_receiver(sender),
        text_sent=text,
        text_received=None,
        channel_view="" if are_turtles_on else None,
        ciphertext_hex=None,
        qkd_report=qkd_report,
        bit_errors=0,
    )


def send_quantum(network: QuantumNetwork, text: str, sender: str) -> MessageResult:
    """Teleport every bit of the message from the sender's end to the receiver's, one logical pair per bit.

    The turtles only ever see the two classical correction bits per teleport, which are uniformly random.
    """
    check_message(text, sender)
    message_bits = text_to_bits(text)
    received_bits = []
    correction_bits = []
    for message_bit in message_bits:
        received_bit, sent_corrections = teleport_bit(network, message_bit, sender)
        received_bits.append(received_bit)
        correction_bits.extend(sent_corrections)
    are_turtles_on = network.tap_fraction > 0
    correction_hex = bits_to_bytes(correction_bits).hex()
    return MessageResult(
        kind=QUANTUM,
        sender=sender,
        receiver=find_receiver(sender),
        text_sent=text,
        text_received=bits_to_text(received_bits),
        channel_view=correction_hex if are_turtles_on else None,
        ciphertext_hex=None,
        qkd_report=None,
        bit_errors=count_differences(message_bits, received_bits),
    )


def teleport_bit(network: QuantumNetwork, message_bit: int, sender: str) -> tuple[int, list[int]]:
    """Encode the bit as |0̄⟩ or |1̄⟩, teleport it over a fresh logical pair, and measure it at the receiver.

    Returns the received bit and the two classical correction bits [b₁, b₂] the sender announced.
    """
    backend = network.backend
    layout = network.layout
    message_block = layout.message_block
    repetition_code.encode_logical_zero(backend, message_block, network.noise)
    if message_bit == 1:
        repetition_code.apply_logical_x(backend, message_block)

    network.distribute_pair()
    sender_half, receiver_half = pick_halves(layout, sender)
    repetition_code.apply_transversal_cnot(backend, message_block, sender_half, network.noise)
    x_basis = repetition_code.X_BASIS
    z_basis = repetition_code.Z_BASIS
    z_correction_bit = repetition_code.measure_logical(backend, message_block, x_basis, network.noise).logical_bit
    x_correction_bit = repetition_code.measure_logical(backend, sender_half, z_basis, network.noise).logical_bit
    qre_cec.correct_pauli_frame(backend, receiver_half, x_correction_bit, z_correction_bit)
    received_bit = repetition_code.measure_logical(backend, receiver_half, z_basis, network.noise).logical_bit
    return received_bit, [z_correction_bit, x_correction_bit]


def pick_halves(layout: qre_cec.QubitLayout, sender: str) -> tuple[list[int], list[int]]:
    """(sender's block, receiver's block): Mario holds Alice's half, Peach holds Charlie's."""
    if sender == MARIO:
        return layout.alice_block, layout.david_block
    return layout.david_block, layout.alice_block


def pick_keys(qkd_report: qkd.QkdReport, sender: str) -> tuple[list[int], list[int]]:
    """(sender's key, receiver's key): Mario's key is Alice's, Peach's is Charlie's."""
    if sender == MARIO:
        return qkd_report.alice_key, qkd_report.david_key
    return qkd_report.david_key, qkd_report.alice_key


def find_receiver(sender: str) -> str:
    """The other plumber."""
    if sender == MARIO:
        return LUIGI
    return MARIO


def check_message(text: str, sender: str) -> None:
    """Fail fast on an unknown sender, an empty message or one longer than MAX_MESSAGE_BYTES."""
    if sender not in SENDERS:
        raise ValueError(f"sender must be one of {SENDERS}, got {sender!r}")
    byte_count = len(text.encode("utf-8"))
    if byte_count == 0:
        raise ValueError("the message is empty")
    if byte_count > MAX_MESSAGE_BYTES:
        raise ValueError(f"the message is {byte_count} bytes; the limit is {MAX_MESSAGE_BYTES}")


def text_to_bits(text: str) -> list[int]:
    """UTF-8 bytes of the text, each written as 8 bits, most significant first."""
    bits = []
    for byte_value in text.encode("utf-8"):
        for position in range(BITS_PER_BYTE - 1, -1, -1):
            bits.append((byte_value >> position) & 1)
    return bits


def bits_to_bytes(bits: list[int]) -> bytes:
    """Pack bits into bytes, most significant first; a short last byte is padded with zeros on the right."""
    byte_values = []
    for first_bit in range(0, len(bits), BITS_PER_BYTE):
        byte_bits = bits[first_bit : first_bit + BITS_PER_BYTE]
        byte_value = 0
        for bit in byte_bits:
            byte_value = byte_value * 2 + bit
        byte_value <<= BITS_PER_BYTE - len(byte_bits)
        byte_values.append(byte_value)
    return bytes(byte_values)


def bits_to_text(bits: list[int]) -> str:
    """Decode bits as UTF-8. Bytes garbled by key mismatches or noise show up as the replacement character."""
    return bits_to_bytes(bits).decode("utf-8", errors="replace")


def xor_bits(first_bits: list[int], second_bits: list[int]) -> list[int]:
    """Bitwise XOR of two equal-length bit lists."""
    xored_bits = []
    for first_bit, second_bit in zip(first_bits, second_bits, strict=True):
        xored_bits.append(first_bit ^ second_bit)
    return xored_bits


def count_differences(first_bits: list[int], second_bits: list[int]) -> int:
    """How many positions differ between two equal-length bit lists."""
    difference_count = 0
    for first_bit, second_bit in zip(first_bits, second_bits, strict=True):
        if first_bit != second_bit:
            difference_count += 1
    return difference_count
