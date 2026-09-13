# FedLedger

**Federated Learning with Blockchain Audit Trail**

Three organisations train a shared ML model using Federated Learning without
sharing raw data. After every training round, Python writes a permanent
transaction to a local Ethereum blockchain — storing round number, accuracy,
participants, and a SHA-256 hash of the aggregated model weights. Any
participant can independently verify the hash to prove the central server ran
FedAvg honestly.

**Stack:** Python 3.11, Flower (flwr), scikit-learn, Hardhat, Solidity, web3.py, Streamlit, SQLite
**Cost:** Rs. 0 | **GPU:** Not needed | **Internet:** Not needed (Hardhat runs locally)

---

## Repository Structure

```
fedledger/
│
├── fl_nodes/                  # Flower clients — one per organisation
│   ├── node.py                # Base Flower client class
│   ├── node1.py               # Organisation A client (OrgA)
│   ├── node2.py               # Organisation B client (OrgB)
│   └── node3.py               # Organisation C client (OrgC)
│
├── fl_server/
│   ├── server.py              # Flower server — orchestrates rounds
│   ├── fedavg.py              # FedAvg aggregation + weight hashing
│   └── blockchain_logger.py   # Calls smart contract after each round
│
├── blockchain/
│   ├── contracts/
│   │   └── FLAuditLog.sol     # Append-only audit smart contract
│   ├── scripts/
│   │   └── deploy.js          # Hardhat deployment script
│   ├── hardhat.config.js      # Hardhat configuration
│   └── contract_config.json   # ABI path + deployed contract address
│
├── app/                       # Streamlit dashboard
│   ├── main.py                # Entry point (3-panel layout)
│   ├── training_view.py       # Node status + accuracy chart
│   ├── audit_view.py          # Blockchain transaction log
│   └── verify_view.py         # Hash verification panel
│
├── data/
│   ├── generate_partitions.py # Split dataset into 3 private partitions
│   ├── node1/                 # Node 1 private data (never shared)
│   ├── node2/                 # Node 2 private data (never shared)
│   └── node3/                 # Node 3 private data (never shared)
│
├── tests/
│   ├── test_fedavg.py         # Verify FedAvg output + weight hashing
│   ├── test_blockchain.py     # Verify transactions log correctly
│   └── test_verify.py         # Verify hash comparison works
│
├── requirements.txt           # Python dependencies
├── package.json               # Hardhat Node.js dependencies
└── README.md
```

---

## Setup and Run Instructions

### Step 1 — Install Python dependencies
```bash
pip install -r requirements.txt
```

### Step 2 — Install Hardhat (run from project root)
```bash
npm install
```

### Step 3 — Generate dataset partitions
```bash
python data/generate_partitions.py
```

### Step 4 — Start local Ethereum node
```bash
cd blockchain
npx hardhat node
# Keep this terminal open
```

### Step 5 — Deploy smart contract (new terminal)
```bash
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
# The contract address is written to blockchain/contract_config.json automatically
```

### Step 6 — Start FL server (new terminal, from project root)
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

## Implementation Order

Every file contains `TODO` markers describing exactly what to implement.
Follow this order — do not touch the dashboard until the backend works end to end.

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

---

## Notes on the skeleton

- The smart contract is **append-only** — there is deliberately no delete or
  edit function. Once `logRound()` is called, that record is permanent.
- `blockchain/hardhat.config.js` lives inside `blockchain/`, so run all
  Hardhat commands from that directory (as shown above).
- `blockchain/contract_config.json` uses `abi_path` relative to the
  `blockchain/` folder (`./artifacts/...`). The Python `BlockchainLogger`
  should resolve this path relative to the config file's location.
- Raw data never leaves a node — only model weights are transmitted.