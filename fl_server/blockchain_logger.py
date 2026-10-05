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
import os
import hashlib

from web3 import Web3
from typing import List
import numpy as np

from fl_server.fedavg import compute_weight_hash

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
        self.w3 = Web3(Web3.HTTPProvider('http://127.0.0.1:8545'))

        assert self.w3.is_connected()

        abs_config_path = self._get_absolute_path(config_path)

        try:
            with open(abs_config_path, 'r') as config_file:
                config = json.load(config_file)
        except FileNotFoundError:
            raise FileNotFoundError(
                f"Could not find config file at {os.path.abspath(abs_config_path)}. "
                f"Current working directory is {os.getcwd()}"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to parse config JSON at {abs_config_path}. Error: {e}")
            

        abs_abi_path = self._get_absolute_path(config['abi_path'])

        try:
            with open(abs_abi_path,'r') as abi_file:
                abi_json = json.load(abi_file)
                abi = abi_json.get('abi',abi_json)
        except FileNotFoundError:
            raise FileNotFoundError(f"ABI file missing at: {abs_abi_path}")
        except Exception as e:
            raise RuntimeError(f"Failed to parse config JSON at {abs_config_path}. Error: {e}")

        checksum_address = Web3.to_checksum_address(config['contract_address'])
        
        self.contract = self.w3.eth.contract(address=checksum_address, abi=abi)
        self.account = self.w3.eth.accounts[0]

    def _get_absolute_path(self, target_path: str) -> str:

        """Helper function to resolve relative paths against the project root."""
        if os.path.isabs(target_path):
            return target_path
            
        # Locate logger.py directory, then move up one level to the project root
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        
        return os.path.join(project_root, target_path)   

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

        weight_hash = compute_weight_hash(global_weights)

        accuracy_int = int(accuracy*1000) # In 1000s - so sol can handle this

        weight_hash_bytes = self.w3.keccak(text=weight_hash)

        tx_hash = self.contract.functions.logRound(
                 round_number,
                 accuracy_int,
                 participants,
                 weight_hash_bytes
            ).transact({'from': self.account}) # Eth account

        # Hardhat auto-mines, so the receipt is normally ready immediately. The
        # bound is a safety net so a wedged node cannot hang the FL round
        # forever; it is NOT the cause of rounds going unlogged. An earlier
        # comment here blamed this wait for missing rounds, which was wrong —
        # TimeExhausted merely converts a wait into an exception that
        # aggregate_fit swallows into tx_hash "0x0".
        self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30) # Wait for mining

        # HexBytes.hex() drops the "0x" prefix in current hexbytes releases,
        # which breaks the dashboard's block-explorer link. to_hex() is
        # always 0x-prefixed regardless of version.
        return Web3.to_hex(tx_hash)



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

        raw_round_data = self.contract.functions.getRound(round_index).call()
        
        round_dict = {
            "roundNumber": raw_round_data[0],
            "accuracy": raw_round_data[1] / 1000, # 3. Convert accuracy integer back to float
            "participants": raw_round_data[2],
            "modelHash": Web3.to_hex(raw_round_data[3]) if isinstance(raw_round_data[3], bytes) else raw_round_data[3],
            "timestamp": raw_round_data[4]
        }

        return round_dict

    def total_rounds(self) -> int:
        """
        Return total number of rounds logged on-chain.
        TODO: call self.contract.functions.totalRounds().call()
        """
        return self.contract.functions.totalRounds().call()

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
        
        stored_round = self.get_round(round_index)
        stored_hash = stored_round["modelHash"]

        calc_weight_hash = compute_weight_hash(weights_to_verify)
        calc_weight_hash_bytes = self.w3.keccak(text=calc_weight_hash)

        calc_weight_hash_hex = calc_weight_hash_bytes.hex()

        # Handle cases where get_round might return a string with or without the '0x' prefix
        if not stored_hash.startswith("0x"):
            stored_hash = "0x" + stored_hash
        if not calc_weight_hash_hex.startswith("0x"):
            calc_weight_hash_hex = "0x" + calc_weight_hash_hex

        # Compare recomputed hash to stored modelHash and return outcome
        if calc_weight_hash_hex == stored_hash:
            print(f"✅ Round {round_index} Integrity Verified! Hashes match.")
            return True
        else:
            print(f"❌ WARNING: Tampering detected for Round {round_index}! Hashes mismatch.")
            return False        
