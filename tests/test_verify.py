"""
test_verify.py
Unit tests for cryptographic hash verification of training rounds.
Run: pytest tests/test_verify.py -v
"""

import numpy as np
import pytest
from fl_server.fedavg import compute_weight_hash


class TestVerify:

    def test_correct_weights_verify_as_honest(self):
        """
        Weights that produced the on-chain hash must verify as honest.
        TODO: hash a known weight set, then verify the same weights,
              assert verification returns True.
        """
        pass

    def test_tampered_weights_detect_mismatch(self):
        """
        Slightly altered weights must fail verification (tampering detected).
        TODO: hash a weight set, then verify different weights,
              assert verification returns False.
        """
        pass

    def test_hash_is_deterministic(self):
        """
        Same weights must always produce the same hash for comparison.
        TODO: compute hash of identical weights twice,
              assert recomputed_hash == stored_hash.
        """
        pass