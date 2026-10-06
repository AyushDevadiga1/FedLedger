# FedLedger — Skeleton Code Reference
**Federated Learning with Blockchain Audit Trail**
Mumbai University C-Scheme | Blockchain Technology Mini-Project
B.E. Computer Science (AI & ML) | Bharat College of Engineering

> **Status: historical (original Streamlit design).** The codebase has since
> moved on: the dashboard is a Vite/React app in `app/web/` served by
> `app/dashboard_server.py` (no Streamlit, plotly or SQLite), and all three
> organisations run from a single `fl_nodes/node.py --node 1/2/3` (there are
> no `node1.py`/`node2.py`/`node3.py`). Keep this file for the reasoning and
> algorithm walkthroughs; for the structure and commands that actually work
> today see `README.md` and `docs/FedLedger_Reference.md`.

---

## Quick Context

**What FedLedger does:**
Three organisations train a shared ML model using Federated Learning without sharing raw data.
After every training round, Python automatically writes a permanent transaction to a local
Ethereum blockchain — storing round number, accuracy, participants, and a SHA-256 hash of
the aggregated model weights. Any participant can independently verify the hash to prove
the central server ran FedAvg honestly.

**The trust gap it solves:**
Plain FL has no proof that training happened honestly. FedLedger makes every round
permanently verifiable and tamper-proof via blockchain.

**Stack:** Python 3.11, Flower (flwr), scikit-learn, Hardhat, Solidity, web3.py, React/Vite dashboard
**Cost:** Rs. 0 | **GPU:** Not needed | **Internet:** Not needed (Hardhat runs locally)

---

## Repository Structure

```
fedledger/
│
├── fl_nodes/
│   ├── node.py                  # Base Flower client class
│   ├── node1.py                 # Organisation A client
│   ├── node2.py                 # Organisation B client
│   └── node3.py                 # Organisation C client
│
├── fl_server/
│   ├── server.py                # Flower server — orchestrates rounds
│   ├── fedavg.py                # FedAvg aggregation implementation
│   └── blockchain_logger.py     # Calls smart contract after each round
│
├── blockchain/
│   ├── contracts/
│   │   └── FLAuditLog.sol       # Append-only audit smart contract
│   ├── scripts/
│   │   └── deploy.js            # Hardhat deployment script
│   ├── hardhat.config.js        # Hardhat configuration
│   └── contract_config.json     # ABI path + deployed contract address
│
├── app/
│   ├── main.py                  # Streamlit entry point
│   ├── training_view.py         # Node status + accuracy chart
│   ├── audit_view.py            # Blockchain transaction log
│   └── verify_view.py           # Hash verification panel
│
├── data/
│   ├── generate_partitions.py   # Split dataset into 3 private partitions
│   ├── node1/                   # Node 1 private data (never shared)
│   ├── node2/                   # Node 2 private data (never shared)
│   └── node3/                   # Node 3 private data (never shared)
│
├── tests/
│   ├── test_fedavg.py           # Verify FedAvg produces correct output
│   ├── test_blockchain.py       # Verify transactions log correctly
│   └── test_verify.py           # Verify hash comparison works
│
├── requirements.txt
├── package.json                 # Hardhat Node.js dependencies
└── README.md
```

---

## File 1 — `data/generate_partitions.py`

**Purpose:** Split MNIST or Iris dataset into 3 non-overlapping private partitions.
Each partition goes to one node and is never shared.

