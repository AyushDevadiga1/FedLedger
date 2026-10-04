# FedLedger

**Federated Learning with Blockchain Audit Trail**

Three organisations train a shared ML model using Federated Learning without sharing raw data. After every training round, a permanent Ethereum transaction records the round number, accuracy, participants, and a SHA-256 hash of the aggregated model weights — a tamper-proof, independently verifiable audit trail of the whole training process.

**Stack:** Python · Flower (flwr) · scikit-learn · Hardhat · Solidity · web3.py · HTML/JS dashboard

---

## Quickstart

```
python run_fedledger.py
```

That single command starts everything in order — Hardhat node, contract deployment, FL server, all three nodes, verify server — and opens the dashboard in your browser automatically.

To stop: `Ctrl+C`

---

## Manual startup (if you want control over each process)

```
# Terminal 1 — local Ethereum chain
cd blockchain && npx hardhat node

# Terminal 2 — deploy contract (run once per session)
cd blockchain && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3 — FL server
cd fl_server && python server.py

# Terminals 4, 5, 6 — one per node
python fl_nodes/node.py --node 1
python fl_nodes/node.py --node 2
python fl_nodes/node.py --node 3

# Terminal 7 — verify API (for dashboard hash verification)
python app/verify_server.py

# Open in browser
app/index.html
```

---

## Modules

| Module | File | Responsibility |
|---|---|---|
| Launcher | `run_fedledger.py` | One-command startup — starts all 6 processes in order |
| FL Nodes | `fl_nodes/node.py` | Flower client. Trains locally, sends only weights. One script serves all nodes via `--node 1/2/3`. |
| FL Server | `fl_server/server.py` | Orchestrates rounds, writes `app/round_results.json` after each round |
| FedAvg | `fl_server/fedavg.py` | Weighted aggregation of local weights + SHA-256 weight hashing |
| Audit Bridge | `fl_server/blockchain_logger.py` | Connects Python to the smart contract via web3.py |
| Contract | `blockchain/contracts/FLAuditLog.sol` | Append-only audit log on-chain — no delete or edit functions |
| Deploy Script | `blockchain/scripts/deploy.js` | Deploys the contract, writes address to `contract_config.json` |
| Dashboard | `app/index.html` | Live FL architecture diagram, blockchain feed, hash verification |
| Verify Server | `app/verify_server.py` | Tiny HTTP server (port 8088) the dashboard calls for hash verification |
| Dataset | `data/generate_partitions.py` | Splits Iris into 3 private node partitions |
| Tests | `tests/` | Unit tests for FedAvg, blockchain logging, hash verification |

---

## Structure

```
FedLedger/
├── run_fedledger.py               # One-command launcher
├── fl_nodes/
│   └── node.py                    # Flower client (any node via --node)
├── fl_server/
│   ├── server.py                  # Flower server + FedAvg orchestration
│   ├── fedavg.py                  # FedAvg aggregation + weight hashing
│   └── blockchain_logger.py       # Ethereum audit-trail bridge (web3.py)
├── blockchain/
│   ├── contracts/FLAuditLog.sol   # Append-only audit smart contract
│   ├── scripts/deploy.js          # Hardhat deployment script
│   ├── hardhat.config.js          # Hardhat config (Ethers v6)
│   └── contract_config.json       # Contract address + ABI path (auto-written)
├── app/
│   ├── index.html                 # Dashboard — live diagram, audit log, verify
│   ├── verify_server.py           # Hash verify API on port 8088
│   └── round_results.json         # Written by server.py after each round
├── data/
│   ├── generate_partitions.py     # Split dataset into 3 private partitions
│   └── node1/ node2/ node3/       # Private node partitions (.npy files)
├── tests/
│   ├── test_fedavg.py
│   ├── test_blockchain.py
│   └── test_verify.py
├── docs/
│   └── FedLedger_Reference.md     # Function-by-function implementation guide
├── blockchain/package.json        # Hardhat Node.js dependencies
├── requirements.txt               # Python dependencies
└── README.md
```

---

## How the dashboard works

`server.py` writes `app/round_results.json` after every training round. The dashboard (`app/index.html`) polls this file every 2 seconds and:

- Animates the FL architecture diagram in real time (nodes pulse → weight arrows appear → server aggregates → blockchain seals → global weights distributed back)
- Adds a new block card to the audit feed for each completed round
- Plots the accuracy curve as rounds complete
- Lets you paste local weights and verify against the on-chain hash to prove the server ran FedAvg honestly

---

## First run

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install Hardhat (inside blockchain/)
cd blockchain && npm install && cd ..

# 3. Generate data partitions (once)
python data/generate_partitions.py

# 4. Run everything
python run_fedledger.py
```

---

*B.E. CS (AI & ML) · Bharat College of Engineering, Badlapur · Mumbai University · Blockchain Technology Mini-Project*
