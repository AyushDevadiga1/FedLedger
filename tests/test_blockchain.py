import numpy as np
import pytest

try:
    from fl_server.blockchain_logger import BlockchainLogger
    _CHAIN_AVAILABLE = True
except Exception:
    _CHAIN_AVAILABLE = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_logger():
    """Return a BlockchainLogger or skip the test if the chain is unreachable.

    Two distinct preconditions are checked separately so a failure names the
    one that is actually missing. Previously any error collapsed into a skip,
    which is how six tests went from passing to BadFunctionCallOutput without
    anything saying the contract was never deployed on this chain.
    """
    try:
        logger = BlockchainLogger()
    except Exception as e:
        pytest.skip(f"BlockchainLogger init failed ({e}) — deploy the contract first")

    if not logger.w3.is_connected():
        pytest.skip("Hardhat node not reachable on :8545 — run: npx hardhat node")

    # A reachable node is not the same as a deployed contract. On a freshly
    # restarted chain the configured address has no code, and every contract
    # call fails with an opaque BadFunctionCallOutput.
    if not logger.w3.eth.get_code(logger.contract.address):
        pytest.skip(
            f"no contract at {logger.contract.address} on this chain "
            "(block "
            f"{logger.w3.eth.block_number}) — run: "
            "npx hardhat run scripts/deploy.js --network localhost"
        )

    return logger


def _dummy_weights():
    rng = np.random.default_rng(99)
    return [rng.standard_normal((3, 4)), rng.standard_normal((3,))]


def test_log_round_returns_prefixed_tx_hash():
    """tx hash must be 0x-prefixed.

    HexBytes.hex() returns a bare hex string in current hexbytes releases,
    so returning it directly produced hashes the dashboard could not use as
    block-explorer links. Web3.to_hex() is always prefixed.
    """
    logger = _make_logger()
    tx_hash = logger.log_round(
        round_number=logger.total_rounds() + 1,
        accuracy=51.2,
        participants=["OrgA", "OrgB", "OrgC"],
        global_weights=_dummy_weights(),
    )
    assert isinstance(tx_hash, str)
    assert tx_hash.startswith("0x"), f"expected 0x-prefixed hash, got {tx_hash!r}"
    assert len(tx_hash) == 66, f"expected 32-byte hash, got len={len(tx_hash)}"


def test_get_round_returns_prefixed_model_hash():
    """modelHash must be 0x-prefixed too, or the receipt's keccak comparison
    against a recomputed value has to special-case the prefix (it did)."""
    logger = _make_logger()
    weights = _dummy_weights()
    idx = logger.total_rounds()
    logger.log_round(
        round_number=idx + 1,
        accuracy=62.5,
        participants=["OrgA"],
        global_weights=weights,
    )
    record = logger.get_round(idx)
    assert record["modelHash"].startswith("0x"), (
        f"expected 0x-prefixed modelHash, got {record['modelHash']!r}"
    )
    assert logger.verify_round(idx, weights) is True


# ---------------------------------------------------------------------------
# TestBlockchainLogger
#
# These are *integration* tests — they require:
#   1. npx hardhat node   (running on :8545)
#   2. npx hardhat run scripts/deploy.js --network localhost
#
# They are automatically skipped when the node is unreachable so that the
# rest of the test suite (test_fedavg, test_verify) can run in CI without a
# blockchain.
# ---------------------------------------------------------------------------

class TestBlockchainLogger:

    def test_connect_to_hardhat(self):
        """BlockchainLogger must successfully connect to the local Hardhat node
        and the Web3 connection must report is_connected() == True."""
        logger = _make_logger()
        assert logger.w3.is_connected(), "Expected Web3 to report a live connection"

    def test_log_and_retrieve_round(self):
        """A round logged on-chain must be retrievable with matching fields.

        Verifies round-trip integrity:
          roundNumber, accuracy (within floating-point rounding), and
          participants must all survive the encode/decode cycle.
        """
        logger = _make_logger()

        before = logger.total_rounds()
        weights = _dummy_weights()

        tx_hash = logger.log_round(
            round_number=before + 1,
            accuracy=74.3,
            participants=["OrgA", "OrgB", "OrgC"],
            global_weights=weights,
        )

        assert isinstance(tx_hash, str) and tx_hash.startswith("0x"), (
            f"Expected a 0x-prefixed tx hash, got: {tx_hash!r}"
        )

        # Retrieve the record we just wrote (0-indexed)
        record = logger.get_round(before)

        assert record["roundNumber"] == before + 1, "Round number mismatch"
        assert abs(record["accuracy"] - 74.3) < 0.002, (
            f"Accuracy stored as int/1000 should round-trip to ~74.3, "
            f"got {record['accuracy']}"
        )
        assert record["participants"] == ["OrgA", "OrgB", "OrgC"], (
            f"Participants mismatch: {record['participants']}"
        )
        assert "modelHash" in record and record["modelHash"], "modelHash must be present"
        assert "timestamp" in record and record["timestamp"] > 0, "timestamp must be set"

    def test_rounds_are_append_only(self):
        """Every call to log_round must increase totalRounds() by exactly one.
        This verifies the append-only guarantee of the smart contract."""
        logger = _make_logger()

        before = logger.total_rounds()
        logger.log_round(
            round_number=before + 1,
            accuracy=50.0,
            participants=["OrgA"],
            global_weights=_dummy_weights(),
        )
        after = logger.total_rounds()

        assert after == before + 1, (
            f"Expected totalRounds to go from {before} to {before + 1}, "
            f"got {after}"
        )

    def test_verify_round_correct_weights_returns_true(self):
        """verify_round must return True when the weights that produced the
        stored hash are supplied — the round is honest."""
        logger = _make_logger()

        weights = _dummy_weights()
        idx = logger.total_rounds()
        logger.log_round(
            round_number=idx + 1,
            accuracy=88.8,
            participants=["OrgA", "OrgB"],
            global_weights=weights,
        )

        result = logger.verify_round(idx, weights)
        assert result is True, "Correct weights must verify as honest"

    def test_verify_round_tampered_weights_returns_false(self):
        """verify_round must return False when the weights differ from what was
        originally hashed — tampered weights are detected."""
        logger = _make_logger()

        honest_weights  = _dummy_weights()
        tampered_weights = [arr + 0.01 for arr in honest_weights]

        idx = logger.total_rounds()
        logger.log_round(
            round_number=idx + 1,
            accuracy=88.8,
            participants=["OrgA"],
            global_weights=honest_weights,
        )

        result = logger.verify_round(idx, tampered_weights)
        assert result is False, "Tampered weights must not pass verification"

    def test_get_round_out_of_bounds_raises(self):
        """get_round with an index beyond totalRounds must raise an exception
        (the contract reverts with require())."""
        logger = _make_logger()
        total = logger.total_rounds()

        with pytest.raises(Exception):
            logger.get_round(total + 9999)

    def test_accuracy_stored_as_integer_thousandths(self):
        """Accuracy is stored on-chain as int(accuracy * 1000) to avoid
        floating-point.  A value of 74.3% must survive the round-trip within
        the 0.001% tolerance introduced by the integer encoding."""
        logger = _make_logger()
        idx = logger.total_rounds()
        logger.log_round(
            round_number=idx + 1,
            accuracy=74.3,
            participants=["OrgA"],
            global_weights=_dummy_weights(),
        )
        record = logger.get_round(idx)
        # int(74.3 * 1000) = 74300 → /1000 = 74.3 exactly (no FP loss here)
        assert abs(record["accuracy"] - 74.3) < 0.002
