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