```python
"""
generate_partitions.py
Splits dataset into 3 private partitions for FL nodes.
Run once before starting training: python data/generate_partitions.py
"""

import os
import numpy as np
from sklearn.datasets import load_iris  # swap for MNIST if preferred


def load_dataset():
    """
    Load the full dataset.
    Returns X (features) and y (labels) as numpy arrays.
    TODO: swap load_iris() for MNIST if you want image classification.
    """
    pass


def split_into_partitions(X, y, num_nodes=3, random_seed=42):
    """
    Split X and y into num_nodes non-overlapping partitions.
    Each partition has roughly equal size.
    Returns list of (X_partition, y_partition) tuples.
    TODO: implement numpy array_split or sklearn StratifiedShuffleSplit.
    """
    pass


def save_partitions(partitions, output_dir="data"):
    """
    Save each partition to its node's folder as .npy files.
    Folder structure: data/node1/X.npy, data/node1/y.npy etc.
    TODO: use np.save() for each partition.
    """
    pass


if __name__ == "__main__":
    X, y = load_dataset()
    partitions = split_into_partitions(X, y)
    save_partitions(partitions)
    print(f"Dataset split into {len(partitions)} partitions.")
    for i, (Xp, yp) in enumerate(partitions):
        print(f"  Node {i+1}: {len(Xp)} samples")
```

---

## File 2 — `fl_nodes/node.py`

**Purpose:** Base Flower client class. All three node files inherit from this.
Each node loads its private partition, trains locally, and sends only weights to the server.

```python
"""
node.py
Base Flower client. Handles local training and weight exchange.
Raw data NEVER leaves this node — only model weights are sent.
"""

import flwr as fl
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from typing import Dict, List, Tuple


class FedLedgerClient(fl.client.NumPyClient):
    """
    Base Flower client for FedLedger.
    Each node instantiates this with its own private data partition.
    """

    def __init__(self, node_id: str, X_train, y_train, X_test, y_test):
        """
        Initialise client with private data.
        node_id: string identifier e.g. "OrgA", "OrgB", "OrgC"
        X_train, y_train: private training data — never leaves this node
        X_test, y_test: local evaluation data
        TODO: store all parameters as instance variables.
        """
        pass

    def get_parameters(self, config) -> List[np.ndarray]:
        """
        Return current model weights as a list of numpy arrays.
        Called by Flower server to collect weights after local training.
        TODO: return [model.coef_, model.intercept_] for LogisticRegression.
        """
        pass

    def set_parameters(self, parameters: List[np.ndarray]) -> None:
        """
        Set model weights from a list of numpy arrays.
        Called by Flower server to send updated global weights back to node.
        TODO: assign parameters[0] to model.coef_, parameters[1] to model.intercept_.
        """
        pass

    def fit(self, parameters, config) -> Tuple[List[np.ndarray], int, Dict]:
        """
        Train model on local data and return updated weights.
        This is called each round by the Flower server.
        Steps:
          1. Set parameters from server (global model weights)
          2. Train model on private local data for N epochs
          3. Return updated weights, number of training samples, metrics dict
        TODO: implement training loop. Never send raw data — only weights.
        """
        pass

    def evaluate(self, parameters, config) -> Tuple[float, int, Dict]:
        """
        Evaluate global model on local test data.
        Returns: (loss, num_examples, metrics_dict)
        TODO: compute accuracy on local test set after setting parameters.
        """
        pass
```

---

## File 3 — `fl_nodes/node1.py`

**Purpose:** Instantiate and start Node 1 (Organisation A).
Nodes 2 and 3 are identical except for node_id and data path.

```python
"""
node1.py
Organisation A — Flower client node.
Run with: python fl_nodes/node1.py
Connects to Flower server and participates in federated training.
"""

import numpy as np
import flwr as fl
from node import FedLedgerClient


def load_node_data(node_id: int):
    """
    Load this node's private data partition from disk.
    Returns X_train, y_train, X_test, y_test.
    TODO: load from data/node{node_id}/X.npy and y.npy.
          Split into train/test (e.g. 80/20 split).
          This data NEVER gets sent anywhere — only weights do.
    """
    pass


def main():
    """
    Load data, create client, connect to Flower server.
    TODO:
      1. Call load_node_data(1) to get private partition
      2. Instantiate FedLedgerClient with node_id="OrgA" and the data
      3. Call fl.client.start_numpy_client(server_address="127.0.0.1:8080", client=client)
    """
    pass


if __name__ == "__main__":
    main()

# NOTE: node2.py and node3.py are identical — change node_id to 2/3
# and node_id string to "OrgB"/"OrgC"
```

---

