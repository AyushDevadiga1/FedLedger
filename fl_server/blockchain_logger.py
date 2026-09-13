"""
blockchain_logger.py
Connects Python FL server to local Hardhat Ethereum node.
Logs each training round as an immutable blockchain transaction.

Prerequisites:
  - Hardhat node running: npx hardhat node
  - Contract deployed: npx hardhat run scripts/deploy.js --network localhost
  - contract_config.json populated with ABI path and contract address
"""

import json
import hashlib
from web3 import Web3
from typing import List
import numpy as np


class BlockchainLogger:
    """
    Handles all interaction with the FLAuditLog smart contract.
    One instance created at server startup, used throughout training.
    """

    def __init__(self, config_path: str = "blockchain/contract_config.json"):
        """
        Initialise connection to local Hardhat Ethereum node.
        Load contract ABI and deployed contract address from config file.

        TODO:
          1. Connect Web3 to local Hardhat: Web3(Web3.HTTPProvider('http://127.0.0.1:8545'))
          2. Verify connection: assert self.w3.is_connected()
          3. Load config_path JSON — contains "abi_path" and "contract_address"
          4. Load ABI from abi_path
          5. Create contract instance: self.w3.eth.contract(address=..., abi=...)
          6. Set self.account = self.w3.eth.accounts[0] (Hardhat test account)
        """
        pass

    def log_round(
        self,
        round_number: int,
        accuracy: float,
        participants: List[str],
        global_weights: List[np.ndarray]
    ) -> str:
        """
        Log one training round as a permanent blockchain transaction.
        Called by fl_server/server.py after every FedAvg aggregation.

        Args:
            round_number: current FL round (1-indexed)
            accuracy: global model accuracy after this round (0.0 to 1.0)
            participants: list of node identifiers that contributed this round
                          e.g. ["OrgA", "OrgB", "OrgC"]
            global_weights: aggregated model weights from FedAvg

        Returns:
            Transaction hash as hex string

        TODO:
          1. Compute weight_hash = compute_weight_hash(global_weights) from fedavg.py
          2. Convert accuracy to integer: int(accuracy * 1000) — e.g. 74.3% → 743
             (Solidity doesn't handle floats natively)
          3. Convert weight_hash string to bytes32: self.w3.to_bytes(32, 'big')
             or use self.w3.keccak(text=weight_hash)
          4. Call contract function:
             tx_hash = self.contract.functions.logRound(
                 round_number,
                 accuracy_int,
                 participants,
                 weight_hash_bytes
             ).transact({'from': self.account})
          5. Wait for receipt: self.w3.eth.wait_for_transaction_receipt(tx_hash)
          6. Return tx_hash.hex()
        """
        pass

    def get_round(self, round_index: int) -> dict:
        """
        Retrieve a stored round record from the blockchain.
        Used by the verification panel — compare stored hash to recomputed hash.

        Args:
            round_index: 0-indexed round number

        Returns:
            Dict with keys: roundNumber, accuracy, participants, modelHash, timestamp

        TODO:
          1. Call self.contract.functions.getRound(round_index).call()
          2. Unpack the returned tuple into a dict
          3. Convert accuracy integer back to float: accuracy / 1000
          4. Return the dict
        """
        pass

    def total_rounds(self) -> int:
        """
        Return total number of rounds logged on-chain.
        TODO: call self.contract.functions.totalRounds().call()
        """
        pass

    def verify_round(self, round_index: int, weights_to_verify: List[np.ndarray]) -> bool:
        """
        Verify that weights produce the hash stored on-chain for this round.
        Used by participants to independently confirm the server ran FedAvg honestly.

        Args:
            round_index: which round to verify
            weights_to_verify: the weights a participant independently computed

        Returns:
            True if hash matches on-chain record, False if tampering detected

        TODO:
          1. Get stored round: self.get_round(round_index)
          2. Recompute hash from weights_to_verify
          3. Compare recomputed hash to stored modelHash
          4. Return True if match, False if mismatch
        """
        pass