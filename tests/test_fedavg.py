import numpy as np
import pytest
from fl_server.fedavg import federated_average, compute_weight_hash


# ---------------------------------------------------------------------------
# TestFedAvg — covers federated_average()
# ---------------------------------------------------------------------------
class TestFedAvg:

    def test_equal_weights_equal_samples(self):
        """When all nodes send identical weights with equal sample counts the
        global model must equal those weights (averaging identical values
        changes nothing)."""
        coef = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        intercept = np.array([0.5, -0.5])
        w = [coef, intercept]
        result = federated_average([w, w, w], [100, 100, 100])
        np.testing.assert_allclose(result[0], coef, rtol=1e-9)
        np.testing.assert_allclose(result[1], intercept, rtol=1e-9)

    def test_proportional_weighting_zero_samples(self):
        """A node with 0 samples must have zero influence on the global model.
        Result must equal the other node's weights exactly."""
        w1 = [np.array([[1.0, 2.0]]), np.array([0.5])]
        w2 = [np.array([[9.0, 8.0]]), np.array([3.0])]
        result = federated_average([w1, w2], [100, 0])
        np.testing.assert_allclose(result[0], w1[0], rtol=1e-9)
        np.testing.assert_allclose(result[1], w1[1], rtol=1e-9)

    def test_proportional_weighting_2_to_1_ratio(self):
        """Node with twice the samples must pull the average toward its weights
        by a 2:1 ratio. Manually verify the weighted sum formula."""
        w1 = [np.array([[0.0]]), np.array([0.0])]
        w2 = [np.array([[3.0]]), np.array([6.0])]
        result = federated_average([w1, w2], [200, 100])
        # expected = (200*0 + 100*3) / 300 = 1.0
        np.testing.assert_allclose(result[0], np.array([[1.0]]), rtol=1e-9)
        np.testing.assert_allclose(result[1], np.array([2.0]), rtol=1e-9)

    def test_output_shape_matches_input(self):
        """Aggregated arrays must have the exact same shape as the inputs."""
        rng = np.random.default_rng(42)
        coef = rng.standard_normal((3, 10))
        intercept = rng.standard_normal((3,))
        weights_list = [[coef.copy(), intercept.copy()] for _ in range(3)]
        result = federated_average(weights_list, [80, 90, 100])
        assert result[0].shape == coef.shape, "coef shape mismatch"
        assert result[1].shape == intercept.shape, "intercept shape mismatch"

    def test_output_is_weighted_mean_three_nodes(self):
        """Manually calculate FedAvg for three nodes with different sample
        counts and verify the result matches the formula exactly."""
        w1 = [np.array([[1.0, 0.0]])]
        w2 = [np.array([[0.0, 1.0]])]
        w3 = [np.array([[0.5, 0.5]])]
        result = federated_average([w1, w2, w3], [1, 1, 2])
        # total = 4; expected = (1*[1,0] + 1*[0,1] + 2*[0.5,0.5]) / 4 = [0.5, 0.5]
        np.testing.assert_allclose(result[0], np.array([[0.5, 0.5]]), rtol=1e-9)

    def test_no_intercept_single_array(self):
        """federated_average must work when each node sends only one array
        (fit_intercept=False scenario)."""
        w = [np.array([[1.0, 2.0]])]
        result = federated_average([w, w], [50, 50])
        assert len(result) == 1, "expected exactly one output array"
        np.testing.assert_allclose(result[0], w[0], rtol=1e-9)

    def test_result_dtype_is_float64(self):
        """Aggregated weights must be float64 regardless of input dtype."""
        w = [np.array([[1, 2]], dtype=np.float32)]
        result = federated_average([w, w], [10, 10])
        assert result[0].dtype == np.float64


# ---------------------------------------------------------------------------
# TestWeightHash — covers compute_weight_hash()
# ---------------------------------------------------------------------------
class TestWeightHash:

    def test_same_weights_produce_same_hash(self):
        """Hash must be deterministic: calling twice on identical data gives
        the same 64-char hex string."""
        weights = [np.array([[1.0, 2.0], [3.0, 4.0]]), np.array([0.1, 0.2])]
        assert compute_weight_hash(weights) == compute_weight_hash(weights)

    def test_different_weights_produce_different_hash(self):
        """A single differing float must produce a completely different hash
        (collision resistance)."""
        w1 = [np.array([[1.0, 2.0]]), np.array([0.5])]
        w2 = [np.array([[1.0, 2.1]]), np.array([0.5])]
        assert compute_weight_hash(w1) != compute_weight_hash(w2)

    def test_hash_is_64_char_hex_string(self):
        """Return value must be exactly 64 hex characters (SHA-256 output)."""
        weights = [np.array([[1.0, -1.0]]), np.array([0.0])]
        h = compute_weight_hash(weights)
        assert isinstance(h, str), "hash must be a str"
        assert len(h) == 64, f"expected 64 chars, got {len(h)}"
        # Raises ValueError if not valid hex
        int(h, 16)

    def test_hash_deterministic_across_multiple_calls(self):
        """Hash must not depend on Python object identity, random seeds, or
        dict ordering — only on the numerical values."""
        weights = [np.array([[0.1234, -0.5678]]), np.array([0.999])]
        hashes = {compute_weight_hash(weights) for _ in range(10)}
        assert len(hashes) == 1, "hash must be identical across all calls"

    def test_tiny_perturbation_changes_hash(self):
        """A change of 1e-10 in a weight must change the hash (no rounding
        inside the hasher that could silently absorb small changes)."""
        base = [np.array([[1.0000000000]])]
        perturbed = [np.array([[1.0000000001]])]
        assert compute_weight_hash(base) != compute_weight_hash(perturbed)

    def test_hash_order_sensitive(self):
        """Swapping two weight arrays must produce a different hash.  The order
        of coef_ and intercept_ is part of the canonical representation."""
        w1 = [np.array([[1.0, 2.0]]), np.array([3.0])]
        w2 = [np.array([3.0]), np.array([[1.0, 2.0]])]
        assert compute_weight_hash(w1) != compute_weight_hash(w2)
