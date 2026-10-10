"""Hardware noise parameters shared by every protocol step (paper §II-A lists the same error sources).

Idle decoherence (p_idle from T1/T2) is not modelled yet: the simulation has no clock.
"""

from dataclasses import dataclass

# Above this the Steane code is far past threshold and encoding verification almost never accepts a block.
MAX_PHYSICAL_ERROR = 0.1


@dataclass(frozen=True)
class NoiseModel:
    """Error probabilities for one run.

    gate_error_1q: depolarizing after single-qubit gates (p_1g).
    gate_error_2q: two-qubit depolarizing after CNOTs (p_2g).
    measurement_error: chance a measured bit is flipped (p_m).
    bell_pair_error: two-qubit depolarizing on each freshly heralded physical Bell pair.
    """

    gate_error_1q: float = 0.0
    gate_error_2q: float = 0.0
    measurement_error: float = 0.0
    bell_pair_error: float = 0.0

    def __post_init__(self) -> None:
        """Fail fast if any probability is outside [0, MAX_PHYSICAL_ERROR]."""
        for field_name, probability in vars(self).items():
            is_valid = 0 <= probability <= MAX_PHYSICAL_ERROR
            if not is_valid:
                raise ValueError(f"{field_name} must be between 0 and {MAX_PHYSICAL_ERROR}, got {probability}")


def make_uniform_noise(physical_error: float) -> NoiseModel:
    """One knob for the page slider: every error source gets the same probability."""
    return NoiseModel(
        gate_error_1q=physical_error,
        gate_error_2q=physical_error,
        measurement_error=physical_error,
        bell_pair_error=physical_error,
    )
