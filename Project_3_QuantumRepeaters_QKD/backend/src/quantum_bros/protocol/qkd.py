"""BBM92 key distribution on logical Bell pairs delivered by QRE-CEC.

Each round Alice and David measure their halves of one Φ̄⁺ in a random basis, Z or X. Rounds where the bases match
(sifting) give correlated bits. A random sample of those is compared in public to estimate the error rate (QBER);
too high an error rate means someone tampered with the photons, and the key is thrown away.

Simplification: no error correction or privacy amplification after the check, so the report counts the key bits that
still differ between the two sides instead of hiding them.
"""

import math
from dataclasses import dataclass

from quantum_bros.protocol import steane
from quantum_bros.protocol.network import QuantumNetwork

# Share of sifted bits read out loud for the error check; they leave the key.
SAMPLE_FRACTION = 0.25

# Above about 11% QBER no secret key can be distilled from BB84-style data (Shor–Preskill bound).
QBER_ABORT_THRESHOLD = 0.11

# The page draws one card per round for this many rounds.
ROUNDS_SHOWN = 64


@dataclass(frozen=True)
class QkdRound:
    """One measured pair: each side's basis and decoded bit, and whether a turtle tapped any of its photons."""

    alice_basis: str
    david_basis: str
    alice_bit: int
    david_bit: int
    is_tapped: bool

    @property
    def is_sifted(self) -> bool:
        """Kept after sifting: both sides chose the same basis."""
        return self.alice_basis == self.david_basis


@dataclass(frozen=True)
class QkdReport:
    """The outcome of one key exchange."""

    round_count: int
    sifted_count: int
    sample_size: int
    sample_errors: int
    qber: float
    is_aborted: bool
    alice_key: list[int]
    david_key: list[int]
    key_mismatches: int
    rounds_shown: list[dict]


def run_qkd(network: QuantumNetwork, needed_bits: int) -> QkdReport:
    """Measure rounds until there are enough sifted bits for the key plus the sample, then check and cut the key."""
    if needed_bits < 1:
        raise ValueError(f"needed_bits must be at least 1, got {needed_bits}")
    target_sifted_count = math.ceil(needed_bits / (1 - SAMPLE_FRACTION))
    rounds = measure_rounds(network, target_sifted_count)
    sifted_round_numbers = []
    for round_number, qkd_round in enumerate(rounds):
        if qkd_round.is_sifted:
            sifted_round_numbers.append(round_number)

    sample_size = len(sifted_round_numbers) - needed_bits
    sampled_round_numbers, key_round_numbers = split_sample_from_key(network, sifted_round_numbers, sample_size)
    sample_errors = count_mismatches(rounds, sampled_round_numbers)
    qber = sample_errors / sample_size
    alice_key = [rounds[round_number].alice_bit for round_number in key_round_numbers]
    david_key = [rounds[round_number].david_bit for round_number in key_round_numbers]
    return QkdReport(
        round_count=len(rounds),
        sifted_count=len(sifted_round_numbers),
        sample_size=sample_size,
        sample_errors=sample_errors,
        qber=qber,
        is_aborted=qber > QBER_ABORT_THRESHOLD,
        alice_key=alice_key,
        david_key=david_key,
        key_mismatches=count_mismatches(rounds, key_round_numbers),
        rounds_shown=summarize_rounds(rounds[:ROUNDS_SHOWN], set(sampled_round_numbers)),
    )


def split_sample_from_key(
    network: QuantumNetwork, sifted_round_numbers: list[int], sample_size: int
) -> tuple[list[int], list[int]]:
    """Pick sample_size sifted rounds at random for the public check; the rest, in order, make the key."""
    sampled_round_numbers = sorted(network.rng.sample(sifted_round_numbers, sample_size))
    sampled_lookup = set(sampled_round_numbers)
    key_round_numbers = []
    for round_number in sifted_round_numbers:
        if round_number not in sampled_lookup:
            key_round_numbers.append(round_number)
    return sampled_round_numbers, key_round_numbers


def measure_rounds(network: QuantumNetwork, target_sifted_count: int) -> list[QkdRound]:
    """Keep distributing and measuring pairs until target_sifted_count rounds have matching bases."""
    rounds = []
    sifted_count = 0
    while sifted_count < target_sifted_count:
        qkd_round = measure_one_round(network)
        rounds.append(qkd_round)
        if qkd_round.is_sifted:
            sifted_count += 1
    return rounds


def measure_one_round(network: QuantumNetwork) -> QkdRound:
    """Distribute one logical pair; Alice and David each pick a random basis and measure their block."""
    pair_report = network.distribute_pair()
    alice_basis = network.rng.choice(steane.BASES)
    david_basis = network.rng.choice(steane.BASES)
    layout = network.layout
    alice_result = steane.measure_logical(network.backend, layout.alice_block, alice_basis, network.noise)
    david_result = steane.measure_logical(network.backend, layout.david_block, david_basis, network.noise)
    return QkdRound(
        alice_basis=alice_basis,
        david_basis=david_basis,
        alice_bit=alice_result.logical_bit,
        david_bit=david_result.logical_bit,
        is_tapped=pair_report.is_tapped,
    )


def count_mismatches(rounds: list[QkdRound], round_numbers: list[int]) -> int:
    """How many of the given rounds have different bits on the two sides."""
    mismatch_count = 0
    for round_number in round_numbers:
        qkd_round = rounds[round_number]
        if qkd_round.alice_bit != qkd_round.david_bit:
            mismatch_count += 1
    return mismatch_count


def summarize_rounds(rounds: list[QkdRound], sampled_round_numbers: set[int]) -> list[dict]:
    """The rounds as plain dicts for the page's round cards, with whether each was sampled for the check."""
    round_summaries = []
    for round_number, qkd_round in enumerate(rounds):
        round_summaries.append(
            {
                "alice_basis": qkd_round.alice_basis,
                "david_basis": qkd_round.david_basis,
                "alice_bit": qkd_round.alice_bit,
                "david_bit": qkd_round.david_bit,
                "is_sifted": qkd_round.is_sifted,
                "is_sampled": round_number in sampled_round_numbers,
                "is_tapped": qkd_round.is_tapped,
            }
        )
    return round_summaries
