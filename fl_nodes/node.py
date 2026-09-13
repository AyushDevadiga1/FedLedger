"""
node.py
Federated Learning client node for FedLedger.
One script starts any node — pass the node number as an argument.
(Consolidated from the skeleton's node1.py / node2.py / node3.py)

Run with: python fl_nodes/node.py --node 1     # Organisation A
          python fl_nodes/node.py --node 2     # Organisation B
          python fl_nodes/node.py --node 3     # Organisation C
"""

import argparse
import numpy as np
import flwr as fl
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from typing import Dict, List, Tuple


# ── Node registry ────────────────────────────────────────────────────
# One entry per participating organisation. Each maps to a private data
# partition that NEVER leaves its own node.
NODE_CONFIG = {
    1: {"org": "OrgA", "data_dir": "data/node1"},
    2: {"org": "OrgB", "data_dir": "data/node2"},
    3: {"org": "OrgC", "data_dir": "data/node3"},
}


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


def load_node_data(node: int):
    """
    Load the node's private data partition from disk.
    Returns X_train, y_train, X_test, y_test.
    TODO: load from NODE_CONFIG[node]["data_dir"] (X.npy / y.npy).
          Split into train/test (e.g. 80/20 split).
          This data NEVER gets sent anywhere — only weights do.
    """
    pass


def main():
    parser = argparse.ArgumentParser(description="Start a FedLedger FL training node.")
    parser.add_argument(
        "--node", type=int, choices=[1, 2, 3], required=True,
        help="Node number: 1 = OrgA, 2 = OrgB, 3 = OrgC",
    )
    args = parser.parse_args()

    config = NODE_CONFIG[args.node]
    print(f"Starting {config['org']} node with data from {config['data_dir']}...")

    # TODO:
    #   1. Call load_node_data(args.node) to get the private partition
    #   2. Instantiate FedLedgerClient with node_id=config["org"] and the data
    #   3. Call fl.client.start_numpy_client(
    #          server_address="127.0.0.1:8080", client=client,
    #      )


if __name__ == "__main__":
    main()