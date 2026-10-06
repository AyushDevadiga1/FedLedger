# FedLedger — Implementation Reference
**Federated Learning with Blockchain Audit Trail**
Mumbai University C-Scheme · Blockchain Technology Mini-Project

---

## How to use this document

Read each section before you write that module. Every function entry tells you:
- **Concept** — why it exists, what idea it represents
- **Inputs / Outputs** — exact types
- **Key lines** — the 2–3 lines of real logic (not pasted code, pseudocode you reason through)
- **Common mistake** — the one thing that trips people up

Build order: `data/` → `fedavg.py` → `node.py` → `deploy.js` → `blockchain_logger.py` → `server.py` → `app/`

---

## Module 1 — `data/generate_partitions.py`

**Concept:** In real federated learning, each organisation already has their own data. We simulate this by taking a single public dataset (Iris) and splitting it into 3 private shards. Each shard is saved to disk — after this script, the server and other nodes never touch those files. Only the node that owns the shard loads it.

---

### `load_dataset() → (X, y)`

| | |
|---|---|
| Returns | `X: np.ndarray shape (150, 4)`, `y: np.ndarray shape (150,)` |
| Key line | `from sklearn.datasets import load_iris; data = load_iris(); return data.data, data.target` |
| Note | Iris has 150 samples, 4 features, 3 classes. This is intentionally simple — the FL protocol is the point, not model accuracy. |

---

### `split_into_partitions(X, y, num_nodes=3, random_seed=42) → list[(X_i, y_i)]`

| | |
|---|---|
| Returns | List of 3 tuples, each `(X_partition, y_partition)` |
| Key lines | Shuffle indices: `np.random.shuffle(idx)`. Split: `np.array_split(X[idx], 3)` and same for y. |
| Why shuffle? | Without shuffle, node1 gets all class-0 samples, node2 gets class-1, etc. That's unrealistic and breaks FedAvg weighting. |
| Common mistake | Forgetting to apply the same shuffle permutation to both X and y — if you shuffle them separately, labels no longer match features. Use one `idx` array for both. |

---

### `save_partitions(partitions, output_dir="data")`

| | |
|---|---|
| Input | List of 3 `(X, y)` tuples |
| Key lines | `np.save(f"data/node{i+1}/X.npy", X_part)` and `np.save(f"data/node{i+1}/y.npy", y_part)` inside a loop |
| Note | The node folders already exist (`.gitkeep` in them). `np.save` just overwrites. |

---

## Module 2 — `fl_server/fedavg.py`

**Concept:** FedAvg (McMahan et al. 2017) is the algorithm that combines local models trained on private data into one global model. The core insight: instead of averaging all models equally, we weight each node's contribution by how many samples it trained on. A node with 100 samples should have twice the influence of a node with 50 samples.

**Formula:** `global_weights = Σ (n_i / N) * weights_i`  where N = sum of all sample counts

---

### `federated_average(weights_list, sample_counts) → List[np.ndarray]`

| | |
|---|---|
| `weights_list` | `List[List[np.ndarray]]` — outer list is per-node, inner list is per-layer. e.g. `[[coef_A, intercept_A], [coef_B, intercept_B], [coef_C, intercept_C]]` |
| `sample_counts` | `List[int]` — samples each node trained on. e.g. `[50, 50, 50]` |
| Returns | `List[np.ndarray]` — one averaged array per layer, same shape as inputs |
| Key lines | `total = sum(sample_counts)`. Then for each layer index `l`: `avg_l = sum((n/total) * weights_list[i][l] for i, n in enumerate(sample_counts))`. |
| Common mistake | Iterating over nodes in the outer loop and layers in the inner loop — this produces a list of node-weighted tensors, not a list of averaged layers. Always iterate layers in the outer loop. |

---

### `compute_weight_hash(global_weights) → str`

