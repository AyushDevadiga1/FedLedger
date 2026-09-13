# FedLedger

**Federated Learning with Blockchain Audit Trail**

Blockchain Technology Mini-Project — Mumbai University C-Scheme
B.E. Computer Science (AI & ML) | Bharat College of Engineering

Three organisations train a shared ML model using Federated Learning without
sharing raw data. After every training round, a permanent Ethereum transaction
records the round number, accuracy, participants, and a SHA-256 hash of the
aggregated model weights — a tamper-proof, independently verifiable audit trail
of the whole training process.

**Stack:** Python · Flower (flwr) · scikit-learn · Hardhat · Solidity · web3.py · Streamlit
**Cost:** Rs. 0 | **GPU:** not needed | **Internet:** not needed (local Hardhat node)

---

## Modules

| Module | Resource | Responsibility |
|---|---|---|
| FL Nodes | `fl_nodes/node.py` | Flower client. Trains locally on a private partition, sends only weights to the server. One script serves all nodes via `--node 1/2/3`. |
| FL Server | `fl_server/server.py` | Orchestrates training rounds and distributes the global model. |
| FedAvg | `fl_server/fedavg.py` | Weighted aggregation of local weights + SHA-256 weight hashing. |
| Audit Bridge | `fl_server/blockchain_logger.py` | Connects Python to the smart contract; logs every round on-chain via web3.py. |
| Contract | `blockchain/contracts/FLAuditLog.sol` | Append-only audit log — no delete or edit functions. |
| Contract Deploy | `blockchain/scripts/deploy.js` | Hardhat script that deploys the contract and saves its address. |
| Dashboard | `app/main.py` | Streamlit three-panel UI: training progress, blockchain audit log, hash verification. |
| Dataset | `data/generate_partitions.py` | Splits the dataset into three private node partitions. |
| Tests | `tests/` | Unit tests for FedAvg, blockchain logging and hash verification. |

---

## Structure

```
FedLedger/
├── fl_nodes/
│   └── node.py                # Flower client — any node serves itself via --node
├── fl_server/
│   ├── server.py              # Flower server — orchestrates rounds
│   ├── fedavg.py              # FedAvg aggregation + weight hashing
│   └── blockchain_logger.py   # Ethereum audit-trail bridge (web3.py)
├── blockchain/
│   ├── contracts/FLAuditLog.sol   # Append-only audit smart contract
│   ├── scripts/deploy.js          # Hardhat deployment script
│   ├── hardhat.config.js          # Hardhat configuration
│   └── contract_config.json       # Contract address + ABI path
├── app/
│   ├── main.py                # Streamlit entry point (3-panel dashboard)
│   ├── training_view.py       # Node status + accuracy chart
│   ├── audit_view.py          # Blockchain transaction log
│   └── verify_view.py         # Hash verification panel
├── data/
│   ├── generate_partitions.py # Split dataset into 3 private partitions
│   └── node1/ node2/ node3/   # Private node partitions (never shared)
├── tests/
│   ├── test_fedavg.py         # FedAvg aggregation + hashing
│   ├── test_blockchain.py     # Round logging on-chain
│   └── test_verify.py         # Hash verification
├── package.json               # Hardhat Node.js dependencies
├── requirements.txt           # Python dependencies
└── README.md
```

---

Every file carries `TODO` markers describing exactly what to implement —
each module's skeleton is committed separately and implemented in order.