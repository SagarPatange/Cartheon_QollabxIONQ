"""Turn a finished message exchange into the ordered steps the page animates.

Each step is {phase, title, detail}. phase is one of PHASES; the page maps it to a visual. The numbers in every
detail come from what the simulation actually ran.
"""

from quantum_bros.protocol import messaging, qkd, qre_cec
from quantum_bros.protocol.network import PairStatistics

PHASES = [
    "heralding",
    "encoding",
    "teleported_cnot",
    "encoded_swapping",
    "frame_correction",
    "qkd_measure",
    "sifting",
    "error_check",
    "abort",
    "encrypt",
    "classical_send",
    "decrypt",
    "teleport",
    "deliver",
]

DISPLAY_NAMES = {messaging.MARIO: "Mario", messaging.LUIGI: "Luigi"}
LINK_NAMES = ["Alice–Bob", "Bob–Charlie", "Charlie–David"]
PERCENT = 100


def build_steps(result: messaging.MessageResult, statistics: PairStatistics) -> list[dict]:
    """The steps for one message, in the order the protocol ran them."""
    if result.kind == messaging.CLASSICAL:
        return [make_classical_send_step(result), make_deliver_step(result)]
    steps = build_pair_steps(statistics)
    if result.kind == messaging.QUANTUM:
        steps.append(make_teleport_step(result, statistics))
        steps.append(make_deliver_step(result))
        return steps
    steps.extend(build_qkd_steps(result.qkd_report))
    if result.qkd_report.is_aborted:
        steps.append(make_step("abort", "Turtles detected! The key is thrown away", "Nothing is sent."))
        return steps
    steps.append(make_encrypt_step(result))
    steps.append(make_classical_send_step(result))
    steps.append(make_decrypt_step(result))
    steps.append(make_deliver_step(result))
    return steps


def make_step(phase: str, title: str, detail: str) -> dict:
    """One animation step; fails fast on a phase the page does not know."""
    if phase not in PHASES:
        raise ValueError(f"unknown phase {phase!r}")
    return {"phase": phase, "title": title, "detail": detail}


def build_pair_steps(statistics: PairStatistics) -> list[dict]:
    """The five QRE-CEC phases, summed over every logical pair the message used."""
    pair_count = statistics.pair_count
    rejected_count = statistics.encoding_attempts - statistics.encoded_block_count
    return [
        make_step("heralding", "Heralding: BSM nodes make physical Bell pairs", describe_heralding(statistics)),
        make_step(
            "encoding",
            "Encoding: every tower prepares verified Steane blocks",
            f"{statistics.encoded_block_count} blocks (|+̄⟩ left, |0̄⟩ right); the Z̄ check rejected {rejected_count}.",
        ),
        make_step(
            "teleported_cnot",
            "Teleported CNOT: 7 Bell pairs → one logical Φ̄⁺ per link",
            f"{pair_count * qre_cec.LINK_COUNT} transversal CNOTs teleported across the links.",
        ),
        make_step(
            "encoded_swapping",
            "Encoded swapping at Bob and Charlie",
            f"Decoder fixed a flipped bit {statistics.decoder_corrections[0]} times at Bob, "
            f"{statistics.decoder_corrections[1]} at Charlie.",
        ),
        make_step(
            "frame_correction",
            "Pauli-frame correction at David",
            f"{statistics.frame_corrected_pair_count} of {pair_count} pairs needed X̄/Z̄ on David's block.",
        ),
    ]


def describe_heralding(statistics: PairStatistics) -> str:
    """Pairs, heralding attempts per link and how many pairs a turtle touched."""
    attempt_texts = []
    for link in range(qre_cec.LINK_COUNT):
        attempt_texts.append(f"{LINK_NAMES[link]} {statistics.heralding_attempts[link]}")
    toy_percent = round(qre_cec.TOY_HERALD_SUCCESS_PROBABILITY * PERCENT)
    return (
        f"{statistics.pair_count} logical pairs × 7 photons per link. Attempts: {', '.join(attempt_texts)} "
        f"(toy success {toy_percent}%). Turtles touched {statistics.tapped_pair_count} pairs."
    )


def build_qkd_steps(qkd_report: qkd.QkdReport) -> list[dict]:
    """BBM92: random measurements, sifting and the error check."""
    qber_percent = qkd_report.qber * PERCENT
    threshold_percent = qkd.QBER_ABORT_THRESHOLD * PERCENT
    if qkd_report.is_aborted:
        verdict = f"above {threshold_percent:.0f}%: abort"
    else:
        verdict = f"below {threshold_percent:.0f}%: key accepted"
    return [
        make_step(
            "qkd_measure",
            "BBM92: Alice and David measure in random bases",
            f"{qkd_report.round_count} rounds, each one logical pair measured in Z̄ or X̄ on both ends.",
        ),
        make_step(
            "sifting",
            "Sifting: keep rounds where the bases match",
            f"{qkd_report.sifted_count} of {qkd_report.round_count} rounds kept.",
        ),
        make_step(
            "error_check",
            f"Error check: QBER {qber_percent:.1f}%",
            f"{qkd_report.sample_errors} of {qkd_report.sample_size} sampled bits disagree; {verdict}.",
        ),
    ]


def make_encrypt_step(result: messaging.MessageResult) -> dict:
    """The sender one-time-pads the message with the QKD key."""
    sender_name = DISPLAY_NAMES[result.sender]
    key_length = len(result.qkd_report.alice_key)
    title = f"{sender_name} XORs the message with the {key_length}-bit key"
    return make_step("encrypt", title, f"Ciphertext {result.ciphertext_hex}")


def make_classical_send_step(result: messaging.MessageResult) -> dict:
    """The envelope crosses the classical channel; say what a listening turtle reads."""
    is_plaintext = result.kind == messaging.CLASSICAL
    if is_plaintext:
        title = "The plaintext travels over the classical channel"
    else:
        title = "The ciphertext travels over the classical channel"
    if result.channel_view is None:
        detail = "No turtles are listening."
    else:
        detail = f"The turtles read: {result.channel_view}"
    return make_step("classical_send", title, detail)


def make_decrypt_step(result: messaging.MessageResult) -> dict:
    """The receiver XORs with their own key; any key bits that differ garble the text."""
    receiver_name = DISPLAY_NAMES[result.receiver]
    key_mismatches = result.qkd_report.key_mismatches
    return make_step(
        "decrypt", f"{receiver_name} XORs with the matching key", f"{key_mismatches} key bits differ between the ends."
    )


def make_teleport_step(result: messaging.MessageResult, statistics: PairStatistics) -> dict:
    """Each message bit rode one logical pair; the turtles see only random correction bits."""
    sender_name = DISPLAY_NAMES[result.sender]
    detail = f"{statistics.pair_count} bits teleported as |0̄⟩/|1̄⟩; {result.bit_errors} arrived flipped."
    if result.channel_view is not None:
        detail += f" The turtles read only the correction bits: {result.channel_view}"
    return make_step("teleport", f"{sender_name} teleports the message bit by bit", detail)


def make_deliver_step(result: messaging.MessageResult) -> dict:
    """The receiver reads the message."""
    receiver_name = DISPLAY_NAMES[result.receiver]
    return make_step("deliver", f"{receiver_name} reads: “{result.text_received}”", f"{result.bit_errors} bits wrong.")
