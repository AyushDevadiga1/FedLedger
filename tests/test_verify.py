import numpy as np
import pytest
from fl_server.fedavg import compute_weight_hash


# ---------------------------------------------------------------------------
# TestVerify — end-to-end hash verification workflow
#
# These tests exercise the *cryptographic verification* story: given a set of
# weights that a server claims it used for FedAvg, can a participant
# independently confirm or refute that claim by recomputing the hash?
#
# NOTE: These tests do NOT require a running Hardhat node — they exercise the
# hashing logic only.  Integration tests that touch the chain are in
# test_blockchain.py.
# ---------------------------------------------------------------------------

class TestVerify:

    # ── basic correctness ──────────────────────────────────────────────

    def test_correct_weights_verify_as_honest(self):
        """A participant who holds the same weights as the server must compute
        an identical hash — the round verifies as honest."""
        server_weights = [np.array([[0.25, -0.13, 0.07]]), np.array([0.42])]
        stored_hash = compute_weight_hash(server_weights)

        # Participant independently recomputes from their copy of the weights
        participant_weights = [np.array([[0.25, -0.13, 0.07]]), np.array([0.42])]
        recomputed_hash = compute_weight_hash(participant_weights)

        assert recomputed_hash == stored_hash

    def test_tampered_weights_detect_mismatch(self):
        """If the server reports weights that differ even slightly from what
        was actually used, the hash must not match — tampering is detected."""
        honest_weights  = [np.array([[0.25, -0.13]]), np.array([0.07])]
        tampered_weights = [np.array([[0.26, -0.13]]), np.array([0.07])]

        honest_hash   = compute_weight_hash(honest_weights)
        tampered_hash = compute_weight_hash(tampered_weights)

        assert honest_hash != tampered_hash, (
            "Tampered weights must produce a different hash — "
            "verification should have caught the discrepancy."
        )

    def test_tampered_intercept_detected(self):
        """Tampering with the intercept (not just the coef) must also be caught."""
        honest   = [np.array([[1.0, 2.0]]), np.array([0.5])]
        tampered = [np.array([[1.0, 2.0]]), np.array([0.6])]
        assert compute_weight_hash(honest) != compute_weight_hash(tampered)

    # ── determinism guarantees ────────────────────────────────────────

    def test_hash_is_deterministic(self):
        """The same weights must produce the same hash on every call, with no
        dependence on wall-clock time, random seeds, or object identity."""
        weights = [np.array([[1.0, 2.0]]), np.array([0.5])]
        hashes = [compute_weight_hash(weights) for _ in range(20)]
        assert len(set(hashes)) == 1, (
            f"Expected one unique hash but got {len(set(hashes))}: {set(hashes)}"
        )

    def test_hash_independent_of_array_copy(self):
        """compute_weight_hash must produce the same result whether the arrays
        are the original objects or deep copies (no object-identity dependency)."""
        original = [np.array([[3.14, 2.71]]), np.array([-1.0])]
        copy     = [arr.copy() for arr in original]
        assert compute_weight_hash(original) == compute_weight_hash(copy)

    # ── format validation ─────────────────────────────────────────────

    def test_hash_format_is_64_char_lowercase_hex(self):
        """The returned hash must be a 64-character lowercase hex string so it
        round-trips through JSON, URLs, and the blockchain without modification."""
        weights = [np.array([[0.1, 0.2, 0.3]]), np.array([0.0])]
        h = compute_weight_hash(weights)

        assert isinstance(h, str), f"Expected str, got {type(h)}"
        assert len(h) == 64, f"Expected 64 chars, got {len(h)}"
        assert h == h.lower(), "Hash should be lowercase hex"
        int(h, 16)  # Raises ValueError if not valid hex

    # ── edge cases ────────────────────────────────────────────────────

    def test_all_zero_weights_hash_is_stable(self):
        """All-zero weights (initial model state) must produce a consistent,
        non-empty hash — not an error or an empty string."""
        zeros = [np.zeros((3, 4)), np.zeros(3)]
        h = compute_weight_hash(zeros)
        assert isinstance(h, str) and len(h) == 64

    def test_large_weight_array_does_not_raise(self):
        """FedAvg on real datasets produces thousands of parameters.  The
        hasher must handle large arrays without memory or overflow errors."""
        rng = np.random.default_rng(0)
        big_coef = rng.standard_normal((10, 784))   # MNIST-scale
        big_int  = rng.standard_normal((10,))
        h = compute_weight_hash([big_coef, big_int])
        assert len(h) == 64
