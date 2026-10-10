"""Sending text three ways, both directions."""

import random

import pytest

from quantum_bros.backends.stim_backend import StimBackend
from quantum_bros.protocol import messaging
from quantum_bros.protocol.network import QuantumNetwork
from quantum_bros.protocol.noise import NoiseModel


def make_noiseless_network(seed: int, tap_fraction: float = 0) -> QuantumNetwork:
    """A noiseless network, optionally with turtles."""
    return QuantumNetwork(
        backend=StimBackend(seed), noise=NoiseModel(), rng=random.Random(seed), tap_fraction=tap_fraction
    )


def test_text_survives_a_round_trip_through_bits():
    assert messaging.text_to_bits("A") == [0, 1, 0, 0, 0, 0, 0, 1]
    assert messaging.bits_to_text(messaging.text_to_bits("héllo ★")) == "héllo ★"


def test_a_short_last_byte_is_padded_on_the_right():
    assert messaging.bits_to_bytes([1, 0, 1]) == bytes([0b10100000])


def test_classical_messages_are_read_by_the_turtles():
    result = messaging.send_classical("hi", messaging.MARIO, are_turtles_on=True)
    assert result.channel_view == "hi"
    assert result.receiver == messaging.LUIGI


@pytest.mark.parametrize("sender", messaging.SENDERS)
def test_a_noiseless_encrypted_message_arrives_intact_and_the_ciphertext_hides_it(sender):
    result = messaging.send_encrypted(make_noiseless_network(11), "Its-a me!", sender)
    assert result.text_received == "Its-a me!"
    assert result.bit_errors == 0
    assert bytes.fromhex(result.ciphertext_hex) != b"Its-a me!"
    assert result.channel_view is None


def test_turtles_tapping_everything_stop_the_encrypted_message():
    result = messaging.send_encrypted(make_noiseless_network(12, tap_fraction=1), "secret", messaging.LUIGI)
    assert result.qkd_report.is_aborted
    assert result.text_received is None
    assert result.ciphertext_hex is None


@pytest.mark.parametrize("sender", messaging.SENDERS)
def test_a_noiseless_quantum_message_arrives_intact_in_both_directions(sender):
    result = messaging.send_quantum(make_noiseless_network(13), "Luigi!", sender)
    assert result.text_received == "Luigi!"
    assert result.bit_errors == 0


def test_bad_messages_fail_fast():
    with pytest.raises(ValueError):
        messaging.send_classical("", messaging.MARIO, are_turtles_on=False)
    with pytest.raises(ValueError):
        messaging.send_classical("x" * (messaging.MAX_MESSAGE_BYTES + 1), messaging.MARIO, are_turtles_on=False)
    with pytest.raises(ValueError):
        messaging.send_classical("hi", "peach", are_turtles_on=False)