| | |
|---|---|
| Input | `List[np.ndarray]` — the aggregated global weights |
| Returns | 64-character hex string (SHA-256 digest) |
| Key concept | This hash is the proof mechanism. Any participant who computes FedAvg on the same inputs will get the same hash. If the server tampered with weights, their hash won't match. |
| Key lines | `weights_as_list = [w.tolist() for w in global_weights]`. Then `hashlib.sha256(json.dumps(weights_as_list, sort_keys=True).encode()).hexdigest()`. |
| Why `sort_keys=True`? | JSON dict key ordering can vary by Python version. `sort_keys=True` guarantees determinism — same weights always produce the same hash regardless of environment. |
| Why `.tolist()`? | `np.ndarray` is not JSON-serialisable. `.tolist()` converts to nested Python lists which `json.dumps` handles. |

---

## Module 3 — `fl_nodes/node.py`

**Concept:** Each node is a Flower client. Flower handles all the networking — you just implement 4 methods that Flower calls at the right time. The key privacy guarantee: raw data `(X_train, y_train)` is stored as instance variables but *never passed back* to any method that talks to the server. Only `get_parameters()` result leaves the node.

---

### `FedLedgerClient.__init__(self, node_id, X_train, y_train, X_test, y_test)`

| | |
|---|---|
| Key lines | `self.node_id = node_id`, `self.X_train = X_train`, etc. Also create model: `self.model = LogisticRegression(max_iter=1000)`. |
| Why `max_iter=1000`? | Iris converges slowly. Default of 100 will throw a convergence warning on every round. |
| Privacy note | Once you assign `self.X_train`, that data stays here forever. No method you write should pass it to the server. |

---

### `get_parameters(self, config) → List[np.ndarray]`

| | |
|---|---|
| Returns | `[self.model.coef_, self.model.intercept_]` |
| Called when | Server needs to collect weights after local training |
| Common mistake | Returning the model object itself instead of its weight arrays. Flower expects numpy arrays, not sklearn objects. |

---

### `set_parameters(self, parameters) → None`

| | |
|---|---|
| Input | `parameters: List[np.ndarray]` — global weights from server |
| Key lines | `self.model.coef_ = parameters[0]`, `self.model.intercept_ = parameters[1]` |
| Called when | Server sends updated global weights at the start of each round |
| Why needed? | Without this, each node trains independently from its own starting point — that's not federated learning. |

---

### `fit(self, parameters, config) → (weights, num_examples, metrics)`

| | |
|---|---|
| Returns | `(get_parameters({}), len(self.X_train), {"accuracy": acc})` |
| Steps | 1. `set_parameters(parameters)` — sync with global model. 2. `self.model.fit(self.X_train, self.y_train)` — local training. 3. Compute local accuracy. 4. Return updated weights. |
| Common mistake | Forgetting step 1 — if you don't call `set_parameters` at the top of `fit`, each round starts from the previous round's local model, ignoring what other nodes learned. |

---

### `evaluate(self, parameters, config) → (loss, num_examples, metrics)`

| | |
|---|---|
| Returns | `(1 - accuracy, len(self.X_test), {"accuracy": accuracy})` |
| Why `1 - accuracy` as loss? | Flower expects a float "loss" (lower is better). Accuracy is the inverse. |
| Note | For Iris with LogReg, loss is not critical — accuracy is more meaningful. |

---

### `load_node_data(node: int) → (X_train, y_train, X_test, y_test)`

| | |
|---|---|
| Key lines | `X = np.load("data/nodeN/X.npy")`, `y = np.load("data/nodeN/y.npy")`. Split: `sklearn.model_selection.train_test_split(X, y, test_size=0.2, random_state=42)`. |
| Common mistake | Using a different `random_state` in each node. Use 42 everywhere for reproducibility. |

---

## Module 4 — `blockchain/scripts/deploy.js`

**Concept:** Hardhat compiles `FLAuditLog.sol` and deploys it to the local simulated Ethereum chain. After deployment, the contract has an address (like `0x5FbDB...`) — this address is how Python's web3.py finds and calls it later. The ABI (Application Binary Interface) tells web3.py what functions the contract has.

