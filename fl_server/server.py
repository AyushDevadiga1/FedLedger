"""
server.py
FedLedger Flower server — orchestrates federated training.
Runs FedAvg aggregation and logs every round to blockchain.

Run with: python -m fl_server.server --rounds 10
Then start nodes: python fl_nodes/node.py --node 1 (in separate terminals)

Imports are package-absolute (fl_server.*) because blockchain_logger.py does
the same. Running this as a plain script from inside fl_server/ puts only
fl_server/ on sys.path, so `fl_server.fedavg` is unresolvable and the import
chain breaks one level down. Launch it as a module from the repo root.
"""
import argparse
import hashlib
import json
import os

import flwr as fl
import numpy as np

from typing import List, Tuple, Optional, Dict

from fl_server.fedavg import federated_average, compute_weight_hash
from fl_server.blockchain_logger import BlockchainLogger

from sklearn.linear_model import LogisticRegression

# Path to JSON file the dashboard polls every 2 seconds
_RESULTS_PATH = os.path.join(os.path.dirname(__file__), '..', 'app', 'round_results.json')

# Per-round aggregated weights, keyed by round number as strings.
# The Verify tab loads these so a comparison can report a genuine MATCH:
# without them the only loadable weights are the invented demo templates,
# which can never hash to an on-chain value. Global weights are broadcast
# to every node each round anyway, so persisting them reveals nothing the
# protocol does not already share — raw rows stay on the nodes.
_WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), '..', 'app', 'global_weights.json')


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

        self.blockchain_logger = blockchain_logger
        self.num_rounds = num_rounds
        self.current_round = 0
        self.global_weights = None
        # Initialise here — not lazily in aggregate_fit — so any code that
        # reads self.round_results always gets a list, never an AttributeError.
        self.round_results: list = []
        # Aggregated weights per round, as plain lists keyed by round number.
        # Written to global_weights.json alongside round_results.json so the
        # Verify tab can load the exact values the chain hashed. Rebuilt from
        # scratch each round from this dict, so a fresh run starts empty —
        # same lifecycle as round_results.
        self.global_weights_log: dict = {}
        # Rounds whose blockchain log_round() call raised. Surfaced so a
        # silent "0x0" tx hash can be traced back to a cause.
        self.blockchain_failures: list = []
        # Diagnostic only: mean of the pre-aggregation local scores. Never
        # written to the chain, since it does not describe the global model.
        self.local_fit_accuracies: dict = {}
        # Participants per round, held between aggregate_fit (which knows who
        # contributed) and aggregate_evaluate (which writes the receipt).
        self._round_participants: dict = {}

        # max_iter here is inert: the server assigns coef_/intercept_ from the
        # FedAvg result and never calls fit(). Client-side convergence is what
        # governs learning quality (see fl_nodes/node.py LOCAL_MAX_ITER).
        self.model = LogisticRegression(penalty="l2", max_iter=1, warm_start=True)

    def initialize_parameters(self, client_manager):
        """
        Return initial global model parameters.
        Called once at the start of training.
        TODO: return None to let first round use client's initial weights.
        """
        return None

    def configure_fit(self, server_round, parameters, client_manager):
        """
        Configure which clients participate in this training round.
        TODO:
          1. Sample all available clients: client_manager.sample(num_clients=3)
          2. Return list of (client, FitIns(parameters, config)) tuples
        """
        clients = client_manager.sample(num_clients=3)

        config = {}

        config_list = []
        for client in clients:
            fit_instructions = fl.common.FitIns(parameters,config)
            config_list.append((client,fit_instructions))

        return config_list  


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
          1. Extract sample counts and participants from results:
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

        if not results:
            print(f'Round {server_round} : No results received from the clients #_#.')
            return None, {}

        # 1. Extract structural data from results
        # NOTE: do NOT reach for fit_res.parameters.tensors here. That
        # attribute was removed from Flower long ago; in flwr 1.7.0
        # Parameters only carries `data_type`/`tensor_type` and the raw
        # tensors. Reading it raises AttributeError and killed the whole
        # aggregate_fit before anything could be logged. The conversion in
        # step 2 is the only supported way in.
        sample_counts = [fit_res.num_examples for _, fit_res in results]
        participants = [proxy.cid for proxy, _ in results]

        # 2. Convert Flower parameters to numpy arrays
        ndarray_list = [fl.common.parameters_to_ndarrays(fit_res.parameters) for _, fit_res in results]

        # 3. Call federated_average from fedavg.py (Fulfills TODO 3)
        print(f"🔄 Executing Federated Averaging (FedAvg) for Round {server_round}...")
        self.global_weights = federated_average(ndarray_list, sample_counts)
        self.model.coef_ = self.global_weights[0]
        self.model.intercept_ = self.global_weights[1]

        # 4. Do NOT derive the on-chain accuracy from these metrics.
        #
        # Each FitRes accuracy is the score of that node's *local* model,
        # measured before aggregation. Averaging them measures the three
        # pre-aggregation models, not the global model that gets deployed —
        # so the number sealed on-chain did not describe the thing it was
        # claiming to audit. The accuracy now recorded is the aggregated
        # model's, produced by aggregate_evaluate below.
        #
        # The mean local score is still tracked per round, but only as a
        # diagnostic; it is never written to the chain.
        local_accuracies = [
            fit_res.metrics["accuracy"]
            for _, fit_res in results
            if fit_res.metrics and "accuracy" in fit_res.metrics
        ]
        if local_accuracies:
            self.local_fit_accuracies[server_round] = (
                sum(local_accuracies) / len(local_accuracies) * 100
            )
        else:
            raise RuntimeError(
                f"❌ Round {server_round} Aggregation Failed: Clients did not report an 'accuracy' metric. "
                f"Ensure client side fit() returns {{'accuracy': value}} in its metrics dictionary."
            )

        # 5. Stash what aggregate_evaluate needs: the participants that
        # contributed, and the round number. Logging is deferred to
        # aggregate_evaluate so the recorded accuracy belongs to the
        # aggregated model rather than the local ones.
        self._round_participants[server_round] = participants

        # 6. Return (aggregated_parameters, {})
        aggregated_parameters = fl.common.ndarrays_to_parameters(self.global_weights)
        return aggregated_parameters, {}


        

    def configure_evaluate(self, server_round, parameters, client_manager):
        """
        Send the aggregated global model back to every node for scoring.

        This is what makes the on-chain accuracy meaningful. Each node scores
        the *global* weights on its own held-out split and returns only the
        score — no rows leave the node, so the privacy property the dashboard
        advertises is intact. It also means the number is a mean of per-node
        scores rather than one shared test set, which the dashboard states
        explicitly instead of implying otherwise.
        """
        clients = client_manager.sample(num_clients=3)
        config = {}
        return [
            (client, fl.common.EvaluateIns(parameters, config))
            for client in clients
        ]

    def aggregate_evaluate(self, server_round, results, failures):
        """
        Average the nodes' scores of the global model and seal the round.

        The accuracy written to FLAuditLog is measured here, after
        aggregation, so the immutable record describes the global model
        rather than the pre-aggregation local models. One logRound per round,
        append-only, exactly as before — only the meaning of the number
        changed.
        """
        accuracies = [
            res.metrics["accuracy"]
            for _, res in results
            if res.metrics and "accuracy" in res.metrics
        ]
        if not accuracies:
            print(
                f"[evaluate] Round {server_round}: no node returned an accuracy "
                f"({len(failures)} failure(s)); not writing to the chain"
            )
            return None, {}

        # sklearn.score() returns a fraction in [0, 1]; the contract stores
        # int(accuracy * 1000), so convert to percent here exactly once.
        accuracy = (sum(accuracies) / len(accuracies)) * 100

        participants = self._round_participants.get(server_round, [])
        tx_hash = "0x0"
        try:
            tx_hash = self.blockchain_logger.log_round(
                round_number=server_round,
                accuracy=accuracy,
                participants=participants,
                global_weights=self.global_weights,
            )
        except Exception as e:
            # Keep the exception type: without it every failure looked
            # identical in the log, which is what made the round-2 bug so
            # hard to trace. tx_hash stays "0x0" so the round is still
            # recorded in round_results.json with its accuracy.
            print(
                f"[blockchain] Round {server_round} NOT logged: "
                f"{type(e).__name__}: {e}"
            )
            self.blockchain_failures.append(
                {"round": server_round, "error": f"{type(e).__name__}: {e}"}
            )

        self.round_results.append((server_round, accuracy, tx_hash))

        local = self.local_fit_accuracies.get(server_round)
        diagnostic = f" (pre-aggregation local mean {local:.2f}%)" if local is not None else ""
        print(
            f" Round {server_round} complete. Global model accuracy: "
            f"{accuracy:.2f}%{diagnostic}. Tx: {tx_hash}"
        )

        try:
            with open(_RESULTS_PATH, 'w') as f:
                json.dump(self.round_results, f)
        except Exception as e:
            print(f"[dashboard] Could not write round_results.json: {e}")

        # Persist the exact arrays compute_weight_hash hashed: .tolist() here
        # is the same call the hasher makes, so a file that round-trips these
        # numbers verifies with a match. Skipped only when there is nothing
        # to persist (evaluate without a preceding fit).
        if self.global_weights is not None:
            try:
                self.global_weights_log[str(server_round)] = [
                    w.tolist() for w in self.global_weights
                ]
                with open(_WEIGHTS_PATH, 'w') as f:
                    json.dump(self.global_weights_log, f)
            except Exception as e:
                print(f"[dashboard] Could not write global_weights.json: {e}")

        return accuracy, {"accuracy": accuracy}

    def evaluate(self, server_round, parameters):
        """
        Optional server-side evaluation.

        Deliberately disabled. Evaluating here would need the server to hold
        a labelled validation set, which is exactly the centralisation the
        federated design is meant to avoid. The nodes do the scoring.
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
    print("🚀 Initializing FedLedger Central Orchestration Server...")

    # 1. Instantiate the BlockchainLogger to link to the Hardhat node
    try:
        blockchain_logger = BlockchainLogger()
        print("🔗 Successfully linked to Ethereum Blockchain Auditing Layer.")
    except Exception as e:
        print(f"❌ Failed to initialize BlockchainLogger: {e}")
        print("👉 Make sure 'npx hardhat node' is running and deploy.js has been executed!")
        return

    # 2. Instantiate FedLedgerStrategy passing the logger and round limits
    strategy = FedLedgerStrategy(blockchain_logger=blockchain_logger, num_rounds=num_rounds)

    # 3. Call fl.server.start_server to bind the port and await connections
    print(f"📡 Flower Server listening on port 8080 across {num_rounds} rounds...")
    fl.server.start_server(
        server_address="0.0.0.0:8080",
        config=fl.server.ServerConfig(num_rounds=num_rounds),
        strategy=strategy
    )


if __name__ == "__main__":
    # The launcher passes --rounds through; it used to be hardcoded here, so
    # `run_fedledger.py --rounds 5` silently trained for 10.
    parser = argparse.ArgumentParser(description='FedLedger Flower server')
    parser.add_argument('--rounds', type=int, default=10)
    cli = parser.parse_args()

    print(f"Starting FedLedger server for {cli.rounds} rounds...")
    print("Waiting for 3 nodes to connect...")
    start_server(num_rounds=cli.rounds)