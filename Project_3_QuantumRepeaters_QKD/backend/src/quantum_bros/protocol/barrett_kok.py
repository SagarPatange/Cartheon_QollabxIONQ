"""Barrett–Kok heralding (README.md, Level 1 section 3): one physical Bell pair Φ⁺ between two communication qubits.

Each attempt has two rounds. In each round a laser flash makes a ↓ qubit emit a photon, the photons meet at the beam
splitter, and one of the detectors D+ or D- may click. Both qubits are flipped between the rounds. One click in each
round heralds Ψ⁺ (same detector twice) or Ψ⁻ (different detectors); a local fix then turns either into Φ⁺, the pair
the rest of the protocol expects.

Simplification: whether a round clicks, and which detector, is a classical toy draw (real links click far less
often), and a failed round is always "no click" (a lost photon); double clicks are not modelled. The quantum side is
exact: the heralded Ψ± is prepared and the fix applied on the backend.
"""

import random
from dataclasses import dataclass

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol.noise import NoiseModel

# Toy: chance that one round gives a single detector click. Two rounds must both click.
TOY_ROUND_CLICK_PROBABILITY = 0.6

PLUS_DETECTOR = "D+"
MINUS_DETECTOR = "D-"
DETECTORS = [PLUS_DETECTOR, MINUS_DETECTOR]

# At the toy click rate a pair takes about 3 attempts; this many failures in a row means something is broken.
MAX_HERALD_ATTEMPTS = 10_000


@dataclass(frozen=True)
class HeraldAttempt:
    """Which detector clicked in each round, or None for no click. A round-one miss ends the attempt early."""

    round_one_detector: str | None
    round_two_detector: str | None

    @property
    def is_success(self) -> bool:
        """One click in each round."""
        return self.round_one_detector is not None and self.round_two_detector is not None

    @property
    def heralds_psi_minus(self) -> bool:
        """Different detectors in the two rounds herald Ψ⁻; the same detector heralds Ψ⁺."""
        return self.round_one_detector != self.round_two_detector


def herald_pair(
    backend: QuantumBackend, alice_qubit: int, bob_qubit: int, noise: NoiseModel, rng: random.Random
) -> list[HeraldAttempt]:
    """Attempt Barrett–Kok until it succeeds, leaving Φ⁺ on the two qubits. Returns every attempt, in order.

    Raises RuntimeError if no attempt succeeds within MAX_HERALD_ATTEMPTS.
    """
    attempts = []
    for _ in range(MAX_HERALD_ATTEMPTS):
        attempt = draw_attempt(rng)
        attempts.append(attempt)
        if attempt.is_success:
            prepare_heralded_pair(backend, alice_qubit, bob_qubit, attempt, noise)
            return attempts
    raise RuntimeError(f"no heralded pair after {MAX_HERALD_ATTEMPTS} attempts")


def draw_attempt(rng: random.Random) -> HeraldAttempt:
    """Both rounds of one attempt. Round two only runs if round one clicked."""
    round_one_detector = draw_click(rng)
    if round_one_detector is None:
        return HeraldAttempt(round_one_detector=None, round_two_detector=None)
    return HeraldAttempt(round_one_detector=round_one_detector, round_two_detector=draw_click(rng))


def draw_click(rng: random.Random) -> str | None:
    """One round: a click in D+ or D- (equally likely), or None when the photon is lost."""
    if rng.random() >= TOY_ROUND_CLICK_PROBABILITY:
        return None
    return rng.choice(DETECTORS)


def prepare_heralded_pair(
    backend: QuantumBackend, alice_qubit: int, bob_qubit: int, attempt: HeraldAttempt, noise: NoiseModel
) -> None:
    """Put the heralded Ψ± on the qubits, then apply the Barrett–Kok fix that turns it into Φ⁺.

    Ψ⁺ = (|01⟩ + |10⟩)/√2 and Ψ⁻ = Z on Alice of Ψ⁺. The fix is X on Bob (Ψ± → Φ±), then Z on Alice for Φ⁻ → Φ⁺.
    """
    backend.reset([alice_qubit, bob_qubit])
    backend.h([alice_qubit])
    backend.cnot([(alice_qubit, bob_qubit)])
    backend.x([bob_qubit])
    if attempt.heralds_psi_minus:
        backend.z([alice_qubit])

    backend.x([bob_qubit])
    if attempt.heralds_psi_minus:
        backend.z([alice_qubit])
    backend.depolarize2([(alice_qubit, bob_qubit)], noise.bell_pair_error)