## File 4 — `fl_server/fedavg.py`

**Purpose:** FedAvg aggregation. Takes weights from all nodes, returns one global model.
This is the mathematical core of federated learning.

```python
"""
fedavg.py
Federated Averaging (FedAvg) aggregation algorithm.
McMahan et al. 2017 — Communication-Efficient Learning of Deep Networks
from Decentralized Data. AISTATS 2017.

FedAvg formula:
  global_weights = sum(n_i / N * weights_i) for all nodes i
  where n_i = samples in node i, N = total samples across all nodes
"""

import numpy as np
from typing import List, Tuple


def federated_average(
    weights_list: List[List[np.ndarray]],
    sample_counts: List[int]
) -> List[np.ndarray]:
    """
    Compute weighted average of model weights across all nodes.
    
    Args:
        weights_list: list of weight arrays from each node
                      e.g. [[coef_node1, intercept_node1], [coef_node2, ...]]
        sample_counts: number of training samples per node
                       used to weight each node's contribution proportionally
    
    Returns:
        List of globally averaged weight arrays
    
    Example:
        Node 1: 100 samples, weights [w1_coef, w1_intercept]
        Node 2: 80 samples,  weights [w2_coef, w2_intercept]
        Node 3: 120 samples, weights [w3_coef, w3_intercept]
        Total = 300 samples
        global_coef = (100/300)*w1_coef + (80/300)*w2_coef + (120/300)*w3_coef
    
    TODO:
        1. Compute total_samples = sum(sample_counts)
        2. For each layer index, compute weighted average across all nodes
        3. Return list of averaged weight arrays
    """
    pass


def compute_weight_hash(global_weights: List[np.ndarray]) -> str:
    """
    Compute SHA-256 hash of aggregated model weights.
    This hash is stored on-chain to enable cryptographic verification.
    Any participant can recompute this hash and compare to the on-chain value.
    If hashes match — server ran FedAvg honestly.
    If hashes don't match — tampering detected.
    
    Args:
        global_weights: list of numpy arrays (aggregated model weights)
    
    Returns:
        Hex string of SHA-256 hash e.g. "4f2a9c3b..."
    
    TODO:
        1. Import hashlib and json
        2. Convert global_weights to a JSON-serialisable format
           (numpy arrays are not JSON-serialisable by default — use .tolist())
        3. Compute hashlib.sha256(json.dumps(weights_as_list).encode()).hexdigest()
        4. Return hex string
    """
    pass
```

---

## File 5 — `fl_server/blockchain_logger.py`

**Purpose:** Python bridge between FL training loop and Ethereum smart contract.
Called after every FedAvg round to log round data permanently on-chain.

```python
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
```

---

## File 6 — `fl_server/server.py`

**Purpose:** Flower server. Orchestrates all training rounds.
Calls FedAvg after each round, then logs to blockchain.