---

### `main()` in deploy.js

| | |
|---|---|
| Step 1 | `const FLAuditLog = await ethers.getContractFactory("FLAuditLog");` — compiles the .sol file |
| Step 2 | `const contract = await FLAuditLog.deploy(); await contract.waitForDeployment();` — deploys (**Ethers v6 syntax**) |
| Step 3 | `const addr = await contract.getAddress();` — get deployed address (**Ethers v6** — not `contract.address`) |
| Step 4 | Write `addr` and `abi_path` to `contract_config.json` so Python can find it |
| ⚠️ v5 vs v6 | If you see `contract.deployed()` or `contract.address` — that is Ethers v5. Hardhat Toolbox now ships v6. Use `waitForDeployment()` and `getAddress()`. |

---

## Module 5 — `fl_server/blockchain_logger.py`

**Concept:** This is the bridge between Python and Ethereum. web3.py connects to the local Hardhat node over HTTP (port 8545) — Hardhat is running a simulated blockchain that responds to Ethereum JSON-RPC calls. When you call `contract.functions.logRound(...).transact()`, web3.py sends that as a transaction to Hardhat, which mines it into a block instantly.

---

### `BlockchainLogger.__init__(self, config_path)`

| | |
|---|---|
| Step 1 | Connect: `self.w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))` |
| Step 2 | Verify: `assert self.w3.is_connected(), "Hardhat node not running"` |
| Step 3 | Load config JSON → get `contract_address` and `abi_path` |
| Step 4 | Load ABI: `json.load(open(abi_path))["abi"]` — the compiled artifact has `abi` as a key |
| Step 5 | `self.contract = self.w3.eth.contract(address=contract_address, abi=abi)` |
| Step 6 | `self.account = self.w3.eth.accounts[0]` — Hardhat provides 20 free test accounts |

---

### `log_round(self, round_number, accuracy, participants, global_weights) → str`

| | |
|---|---|
| Returns | Transaction hash as hex string |
| Step 1 | `weight_hash = compute_weight_hash(global_weights)` — import from fedavg.py |
| Step 2 | Convert accuracy: `accuracy_int = int(accuracy * 1000)` — Solidity has no float type |
| Step 3 | Convert hash to bytes32: `hash_bytes = bytes.fromhex(weight_hash)` |
| Step 4 | Call contract: `.functions.logRound(round_number, accuracy_int, participants, hash_bytes).transact({"from": self.account})` |
| Step 5 | Wait: `self.w3.eth.wait_for_transaction_receipt(tx_hash)` |
| Returns | `tx_hash.hex()` |
| Why int accuracy? | Solidity `uint256` is integer-only. `int(0.743 * 1000) = 743`. Recover with `743 / 1000 = 0.743`. |
| Why bytes32 for hash? | SHA-256 output is 32 bytes. `bytes32` in Solidity is exactly 32 bytes — efficient and exact. |

---

### `get_round(self, round_index) → dict`

| | |
|---|---|
| Key line | `result = self.contract.functions.getRound(round_index).call()` |
| Note | `.call()` reads from chain — no transaction, no gas. `.transact()` writes — costs gas (free in Hardhat). |
| Return dict keys | `roundNumber`, `accuracy` (float, /1000), `participants`, `modelHash`, `timestamp` |

---

### `verify_round(self, round_index, weights_to_verify) → bool`

| | |
|---|---|
| Concept | Any participant can take their locally-computed weights, hash them, and compare to what's on-chain. Match = server was honest. |
| Key lines | `stored = self.get_round(round_index)`. `recomputed = compute_weight_hash(weights_to_verify)`. `return recomputed == stored["modelHash"]` |

---

## Module 6 — `fl_server/server.py`

