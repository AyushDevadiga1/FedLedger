"""
server.py
FedLedger Flower server — orchestrates federated training.
Runs FedAvg aggregation and logs every round to blockchain.

Run with: python fl_server/server.py
Then start nodes: python fl_nodes/node1.py (in separate terminals)
"""
import hashlib

import flwr as fl
import numpy as np

from typing import List, Tuple, Optional, Dict

from fl_server.fedavg import federated_average, compute_weight_hash
from fl_server.blockchain_logger import BlockchainLogger

from sklearn.linear_model import LogisticRegression


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

        if not results:
            print(f'Round {server_round} : No results received from the clients #_#.')
            return None, {}

        # 1. Extract structural data from results
        weights_list = [fit_res.parameters.tensors for _, fit_res in results]
        sample_counts = [fit_res.num_examples for _, fit_res in results]
        participants = [proxy.cid for proxy, _ in results]

        # 2. Convert Flower parameters to numpy arrays
        ndarray_list = [fl.common.parameters_to_ndarrays(fit_res.parameters) for _, fit_res in results]

        # 3. Call federated_average from fedavg.py (Fulfills TODO 3)
        print(f"🔄 Executing Federated Averaging (FedAvg) for Round {server_round}...")
        self.global_weights = federated_average(ndarray_list, sample_counts)
        self.model.coef_ = self.global_weights[0]
        self.model.intercept_ = self.global_weights[1]

        # 4. Process decentralized client accuracy metrics
        client_accuracies = []
        for _, fit_res in results:
            if fit_res.metrics and "accuracy" in fit_res.metrics:
                client_accuracies.append(fit_res.metrics["accuracy"])
        
        if client_accuracies:
            accuracy = sum(client_accuracies) / len(client_accuracies)
            if accuracy <= 1.0:
                accuracy = accuracy * 100
        else:
            raise RuntimeError(
                f"❌ Round {server_round} Aggregation Failed: Clients did not report an 'accuracy' metric. "
                f"Ensure client side fit() returns {{'accuracy': value}} in its metrics dictionary."
            )

        # 5. Call self.blockchain_logger.log_round with exact matching parameters
        tx_hash = "0x0"
        try:
            tx_hash = self.blockchain_logger.log_round(
                round_number=server_round,
                accuracy=accuracy,
                participants=participants,
                global_weights=self.global_weights  # Cleanly passed directly to match blockchain_logger.py
            )
        except Exception as e:
            print(f"|| Blockchain Logging Transaction Failure: {e}")

        # 6. Append metrics to round_results for dashboard tracking
        if not hasattr(self, 'round_results'):
            self.round_results = []
        self.round_results.append((server_round, accuracy, tx_hash))

        # 7. Print round summary to console
        print(f" Round {server_round} complete. Accuracy: {accuracy:.2f}%. Tx: {tx_hash}")

        # 8. Return (aggregated_parameters, {})
        aggregated_parameters = fl.common.ndarrays_to_parameters(self.global_weights)
        return aggregated_parameters, {}


        

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
    print("Starting FedLedger server...")
    print("Waiting for 3 nodes to connect...")
    start_server(num_rounds=10)