```python
"""
server.py
FedLedger Flower server — orchestrates federated training.
Runs FedAvg aggregation and logs every round to blockchain.

Run with: python fl_server/server.py
Then start nodes: python fl_nodes/node1.py (in separate terminals)
"""

import flwr as fl
import numpy as np
from typing import List, Tuple, Optional, Dict
from fedavg import federated_average, compute_weight_hash
from blockchain_logger import BlockchainLogger


# ── Global state ──────────────────────────────────────────────────────
round_results = []   # store (round, accuracy, tx_hash) for dashboard


class FedLedgerStrategy(fl.server.strategy.Strategy):
    """
    Custom Flower strategy that:
    1. Collects weights from all nodes each round
    2. Runs FedAvg aggregation
    3. Logs result to blockchain
    4. Distributes updated global weights back to nodes
    """

    def __init__(self, blockchain_logger: BlockchainLogger, num_rounds: int = 10):
        """
        TODO:
          1. Store blockchain_logger as instance variable
          2. Store num_rounds
          3. Initialise self.current_round = 0
          4. Initialise self.global_weights = None
        """
        pass

    def initialize_parameters(self, client_manager):
        """
        Return initial global model parameters.
        Called once at the start of training.
        TODO: return None to let first round use client's initial weights.
        """
        pass

    def configure_fit(self, server_round, parameters, client_manager):
        """
        Configure which clients participate in this training round.
        TODO:
          1. Sample all available clients: client_manager.sample(num_clients=3)
          2. Return list of (client, FitIns(parameters, config)) tuples
        """
        pass

    def aggregate_fit(self, server_round, results, failures):
        """
        Aggregate weights from all nodes using FedAvg.
        Log result to blockchain. Store for dashboard.
        
        Args:
            server_round: current round number
            results: list of (client_proxy, FitRes) tuples
                     FitRes contains: parameters (weights), num_examples, metrics
            failures: list of failed clients (handle gracefully)
        
        TODO:
          1. Extract weights and sample counts from results:
             weights_list = [fit_res.parameters.tensors for _, fit_res in results]
             sample_counts = [fit_res.num_examples for _, fit_res in results]
             participants = [proxy.cid for proxy, _ in results]
          2. Convert Flower parameters to numpy arrays
          3. Call federated_average(weights_list, sample_counts)
          4. Evaluate global model accuracy on a held-out test set
          5. Call self.blockchain_logger.log_round(
                 round_number=server_round,
                 accuracy=accuracy,
                 participants=participants,
                 global_weights=global_weights
             )
          6. Append (server_round, accuracy, tx_hash) to round_results
          7. Print round summary to console
          8. Return (aggregated_parameters, {})
        """
        pass

    def configure_evaluate(self, server_round, parameters, client_manager):
        """
        Configure evaluation round.
        TODO: return empty list — we evaluate centrally in aggregate_fit.
        """
        return []

    def aggregate_evaluate(self, server_round, results, failures):
        """
        Aggregate evaluation results.
        TODO: return None, {} — not used, evaluation done in aggregate_fit.
        """
        return None, {}

    def evaluate(self, server_round, parameters):
        """
        Optional server-side evaluation.
        TODO: return None — evaluation handled in aggregate_fit.
        """
        return None


def start_server(num_rounds: int = 10):
    """
    Initialise blockchain logger and start Flower server.
    
    TODO:
      1. Instantiate BlockchainLogger()
      2. Instantiate FedLedgerStrategy(blockchain_logger, num_rounds)
      3. Call fl.server.start_server(
             server_address="0.0.0.0:8080",
             config=fl.server.ServerConfig(num_rounds=num_rounds),
             strategy=strategy
         )
    """
    pass


if __name__ == "__main__":
    print("Starting FedLedger server...")
    print("Waiting for 3 nodes to connect...")
    start_server(num_rounds=10)
```

---

## File 7 — `blockchain/contracts/FLAuditLog.sol`

**Purpose:** The smart contract. Append-only audit log on Ethereum.
No delete function. No edit function. Every round is permanent.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title FLAuditLog
/// @notice Immutable audit trail for FedLedger training rounds
/// @dev Append-only by design — no delete or edit functions