**Concept:** The Flower server orchestrates the training rounds. It does NOT see raw data — it only sees weight arrays. `FedLedgerStrategy` is a custom Flower strategy that hooks into the aggregation step to add blockchain logging.

---

### `FedLedgerStrategy` — method map

| Method | Called by Flower | Your job |
|---|---|---|
| `initialize_parameters` | Once at start | Return `None` — let first round use client's initial weights |
| `configure_fit` | Start of each round | Sample all 3 clients, return `FitIns` with current global weights |
| `aggregate_fit` | After all nodes return `fit()` results | Run FedAvg, hash, log to blockchain, return aggregated params |
| `configure_evaluate` | After aggregation | Return `[]` — we evaluate centrally in `aggregate_fit` |
| `aggregate_evaluate` | After evaluate | Return `None, {}` — not used |
| `evaluate` | Optional | Return `None` |

---

### `aggregate_fit` — the critical method

This is where everything connects. The order matters:

```
1. Extract weights_list and sample_counts from `results`
2. Convert Flower's NDArrays to numpy: fl.common.parameters_to_ndarrays(fit_res.parameters)
3. Call federated_average(weights_list, sample_counts)
4. Compute accuracy (evaluate global model on a test set, or use averaged client accuracies)
5. Call self.blockchain_logger.log_round(...)
6. Convert back to Flower format: fl.common.ndarrays_to_parameters(global_weights)
7. Return (aggregated_parameters, {})
```

**Key Flower conversion functions:**
- `fl.common.parameters_to_ndarrays(parameters)` → `List[np.ndarray]`
- `fl.common.ndarrays_to_parameters(ndarrays)` → Flower `Parameters` object

---

## Module 7 — `app/` (React Dashboard + Verify Server)

**Why not Streamlit:** The project runs 5+ parallel processes. Streamlit can't orchestrate processes and can't do real-time animations. **Why not the old single HTML file:** it was opened via `file://`, and a `file://` origin cannot `fetch()`, so the page only worked when a dev server papered over it. The dashboard is now a Vite + React app in `app/web/`, built to static files and served by `app/dashboard_server.py` over HTTP — which both gives it a real origin for `fetch()` and proxies the chain with a read-only allowlist.

---

### Data flow: server → dashboard

```
server.py  →  writes app/round_results.json after each round
               format: [[round, accuracy, tx_hash], ...]

app/dashboard_server.py  →  serves app/web/dist on http://127.0.0.1:5173
               GET  /round_results.json  → that file (404 until round 1 lands)
               GET  /chain/config        → contract address
               GET  /dataset_meta.json   → dataset shape (iris/wine/…)
               POST /chain/rpc           → read-only proxy to Hardhat :8545

app/web (React)  →  polls round_results.json every 2 seconds
                  →  on new rounds: replay diagram, extend ledger + chart
```

The JSON format is a list of lists — each inner list is one round's data positionally:
- `[0]` round number (int)
- `[1]` accuracy (float, 0–100)
- `[2]` tx_hash (hex string; `0x0` marks a round that failed to log)

---

### Replay phases (driven by the Federation tab, `src/lib/phases.ts`)

```
'train'      → nodes fit local models — only coefficients leave afterwards
'send'       → weight arrows node→server (15 floats per node)
'aggregate'  → FedAvg weighted mean on the server
'seal'       → blockchain box pulses (logRound tx confirmed)
'distribute' → global model arrows server→nodes (next round ready)
```

Each phase also moves the nodes, not just the dots: train fills a fit bar
inside every organisation, each arriving upload lands a chip in the
server's inbox (three chips, one per organisation, staggered like the
dots), and seal shows the round being hashed as an in-flight row above the
sealed blocks. All timings derive from `src/lib/motion.ts` — the replay
speed divides the phase clock and the dot travel together, and
Auto / Full / Still gates every animation at once. Speed, motion
preference and frozen snapshots persist in `localStorage`
(`fedledger:replay-speed`, `fedledger:motion`, `fedledger:snapshot-v1`).

