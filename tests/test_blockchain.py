"""
test_blockchain.py
Unit tests for blockchain round logging and retrieval.
Requires a local Hardhat node running with the contract deployed.
Run: pytest tests/test_blockchain.py -v
"""

import numpy as np
import pytest
from fl_server.blockchain_logger import BlockchainLogger


class TestBlockchainLogger:

    def test_connect_to_hardhat(self):
        """
        Logger must connect to the local Hardhat Ethereum node.
        TODO: instantiate BlockchainLogger(), assert self.w3.is_connected() is True.
        """
        pass

    def test_log_and_retrieve_round(self):
        """
        A round logged on-chain must be retrievable with matching data.
        TODO: call log_round(...), then get_round(0), assert fields match.
        """
        pass

    def test_rounds_are_append_only(self):
        """
        Logging a round must increase totalRounds() by exactly one.
        TODO: record totalRounds() before and after one log_round call,
              assert the difference is 1.
        """
        pass