contract FLAuditLog {

    // ── Data Structure ─────────────────────────────────────────────
    struct TrainingRound {
        uint256 roundNumber;
        uint256 accuracy;       // accuracy * 1000, e.g. 74300 = 74.3%
        string[] participants;  // node identifiers e.g. ["OrgA","OrgB","OrgC"]
        bytes32 modelHash;      // SHA-256 of aggregated weights
        uint256 timestamp;      // Unix timestamp when logged
        address loggedBy;       // address of FL server account
    }

    // ── Storage ────────────────────────────────────────────────────
    TrainingRound[] public rounds;   // append-only array — no pop()
    address public flServer;         // only FL server can write

    // ── Events ─────────────────────────────────────────────────────
    event RoundLogged(
        uint256 indexed roundNumber,
        uint256 accuracy,
        bytes32 modelHash,
        uint256 timestamp
    );

    // ── Constructor ────────────────────────────────────────────────
    constructor() {
        flServer = msg.sender;       // deployer becomes the authorised server
    }

    // ── Write: log one training round ─────────────────────────────
    // Called by Python via web3.py after every FedAvg aggregation
    function logRound(
        uint256 _roundNumber,
        uint256 _accuracy,
        string[] memory _participants,
        bytes32 _modelHash
    ) public {
        require(msg.sender == flServer, "Only FL server can log rounds");

        rounds.push(TrainingRound({
            roundNumber: _roundNumber,
            accuracy: _accuracy,
            participants: _participants,
            modelHash: _modelHash,
            timestamp: block.timestamp,
            loggedBy: msg.sender
        }));

        emit RoundLogged(_roundNumber, _accuracy, _modelHash, block.timestamp);
    }

    // ── Read: retrieve any round by index ─────────────────────────
    // Public — any participant (OrgA, OrgB, OrgC, regulator) can verify
    function getRound(uint256 index)
        public view
        returns (TrainingRound memory)
    {
        require(index < rounds.length, "Round index out of bounds");
        return rounds[index];
    }

    // ── Read: how many rounds logged ──────────────────────────────
    function totalRounds() public view returns (uint256) {
        return rounds.length;
    }

    // ── NO delete function. NO edit function. ─────────────────────
    // Immutability is enforced by what this contract CANNOT do.
    // Once logRound() is called, that record exists forever on-chain.
}
```

---

## File 8 — `blockchain/scripts/deploy.js`

**Purpose:** Deploy FLAuditLog contract to local Hardhat network.
Run once before starting FL training. Saves contract address to config file.

```javascript
/**
 * deploy.js
 * Deploys FLAuditLog.sol to local Hardhat Ethereum node.
 * Run: npx hardhat run scripts/deploy.js --network localhost
 * 
 * After running, copy the printed contract address into:
 *   blockchain/contract_config.json → "contract_address"
 */

const fs = require("fs");
const path = require("path");

