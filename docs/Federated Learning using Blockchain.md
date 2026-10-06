# Federated Learning with Blockchain Audit Trail
### Blockchain Technology Mini-Project
**Mumbai University — C-Scheme | B.E. Computer Science (AI & ML)**
**Bharat College of Engineering, Badlapur**

> **Status: historical project report.** Written against the original design.
> Where it says `node1.py`/`node2.py`/`node3.py`, the code now has one
> `fl_nodes/node.py --node N`; where it says Streamlit dashboard
> (`app/main.py` etc.), the code now ships a Vite/React dashboard in `app/web/`
> served by `app/dashboard_server.py`, and SQLite was never adopted. Current
> structure and commands: `README.md` and `docs/FedLedger_Reference.md`.

---

## Table of Contents
1. [Introduction](#introduction)
2. [Problem Statement](#problem-statement)
3. [What the Project Does](#what-the-project-does)
4. [How the Concepts Connect](#how-the-concepts-connect)
5. [System Architecture](#system-architecture)
6. [Component Breakdown](#component-breakdown)
7. [Tech Stack](#tech-stack)
8. [Smart Contract](#smart-contract)
9. [Skeleton Plan — 4 Weeks](#skeleton-plan)
10. [Repository Structure](#repository-structure)
11. [Future Scope](#future-scope)

---

## 1. Introduction

Federated Learning (FL) is a privacy-preserving machine learning paradigm where multiple organisations collaboratively train a shared AI model without sharing raw data. Each participant trains locally and shares only model weights — mathematical patterns — with a central aggregator.

However, plain Federated Learning has a fundamental trust gap. When training is complete, there is no proof that:
- All declared participants actually contributed
- The central server ran the aggregation honestly
- Reported accuracy values are real and not fabricated
- Historical training records haven't been altered

This project solves that trust gap by adding a **Blockchain Audit Layer** on top of Federated Learning. Every training round is permanently recorded as an immutable smart contract transaction — including a cryptographic hash of the aggregated model weights — creating a tamper-proof, independently verifiable audit trail of the entire collaborative training process.

**Domain:** Machine Learning + Blockchain Technology
**Integration:** Federated Learning (ML) + Ethereum Smart Contracts (Blockchain)
**Cost:** Rs. 0 — runs entirely on a local machine, no internet or cloud required

---

## 2. Problem Statement

### The Real-World Scenario

Three hospitals — Mumbai, Pune, Nagpur — want to build a shared AI model for patient readmission prediction. Together their data would produce a highly accurate model. But:

- Patient records cannot leave each hospital (DPDP Act 2023, medical privacy law)
- No hospital trusts another with raw data
- Regulatory bodies require proof that AI training was conducted fairly and privately
- Partner organisations need assurance that all parties contributed equally

**Federated Learning solves the data sharing problem.**
**Blockchain solves the trust and auditability problem.**
Neither alone is sufficient. Both together create a complete solution.

### The Trust Gap in Plain FL

| Question | Plain FL Answer | With Blockchain |
|---|---|---|
| Did all nodes participate? | Trust the server log | Immutable on-chain record |
| Is the accuracy real? | Trust the server | Hash-verified on-chain |
| Was the model tampered with? | No way to check | Weight hash proves integrity |
| Can past records be altered? | Yes — editable DB | No — cryptographically chained |
| Can a node deny participation? | Yes — logs deletable | No — transaction is permanent |

---

## 3. What the Project Does

### In One Paragraph

Three simulated organisations (nodes) train a shared ML model using Federated Learning without sharing any raw data. After every training round, the system automatically writes a permanent transaction to a local Ethereum blockchain containing the round number, participating nodes, global model accuracy, and a cryptographic hash of the aggregated weights. The result is a privacy-preserving collaborative AI system with a tamper-proof, independently verifiable audit trail — making the training process transparent to regulators, auditors, and partner organisations without revealing any private data.

### Step by Step — What Happens

```
1. Three nodes start with private local datasets (never shared)

2. Each node trains a local ML model on its own data

3. Each node sends ONLY the model weights to the central server
   (weights = mathematical patterns, not raw data)

4. Central server runs FedAvg — averages all weight sets
   into one improved global model

5. Server evaluates global model accuracy on a test set

6. Server computes SHA-256 hash of the aggregated weights
   — a cryptographic fingerprint of the exact model

7. Python automatically calls the Ethereum smart contract:
   logRound(round=7, accuracy=74.3%, nodes=[A,B,C], hash=0x4f2a...)

8. Transaction is written to the blockchain — PERMANENTLY
   No delete function. No edit function. Immutable.

9. Updated global weights sent back to all three nodes

10. Next round begins — repeat 10–20 times

11. Any participant can independently verify:
    - Recompute FedAvg from their local weight copies
    - Hash the result
    - Compare to the on-chain hash
    - Match = server was honest. Mismatch = tampering detected.
```

### What the User Sees — Dashboard

**Training Panel (Left)**
- Three node status indicators (active / idle / training)
- Round-by-round accuracy graph rising over time
- Current round number and total rounds remaining

**Blockchain Panel (Right)**
- Live transaction log — one entry per completed round
- Each entry: Round | Accuracy | Nodes | Weight Hash | Timestamp
- All entries permanent — no delete option anywhere in UI

**Verification Panel (Bottom)**
- Any participant can paste their local weight copy
- System recomputes hash and compares to on-chain record
- Green = verified honest. Red = tampering detected.

---

## 4. How the Concepts Connect

### Why Weights Don't Reveal Private Data

Model weights are aggregate statistical patterns, not data points. After training on 10,000 patient records:

```
weight_age = 0.34
weight_blood_pressure = 0.67
weight_prev_admissions = 0.89
```

These numbers mean "age has moderate predictive power." They reveal nothing about any individual patient. Reconstructing raw data from weights alone requires computational effort equivalent to breaking SHA-256 encryption — practically infeasible.

### Why Hashing the Weights Matters

Logging accuracy alone (`Round 7: 74.3%`) is insufficient. The central server could report fake accuracy while running a different model. By hashing the actual aggregated weights and storing that hash on-chain:

```python
model_hash = SHA256(aggregated_weights) = "4f2a9c3b..."
```

Any participant can independently recompute FedAvg and hash their result. If it matches the on-chain hash, the server ran the computation honestly. This is cryptographic proof of computation integrity — not just a logged number.

### Why Blockchain and Not a Database

A database with admin access can silently alter records. A blockchain:
- Stores data in blocks, each containing the hash of the previous block
- Changing any block changes its hash, breaking all subsequent blocks
- This chain-break is immediately detectable by recomputing hashes
- Data is replicated across multiple nodes — no single point of control

```
Block 6              Block 7              Block 8
────────────         ────────────         ────────────
Round: 6             Round: 7             Round: 8
Accuracy: 71.2%      Accuracy: 74.3%      Accuracy: 76.8%
Hash: 0x9b3c...      Hash: 0x4f2a...      Hash: 0x2d7e...
Prev: 0x7a1b...      Prev: 0x9b3c...      Prev: 0x4f2a...

        ↑ if Block 7 data is changed,
          its hash changes,
          Block 8's Prev no longer matches,
          tampering is immediately detectable
```

---

## 5. System Architecture

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        SYSTEM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ┌──────────────────────────────────────────────────────────┐
 │                    STREAMLIT DASHBOARD                    │
 │   Training Panel | Blockchain Log | Verification Panel   │
 └────────────────────────┬─────────────────────────────────┘
                          │ controls
                          ▼
 ┌──────────────────────────────────────────────────────────┐
 │                   FL ORCHESTRATOR                         │
 │              (Flower Server — Python)                     │
 │                                                          │
 │  1. Coordinates training rounds                          │
 │  2. Collects weights from all nodes                      │
 │  3. Runs FedAvg aggregation                              │
 │  4. Evaluates global model accuracy                      │
 │  5. Computes SHA-256 hash of global weights              │
 │  6. Calls blockchain logger after each round             │
 └───────┬─────────────────────────────────┬────────────────┘
         │ weights only                    │ log_round()
         │ (no raw data)                   │ via web3.py
         ▼                                 ▼
 ┌───────────────────┐          ┌──────────────────────────┐
 │   FL NODES (x3)   │          │   LOCAL ETHEREUM CHAIN   │
 │                   │          │      (Hardhat)            │
 │  Node 1 — Org A   │          │                          │
 │  Node 2 — Org B   │          │  FLAuditLog.sol          │
 │  Node 3 — Org C   │          │  ┌────────────────────┐  │
 │                   │          │  │ Block N            │  │
 │  Each node:       │          │  │ Round: 7           │  │
 │  • has private    │          │  │ Accuracy: 74.3%    │  │
 │    local dataset  │          │  │ Nodes: [A, B, C]   │  │
 │  • trains locally │          │  │ Hash: 0x4f2a...    │  │
 │  • sends weights  │          │  │ Timestamp: ...     │  │
 │    to server only │          │  │ IMMUTABLE ✓        │  │
 │  • NEVER shares   │          │  └────────────────────┘  │
 │    raw data       │          └──────────────────────────┘
 └───────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    ONE TRAINING ROUND — FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Node A           Node B           Node C
  trains           trains           trains
  locally          locally          locally
     │                │                │
     └────────────────┼────────────────┘
                      │ weights only (no raw data)
                      ▼
               FL Server runs FedAvg
               global_weights = mean(wA, wB, wC)
               accuracy = evaluate(global_weights)
               weight_hash = SHA256(global_weights)
                      │
           ┌──────────┴──────────┐
           │                     │
           ▼                     ▼
   Updated weights        Blockchain tx
   sent back to           logRound(round,
   all 3 nodes            accuracy, nodes,
                          weight_hash)
                          → PERMANENT
```

---

## 6. Component Breakdown

### Component 1 — FL Nodes (Python + Flower)

Each node is a Python process running a Flower client. It holds a private partition of the dataset and never sends it anywhere.

**Responsibilities:**
- Load local dataset partition at startup
- On server request: train local model for N epochs
- Send updated weights back to server
- Receive updated global weights from server
- Never expose raw data at any point

**Key files:** `node1.py`, `node2.py`, `node3.py`

---

### Component 2 — FL Server / Orchestrator (Python + Flower)

The central server coordinates all training rounds using Flower's server API.

**Responsibilities:**
- Start training rounds
- Collect weights from all connected nodes
- Run FedAvg: `global_weights = mean(all_local_weights)`
- Evaluate global model on held-out test set
- Compute SHA-256 hash of global weights
- Call blockchain logger with round results
- Distribute updated global weights back to all nodes

**Key files:** `server.py`, `fedavg.py`, `blockchain_logger.py`

---

### Component 3 — Blockchain Audit Logger (Python + web3.py)

The bridge between the FL training loop and the Ethereum smart contract.

**Responsibilities:**
- Connect to local Hardhat Ethereum node
- After each FL round: call `logRound()` on deployed smart contract
- Pass: round number, accuracy, list of participating nodes, weight hash
- Return transaction hash for dashboard display

**Key files:** `blockchain_logger.py`

```python
# Core function — called after every FL round
def log_round(round_num, accuracy, participants, global_weights):
    weight_hash = w3.keccak(text=json.dumps(
        global_weights, sort_keys=True
    ))
    tx = contract.functions.logRound(
        round_num,
        int(accuracy * 1000),    # 74.3% stored as 743
        participants,
        weight_hash
    ).transact({'from': w3.eth.accounts[0]})
    return w3.eth.get_transaction_receipt(tx)
```

---

### Component 4 — Smart Contract (Solidity)

An append-only record on the Ethereum blockchain. Once a round is logged, it cannot be altered or deleted.

**Responsibilities:**
- Accept training round data from the FL server
- Store it permanently in an on-chain array
- Allow any participant to read any round's record
- Provide no delete or edit functions — by design

**Key file:** `contracts/FLAuditLog.sol`

---

### Component 5 — Streamlit Dashboard (Python)

The user-facing interface showing both FL training progress and blockchain audit log simultaneously.

**Responsibilities:**
- Training panel: node status, round counter, live accuracy graph
- Blockchain panel: real-time transaction log as rounds complete
- Verification panel: any participant can paste weights and verify hash
- Faculty/Admin view: full audit export

**Key files:** `app/main.py`, `app/training_view.py`, `app/audit_view.py`

---

### Component 6 — Local Ethereum Environment (Hardhat)

A local Ethereum blockchain simulator. Real Ethereum behaviour, no real money, no internet needed.

**Responsibilities:**
- Run a local Ethereum JSON-RPC server on port 8545
- Provide test accounts pre-loaded with fake ETH
- Deploy and execute smart contracts
- Maintain blockchain state between Python calls

**Setup:** `npx hardhat node` — one command, runs in background

---

## 7. Tech Stack

| Tool | Purpose | Why This One | Cost |
|---|---|---|---|
| Python 3.10+ | Core language | Universal ML + web3 support | Free |
| Flower (flwr) | FL framework | Industry standard, used by Google/Samsung/BMW | Free |
| scikit-learn | ML model | Simple, CPU-friendly, sufficient for demo | Free |
| PyTorch | Alternative ML | For deeper neural network option | Free |
| Hardhat | Local Ethereum | Zero setup, real Ethereum behaviour locally | Free |
| Solidity | Smart contract language | Standard Ethereum contract language | Free |
| web3.py | Python ↔ Ethereum bridge | Official Python Ethereum library | Free |
| Streamlit | Dashboard | Python-native, no frontend knowledge needed | Free |
| SQLite | Local data storage | Zero setup, built into Python | Free |
| hashlib | SHA-256 weight hashing | Built into Python standard library | Free |
| MNIST / Iris | Dataset | Simple, well-known, demo-friendly | Free |

**Total cost: Rs. 0**
**GPU required: No — all components run on CPU**

---

## 8. Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title FLAuditLog
/// @notice Immutable audit trail for Federated Learning training rounds
/// @dev Append-only — no delete or edit functions by design

contract FLAuditLog {

    // ── Data Structure ──────────────────────────────────────────
    struct TrainingRound {
        uint256 roundNumber;
        uint256 accuracy;       // multiplied by 1000, e.g. 74300 = 74.3%
        string[] participants;  // list of node identifiers
        bytes32 modelHash;      // SHA-256 of aggregated weights
        uint256 timestamp;      // Unix timestamp of logging
        address loggedBy;       // address of FL server
    }

    // ── Storage ─────────────────────────────────────────────────
    TrainingRound[] public rounds;   // append-only array
    address public flServer;         // only FL server can log

    // ── Events ──────────────────────────────────────────────────
    event RoundLogged(
        uint256 indexed roundNumber,
        uint256 accuracy,
        bytes32 modelHash,
        uint256 timestamp
    );

    // ── Constructor ─────────────────────────────────────────────
    constructor() {
        flServer = msg.sender;
    }

    // ── Log a training round (called by FL server after FedAvg) ─
    function logRound(
        uint256 _roundNumber,
        uint256 _accuracy,
        string[] memory _participants,
        bytes32 _modelHash
    ) public {
        require(msg.sender == flServer, "Only FL server can log");

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

    // ── Read any round's record (public — anyone can verify) ────
    function getRound(uint256 index)
        public view
        returns (TrainingRound memory)
    {
        require(index < rounds.length, "Round does not exist");
        return rounds[index];
    }

    // ── Total rounds logged ──────────────────────────────────────
    function totalRounds() public view returns (uint256) {
        return rounds.length;
    }

    // ── NO delete function. NO edit function. Intentional. ──────
}
```

**What each section does:**

- `TrainingRound struct` — defines exactly what gets stored per round. Every field is permanent once written.
- `rounds[]` — the append-only array. Every round gets pushed in. Nothing gets popped out.
- `flServer` — only the FL server's Ethereum address can call `logRound()`. Prevents unauthorised logging.
- `logRound()` — called by Python via web3.py after every FedAvg cycle. Writes permanently.
- `getRound()` — public read access. Anyone — Hospital A, Hospital B, a regulator — can call this and verify any round's record.
- No delete/edit — these functions simply don't exist. The contract cannot do what it was not written to do.

---

## 9. Skeleton Plan — 4 Weeks

### Week 1 — Federated Learning Core

**Goal:** Three nodes training together, global model accuracy rising over rounds.

**Tasks:**
```
Day 1-2:
  - Install Python environment
  - Install Flower: pip install flwr
  - Create 3 dataset partitions from MNIST or Iris
  - Each partition stays in its own node — never shared

Day 3-4:
  - Build Node client (flower client class)
  - Implement local training loop (scikit-learn or PyTorch)
  - Node sends weights to server, receives global weights back

Day 5-6:
  - Build FL Server
  - Implement FedAvg aggregation manually
  - Connect all 3 nodes to server
  - Run 5 test rounds — verify accuracy increases

Day 7:
  - Testing and debugging
  - Verify: raw data never leaves any node
  - Log round results to console (temporary, before blockchain)
```

**End of Week 1 deliverable:** Three nodes training together, accuracy graph printable to console, no blockchain yet.

---

### Week 2 — Blockchain Setup + Smart Contract

**Goal:** Local Ethereum chain running, smart contract deployed, transactions sending.

**Tasks:**
```
Day 1:
  - Install Node.js and Hardhat: npm install --save-dev hardhat
  - Initialise Hardhat project: npx hardhat init
  - Start local Ethereum node: npx hardhat node
  - Verify: 20 test accounts available with fake ETH

Day 2-3:
  - Write FLAuditLog.sol smart contract (full code above)
  - Write Hardhat deployment script: scripts/deploy.js
  - Deploy contract to local chain
  - Copy contract ABI and address to Python project

Day 4-5:
  - Install web3.py: pip install web3
  - Write blockchain_logger.py
  - Test: call logRound() manually from Python
  - Verify transaction appears on local chain

Day 6-7:
  - Write verify_round() function — recompute hash and compare
  - Test full verification: log a round, retrieve it, verify hash
  - Document ABI and contract address in config file
```

**End of Week 2 deliverable:** Smart contract deployed locally, Python can log a round and retrieve it, hash verification working.

---

### Week 3 — Integration

**Goal:** FL training loop automatically writes to blockchain after every round.

**Tasks:**
```
Day 1-2:
  - Integrate blockchain_logger.py into FL server
  - After every FedAvg: compute weight hash, call logRound()
  - Run 10 full rounds — verify 10 transactions on chain

Day 3-4:
  - Build Streamlit dashboard — basic version
  - Left panel: node status indicators, accuracy chart
  - Right panel: live blockchain transaction log

Day 5-6:
  - Add verification panel to dashboard
  - User pastes weight values → system recomputes hash
  - Compare to on-chain hash → display Verified / Failed

Day 7:
  - Full end-to-end integration test
  - Start app → run 15 rounds → verify all 15 on chain
  - Fix any bugs found
```

**End of Week 3 deliverable:** Complete integrated system — FL trains, blockchain logs every round, dashboard shows both simultaneously.

---

### Week 4 — Polish + Report + Viva Prep

**Goal:** Demo-ready system, complete report, confident viva answers.

**Tasks:**
```
Day 1-2:
  - UI polish — clean up Streamlit layout
  - Add accuracy trend line to blockchain log
  - Add "Export Audit Report" button — downloads full round history as CSV

Day 3-4:
  - Write complete project report:
    - Abstract
    - Introduction and Problem Statement
    - System Design and Architecture
    - Implementation Details
    - Results and Discussion
    - Limitations and Future Scope
    - References (at least 5 research papers)

Day 5:
  - Prepare viva Q&A (see section below)
  - Practice demo until it runs in under 5 minutes

Day 6-7:
  - Final testing on clean machine (no pre-run state)
  - Record 3-minute demo video as backup
  - Submission
```

**End of Week 4 deliverable:** Polished demo, complete report, submitted.

---

## 10. Repository Structure

```
fl-blockchain-audit/
│
├── fl_nodes/
│   ├── node1.py              # Flower client — Organisation A
│   ├── node2.py              # Flower client — Organisation B
│   ├── node3.py              # Flower client — Organisation C
│   └── local_model.py        # Shared model architecture
│
├── fl_server/
│   ├── server.py             # Flower server — orchestrates rounds
│   ├── fedavg.py             # FedAvg aggregation implementation
│   └── blockchain_logger.py  # Calls smart contract after each round
│
├── blockchain/
│   ├── contracts/
│   │   └── FLAuditLog.sol    # Smart contract — append-only audit log
│   ├── scripts/
│   │   └── deploy.js         # Hardhat deployment script
│   ├── hardhat.config.js     # Hardhat configuration
│   └── artifacts/            # Auto-generated ABI after compilation
│
├── app/
│   ├── main.py               # Streamlit entry point
│   ├── training_view.py      # Node status + accuracy chart
│   ├── audit_view.py         # Blockchain transaction log
│   └── verify_view.py        # Hash verification panel
│
├── data/
│   ├── node1_data/           # Private partition — never shared
│   ├── node2_data/           # Private partition — never shared
│   └── node3_data/           # Private partition — never shared
│
├── config/
│   └── contract_config.json  # Contract address + ABI path
│
├── tests/
│   ├── test_fedavg.py        # Verify FedAvg produces correct output
│   ├── test_blockchain.py    # Verify transactions log correctly
│   └── test_verify.py        # Verify hash comparison works
│
├── requirements.txt          # Python dependencies
├── package.json              # Node.js dependencies (Hardhat)
└── README.md                 # Setup and run instructions
```

---

## 11. Future Scope

Everything below goes in the report as planned extensions. Do not build these in 1 month — write about them.

**Byzantine Attack Simulation**
One node deliberately sends poisoned weights. Extend the smart contract to flag rounds where a node's weight hash deviates significantly from others. On-chain anomaly detection that automatically records which node behaved maliciously — and when.

**FedMedian Defence with On-Chain Proof**
Replace FedAvg with FedMedian in defence mode. Log the defence activation event to the blockchain — "Round 12: Byzantine attack detected, switched to FedMedian, accuracy recovered from 41% to 73%." The entire attack-defence cycle becomes auditable.

**Token-Based Incentive System**
Nodes that consistently contribute honest, high-quality weights earn ERC-20 tokens automatically issued by the smart contract. Nodes that contribute poor or dishonest weights get slashed. Incentive alignment for real-world multi-party FL.

**IPFS Integration**
Instead of logging a hash of weights, store the full encrypted weight file on IPFS (decentralised file storage) and log only the IPFS content hash on-chain. Enables full model reconstruction from any point in training history.

**Regulatory Compliance Report Generator**
Smart contract automatically generates a formatted compliance report after training completes — who participated, when, what accuracy was achieved, cryptographic proofs included. Ready for submission to regulators without manual documentation.

**Multi-Domain Deployment**
Extend from MNIST toy dataset to real tabular data — patient readmission (healthcare), loan default (banking), fraud detection (fintech). Each domain demonstrates the same FL + Blockchain architecture applied to a different real-world problem.

---

## Key Viva Questions and Answers

**Q: Why use blockchain instead of a regular database?**
A database can be altered by whoever controls it. A blockchain transaction is immutable — once written, its hash is mathematically chained to all subsequent blocks. Altering any record breaks the chain, making tampering immediately detectable.

**Q: What ML is actually in this project?**
Federated Learning is the ML component — distributed model training across private datasets using FedAvg aggregation. The model itself is a neural network or logistic regression. The blockchain layer adds auditability to that ML process.

**Q: How does FedAvg work mathematically?**
Each node trains locally and produces a weight vector. FedAvg computes the weighted average of all weight vectors proportional to each node's dataset size. The result is a global model that has statistically learned from all datasets without seeing any of them directly.

**Q: Why hash the model weights instead of just logging accuracy?**
The server could report fake accuracy numbers while running a different model. Hashing the actual aggregated weights creates a cryptographic fingerprint. Any participant can independently recompute FedAvg and hash the result — if it matches the on-chain hash, the server ran the computation honestly.

**Q: Does this work on a real Ethereum network?**
Yes — the smart contract is standard Solidity, the web3.py calls are identical. Hardhat simulates Ethereum locally for development. Deploying to a real testnet (Sepolia) requires only changing the network configuration in hardhat.config.js. For production, the contract deploys to Ethereum mainnet with gas fees paid in real ETH.

**Q: Is this project related to current industry problems?**
Yes — the trust gap in Federated Learning is an active research problem. Healthcare federations, banking consortiums, and cross-border AI initiatives all face this challenge. Papers from IEEE 2023-2024 discuss blockchain-enhanced FL as an emerging direction. India's DPDP Act 2023 makes FL legally necessary for many sectors, and audit trails make FL legally defensible to regulators.

---

*Document prepared for: Bharat College of Engineering, Badlapur*
*Subject: Blockchain Technology — Mumbai University C-Scheme*
*B.E. Computer Science (AI & ML)*
