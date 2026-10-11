"""One simulation run of the Alice–Charlie repeater chain: the backend, the noise, the classical generator and the
running statistics of every logical pair distributed so far.

QKD and messaging ask the network for pairs; they never build the chain themselves.
"""

import random
from dataclasses import dataclass, field

from quantum_bros.backends.quantum_backend import QuantumBackend
from quantum_bros.protocol import qre_cec
from quantum_bros.protocol.noise import NoiseModel


@dataclass
class PairStatistics:
    """Totals over every logical pair, for the page's step captions."""

    pair_count: int = 0
    heralding_attempts: list[int] = field(default_factory=lambda: [0] * qre_cec.LINK_COUNT)
    encoded_block_count: int = 0
    decoder_corrections: list[int] = field(default_factory=lambda: [0] * qre_cec.REPEATER_COUNT)
    frame_corrected_pair_count: int = 0
    tapped_pair_count: int = 0

    def add(self, report: qre_cec.PairReport) -> None:
        """Fold one pair's report into the totals."""
        self.pair_count += 1
        for link in range(qre_cec.LINK_COUNT):
            self.heralding_attempts[link] += report.heralding_attempts[link]
        # Every pair encodes two blocks per link: |+̄⟩ on the left, |0̄⟩ on the right.
        self.encoded_block_count += 2 * qre_cec.LINK_COUNT
        for repeater in range(qre_cec.REPEATER_COUNT):
            self.decoder_corrections[repeater] += report.decoder_corrections[repeater]
        needed_frame_correction = report.frame_x_bit == 1 or report.frame_z_bit == 1
        if needed_frame_correction:
            self.frame_corrected_pair_count += 1
        if report.is_tapped:
            self.tapped_pair_count += 1


@dataclass
class QuantumNetwork:
    """Everything one run needs to distribute logical pairs.

    rng drives every classical random choice (heralding, taps, bases, sampling) so a seed reproduces the run.
    tap_fraction is the chance each photon is tapped by a turtle; 0 means the turtles are off.
    """

    backend: QuantumBackend
    noise: NoiseModel
    rng: random.Random
    tap_fraction: float
    layout: qre_cec.QubitLayout = field(default_factory=qre_cec.QubitLayout)
    statistics: PairStatistics = field(default_factory=PairStatistics)

    def distribute_pair(self) -> qre_cec.PairReport:
        """Leave a fresh Φ̄⁺ on layout.alice_block and layout.david_block and record what it took."""
        report = qre_cec.distribute_logical_pair(self.backend, self.layout, self.noise, self.rng, self.tap_fraction)
        self.statistics.add(report)
        return report