async function main() {
  // TODO:
  // 1. Get the contract factory:
  //    const FLAuditLog = await ethers.getContractFactory("FLAuditLog");
  //
  // 2. Deploy the contract:
  //    const contract = await FLAuditLog.deploy();
  //    await contract.deployed();
  //
  // 3. Print contract address:
  //    console.log("FLAuditLog deployed to:", contract.address);
  //
  // 4. Save ABI and address to contract_config.json:
  //    const artifactPath = "./artifacts/contracts/FLAuditLog.sol/FLAuditLog.json";
  //    const config = {
  //      contract_address: contract.address,
  //      abi_path: artifactPath
  //    };
  //    fs.writeFileSync(
  //      path.join(__dirname, "../contract_config.json"),
  //      JSON.stringify(config, null, 2)
  //    );
  //    console.log("Config saved to contract_config.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

---

## File 9 — `app/main.py`

**Purpose:** Streamlit app entry point. Three-panel dashboard.

```python
"""
main.py
FedLedger Streamlit dashboard.
Run: streamlit run app/main.py

Three panels:
  Left:   FL training progress (node status + accuracy chart)
  Right:  Blockchain audit log (live transaction feed)
  Bottom: Verification panel (hash verification)
"""

import streamlit as st
from training_view import render_training_panel
from audit_view import render_audit_panel
from verify_view import render_verify_panel


def main():
    st.set_page_config(
        page_title="FedLedger",
        page_icon="🔗",
        layout="wide"
    )

    st.title("FedLedger — Federated Learning with Blockchain Audit Trail")
    st.caption("Privacy-preserving collaborative ML with cryptographic proof of honest training")

    # ── Layout ────────────────────────────────────────────────────
    col_left, col_right = st.columns([1, 1])

    with col_left:
        # TODO: call render_training_panel() from training_view.py
        # Shows: node status indicators, round counter, accuracy line chart
        pass

    with col_right:
        # TODO: call render_audit_panel() from audit_view.py
        # Shows: live blockchain transaction log, one row per round
        pass

    st.divider()

    # TODO: call render_verify_panel() from verify_view.py
    # Shows: input field for weights, hash recomputation, verified/failed status


if __name__ == "__main__":
    main()
```

---

## File 10 — `app/training_view.py`

**Purpose:** Left panel — shows FL training progress in real time.

```python
"""
training_view.py
Renders the FL training panel in the Streamlit dashboard.
Shows node status, current round, and accuracy over time.
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from typing import List, Tuple


def render_node_status(nodes: List[str], active_nodes: List[str]):
    """
    Display status indicators for each FL node.
    Green = active and training. Grey = idle.
    
    Args:
        nodes: all node identifiers ["OrgA", "OrgB", "OrgC"]
        active_nodes: nodes currently training this round
    
    TODO:
      Use st.columns(len(nodes)) to create one column per node.
      In each column: show node name and coloured indicator.
      st.success() for active, st.info() for idle.
    """
    pass


def render_accuracy_chart(round_results: List[Tuple[int, float]]):
    """
    Plot global model accuracy over FL rounds as a line chart.
    
    Args:
        round_results: list of (round_number, accuracy) tuples
    
    TODO:
      1. Convert to pandas DataFrame with columns ["Round", "Accuracy"]
      2. Use plotly or st.line_chart() to render
      3. Add horizontal reference line at 0.5 (random baseline)
    """
    pass


def render_training_panel():
    """
    Main training panel renderer.
    Reads round_results from fl_server/server.py (shared state or SQLite).
    
    TODO:
      1. st.subheader("FL Training Progress")
      2. Show current round / total rounds
      3. Call render_node_status()
      4. Call render_accuracy_chart()
      5. Add st.metric() for current accuracy, improvement from last round
    """
    pass
```

---

## File 11 — `app/audit_view.py`

**Purpose:** Right panel — shows blockchain transaction log.

```python
"""
audit_view.py
Renders the blockchain audit log panel in the Streamlit dashboard.
Shows one row per completed training round — all immutable on-chain records.
"""

import streamlit as st
import pandas as pd
from blockchain_logger import BlockchainLogger


def render_audit_panel():
    """
    Display all logged training rounds from the blockchain.
    
    TODO:
      1. st.subheader("Blockchain Audit Log")
      2. Instantiate BlockchainLogger()
      3. Call blockchain_logger.total_rounds() to get count
      4. Loop through all rounds: blockchain_logger.get_round(i)
      5. Build a list of dicts with keys:
           Round | Accuracy | Nodes | Weight Hash (first 16 chars) | Timestamp
      6. Display as st.dataframe() with green header
      7. Add note: "All records are permanent and tamper-proof"
      8. Show total transaction count as st.metric()
    """
    pass
```

---

## File 12 — `app/verify_view.py`

**Purpose:** Verification panel — any participant can verify a round's hash.

```python
"""
verify_view.py
Renders the hash verification panel.
Any participant pastes their local weights and verifies against on-chain hash.
If hashes match = server ran FedAvg honestly.
If hashes mismatch = tampering detected.
"""

import streamlit as st
import numpy as np
from blockchain_logger import BlockchainLogger


def render_verify_panel():
    """
    Verification interface for participants.
    
    TODO:
      1. st.subheader("Verify Round Integrity")
      2. st.number_input("Round to verify", min_value=0)
      3. st.text_area("Paste your locally computed weights (JSON format)")
      4. On button click "Verify":
           a. Parse weights from text_area (json.loads)
           b. Convert to list of numpy arrays
           c. Call blockchain_logger.verify_round(round_index, weights)
           d. If True: st.success("VERIFIED — Server ran FedAvg honestly")
           e. If False: st.error("MISMATCH — Potential tampering detected")
      5. Show the stored on-chain hash for reference
    """
    pass
```

---

## File 13 — `requirements.txt`

```
# Federated Learning
flwr==1.5.0
numpy==1.24.3
scikit-learn==1.3.0

# Blockchain
web3==6.9.0

# Dashboard
streamlit==1.28.0
plotly==5.17.0
pandas==2.1.1

# Utilities
python-dotenv==1.0.0
```

---

## File 14 — `package.json`

```json
{
  "name": "fedledger-blockchain",
  "version": "1.0.0",
  "description": "Hardhat Ethereum environment for FedLedger",
  "devDependencies": {
    "hardhat": "^2.19.0",
    "@nomicfoundation/hardhat-toolbox": "^3.0.0"
  }
}
```

---

## File 15 — `hardhat.config.js`

```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      // Hardhat provides 20 test accounts automatically
      // No private key configuration needed for local development
    }
  }
};
```

---

## File 16 — `tests/test_fedavg.py`

```python
"""
test_fedavg.py
Unit tests for FedAvg aggregation and weight hashing.
Run: pytest tests/test_fedavg.py -v
"""

import numpy as np
import pytest
from fl_server.fedavg import federated_average, compute_weight_hash


class TestFedAvg:

    def test_equal_weights_equal_samples(self):
        """
        When all nodes have identical weights and equal sample counts,
        FedAvg should return weights identical to the inputs.
        TODO: create 3 identical weight arrays, call federated_average,
              assert result equals the input weights (within float tolerance).
        """
        pass

    def test_proportional_weighting(self):
        """
        Node with more samples should have higher influence on global model.
        TODO: node1 has 100 samples, node2 has 0 samples.
              global weights should equal node1's weights exactly.
        """
        pass

    def test_output_shape_matches_input(self):
        """
        Output weight arrays must have same shape as input weight arrays.
        TODO: create random weight arrays, assert output shapes match.
        """
        pass


class TestWeightHash:

    def test_same_weights_same_hash(self):
        """
        Identical weights must always produce identical hash.
        TODO: compute hash twice on same weights, assert equality.
        """
        pass

    def test_different_weights_different_hash(self):
        """
        Different weights must produce different hash (collision resistance).
        TODO: compute hash on two different weight arrays, assert inequality.
        """
        pass

    def test_hash_is_hex_string(self):
        """
        Hash must be a 64-character hex string (SHA-256 output).
        TODO: compute hash, assert isinstance(hash, str) and len(hash) == 64.
        """
        pass
```

---

## Setup and Run Instructions

### Step 1 — Install Python dependencies
```bash
pip install -r requirements.txt
```

### Step 2 — Install Hardhat
```bash
npm install
```

### Step 3 — Generate dataset partitions
```bash
python data/generate_partitions.py
```

### Step 4 — Start local Ethereum node
```bash
npx hardhat node
# Keep this terminal open
```

### Step 5 — Deploy smart contract (new terminal)
```bash
npx hardhat run blockchain/scripts/deploy.js --network localhost
# Copy the printed contract address into blockchain/contract_config.json
```

### Step 6 — Start FL server (new terminal)
```bash
python fl_server/server.py
# Server waits for 3 nodes to connect
```

### Step 7 — Start FL nodes (three new terminals)
```bash
# Terminal A
python fl_nodes/node1.py

# Terminal B
python fl_nodes/node2.py

# Terminal C
python fl_nodes/node3.py
```

### Step 8 — Open dashboard (new terminal)
```bash
streamlit run app/main.py
# Open http://localhost:8501
```

### Step 9 — Run tests
```bash
pytest tests/ -v
```

---

## What Each TODO Means

Every `TODO` in this file is one function to implement. The docstring above each TODO tells you:
- What the function does
- What arguments it takes
- What it returns
- The exact approach to implement it

Start with this order:
1. `data/generate_partitions.py` — get data working
2. `fl_server/fedavg.py` — get FedAvg working
3. `fl_nodes/node.py` — get one node training
4. `fl_nodes/node1.py` — connect node to server
5. `fl_server/server.py` — run first FL training loop (no blockchain yet)
6. `blockchain/contracts/FLAuditLog.sol` — deploy contract
7. `blockchain/scripts/deploy.js` — deploy and save address
8. `fl_server/blockchain_logger.py` — connect Python to blockchain
9. Integrate logger into `server.py`
10. `app/` files — build dashboard last

Do not touch the dashboard until Steps 1-9 are working end to end.
A working backend with a broken dashboard is recoverable.
A broken backend with a polished dashboard is not.
