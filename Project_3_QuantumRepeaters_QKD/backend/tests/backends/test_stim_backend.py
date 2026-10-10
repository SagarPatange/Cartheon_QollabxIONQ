"""StimBackend behind the QuantumBackend interface."""

from quantum_bros.backends.stim_backend import StimBackend, flatten_pairs


def test_flatten_pairs_lists_control_then_target():
    assert flatten_pairs([(0, 1), (2, 3)]) == [0, 1, 2, 3]


def test_a_bell_pair_measures_equal_bits():
    for seed in range(20):
        backend = StimBackend(seed)
        backend.h([0])
        backend.cnot([(0, 1)])
        first_bit, second_bit = backend.measure([0, 1])
        assert first_bit == second_bit


def test_the_same_seed_gives_the_same_outcomes():
    outcomes_per_run = []
    for _ in range(2):
        backend = StimBackend(seed=42)
        backend.h(list(range(16)))
        outcomes_per_run.append(backend.measure(list(range(16))))
    assert outcomes_per_run[0] == outcomes_per_run[1]