A speed slider and a motion preference (Auto / Full / Still) control pacing; every edge is labelled with what actually crosses it.

---

### `app/verify_server.py` — hash verification API

**Concept:** The dashboard JS can't import Python — it talks to a tiny HTTP server instead. When a user pastes their local weights and clicks "verify hash", the JS POSTs to `http://127.0.0.1:8088/verify?round=N` with the weights as JSON. The server calls `BlockchainLogger().verify_round()` and returns `{"match": true/false}`.

| | |
|---|---|
| Port | 8088 |
| Endpoint | `POST /verify?round=N` |
| Body | `{"weights": [[coef values], [intercept values]]}` |
| Returns | `{"match": true}` or `{"match": false, "error": "..."}` |
| CORS | enabled — the dashboard on :5173 is cross-origin from it |
| Start | `python app/verify_server.py` (or via `run_fedledger.py`) |
| Note | prints ✅/❌ per comparison; stdout is forced to UTF-8 so a Windows console cannot crash the response |
| Honesty | the tab knows whether the feed is live: on mock data or a frozen snapshot it labels the outcome as not-evidence-about-the-shown-run (the hash comparison itself still runs against the real chain) |

---

## Tests — what each test proves

| Test file | What it verifies |
|---|---|
| `test_fedavg.py` | FedAvg math is correct — equal weights average correctly, proportional weighting works, output shape matches input |
| `test_blockchain.py` | Hardhat connection works, a round logged is retrievable, `totalRounds()` increments by 1 |
| `test_verify.py` | Same weights → same hash, different weights → different hash, hash is 64-char hex string |

Run with: `pytest tests/ -v`

---

## Start-up sequence

**One command (recommended):**
```
python run_fedledger.py
```
Starts everything in the correct order, opens dashboard automatically.

**Manual (if you want to see each process separately):**
```
Terminal 1:  cd blockchain && npx hardhat node
Terminal 2:  cd blockchain && npx hardhat run scripts/deploy.js --network localhost
Terminal 3:  cd app/web && npm install && npm run build
Terminal 4:  python app/dashboard_server.py
Terminal 5:  python -m fl_server.server        (from the repo root)
Terminal 6:  python fl_nodes/node.py --node 1
Terminal 7:  python fl_nodes/node.py --node 2
Terminal 8:  python fl_nodes/node.py --node 3
Terminal 9:  python app/verify_server.py
Browser:     http://127.0.0.1:5173
```

Run every Python command from the repo root: `server.py` imports `fl_server.*`, which does not resolve from inside `fl_server/`.

**Data must exist first (run once ever):**
```
python data/generate_partitions.py
```

---

## Quick reference — Flower API

```python
# Client side (node.py)
class MyClient(fl.client.NumPyClient):
    def get_parameters(self, config): ...  # return List[np.ndarray]
    def fit(self, parameters, config): ...  # return (List[np.ndarray], int, dict)
    def evaluate(self, parameters, config): ...  # return (float, int, dict)

fl.client.start_numpy_client(server_address="127.0.0.1:8080", client=MyClient())

# Server side (server.py)
fl.server.start_server(
    server_address="0.0.0.0:8080",
    config=fl.server.ServerConfig(num_rounds=10),
    strategy=MyStrategy()
)

# Flower parameter conversion
ndarrays = fl.common.parameters_to_ndarrays(fit_res.parameters)
params   = fl.common.ndarrays_to_parameters(ndarrays)
```

---

## Quick reference — web3.py

```python
from web3 import Web3
w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
w3.is_connected()  # True if Hardhat is running

# Read (no gas, instant)
result = contract.functions.getRound(0).call()

# Write (creates a transaction, mined instantly in Hardhat)
tx = contract.functions.logRound(...).transact({"from": account})
receipt = w3.eth.wait_for_transaction_receipt(tx)
```

---

*FedLedger · B.E. CS (AI & ML) · Bharat College of Engineering · Mumbai University*
