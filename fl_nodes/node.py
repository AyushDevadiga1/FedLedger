"""
node.py
Federated Learning client node for FedLedger.
One script starts any node — pass the node number as an argument.
(Consolidated from the skeleton's node1.py / node2.py / node3.py)

Run with: python fl_nodes/node.py --node 1     # Organisation A
          python fl_nodes/node.py --node 2     # Organisation B
          python fl_nodes/node.py --node 3     # Organisation C
"""
import os 
import warnings
import argparse
import json

import numpy as np
import flwr as fl

from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import log_loss
from typing import Dict, List, Tuple


# ── Node registry ────────────────────────────────────────────────────
# One entry per participating organisation. Each maps to a private data
# partition that NEVER leaves its own node.
NODE_CONFIG = {
    1: {"org": "OrgA", "data_dir": "data/node1"},
    2: {"org": "OrgB", "data_dir": "data/node2"},
    3: {"org": "OrgC", "data_dir": "data/node3"},
}

# Local training budget. FedAvg assumes each node runs a *converged* local
# solve before averaging; `max_iter=1` gave a single L-BFGS step, so rounds
# composited into a random walk and accuracy drifted down instead of
# converging. 100 is sklearn's own default and converges iris/wine/
# breast_cancer within a handful of iterations.
LOCAL_MAX_ITER = 100


def coef_rows(n_classes: int) -> int:
    """Number of rows sklearn will give coef_ for a given class count.

    Multiclass keeps one row per class, but a binary problem is coded as a
    single row against the second class — sklearn reports classes_=[0, 1] with
    coef_ of shape (1, n_features). Sizing coef_ from n_classes instead of
    from this rule is what made every two-class dataset (breast_cancer)
    mismatch its own declaration and fail the aggregation shape check.
    """
    return 1 if n_classes == 2 else n_classes

# Path to the metadata written by data/generate_partitions.py. It carries the
# *global* class count, which is the one thing a node cannot infer correctly
# from its own shard (see init_parameters).
DATASET_META_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "dataset_meta.json",
)


def load_global_num_classes() -> int:
    """Read the total class count for the active dataset.

    Returns None when the metadata is missing, which leaves the caller to
    fall back to what its own shard can see.
    """
    try:
        with open(DATASET_META_PATH, "r", encoding="utf-8") as fh:
            meta = json.load(fh)
        count = meta.get("num_classes")
        return int(count) if count else None
    except (OSError, ValueError, TypeError):
        return None


class FedLedgerClient(fl.client.NumPyClient):
    """
    Base Flower client for FedLedger.
    Each node instantiates this with its own private data partition.
    """

    def __init__(self, node_id: str, X_train, y_train, X_test, y_test,
                 num_classes: int | None = None):
        """
        Initialise client with private data.
        node_id: string identifier e.g. "OrgA", "OrgB", "OrgC"
        X_train, y_train: private training data — never leaves this node
        X_test, y_test: local evaluation data
        num_classes: total class count for the whole dataset. Pass this when
                     the local shard may not contain every class; see
                     init_parameters for why guessing it locally is unsafe.
        """
        self.node_id = node_id

        self.X_train = X_train
        self.X_test = X_test
        self.y_train = y_train
        self.y_test = y_test

        self.num_classes = num_classes or load_global_num_classes()
        self.local_classes = np.unique(y_train)

        self.model = LogisticRegression(
            penalty="l2", max_iter=LOCAL_MAX_ITER, warm_start=True
        )

        self.init_parameters()
    
    def init_parameters(self,**kwargs):
        """
        Intitializes the model weights as zero for the model while instantiation.

        The class count must describe the *whole* dataset, not this shard.
        If coef_ is built with fewer rows than the other nodes use, FedAvg
        adds arrays of different shapes and dies; and if this shard happens
        to lack a class that others have, its locally fitted coef_ comes back
        narrower still. So prefer the global count from dataset_meta.json and
        fall back to the shard only when that metadata is unavailable.
        """
        n_classes = self.num_classes or len(self.local_classes)
        n_features = self.X_train.shape[1]
        n_rows = coef_rows(n_classes)

        self.model.classes_ = np.arange(n_classes)
        self.model.coef_ = np.zeros((n_rows,n_features))
        self.model.intercept_ = np.zeros(n_rows)
        

    def get_parameters(self,config : dict,**kwargs) -> List[np.ndarray]:
        """
        Return current model weights as a list of numpy arrays.
        Called by Flower server to collect weights after local training.
        TODO: return [model.coef_, model.intercept_] for LogisticRegression.
        """
        if self.model.fit_intercept :     
            return [self.model.coef_,self.model.intercept_]

        return [self.model.coef_,]

    def set_parameters(self, parameters: List[np.ndarray]) -> None:
        """
        Set model weights from a list of numpy arrays.
        Called by Flower server to send updated global weights back to node.
        TODO: assign parameters[0] to model.coef_, parameters[1] to model.intercept_.

        The incoming shapes must match what init_parameters built. A mismatch
        here means this node's idea of the class count disagrees with the
        server's, which would otherwise surface much later as an opaque
        broadcast error inside FedAvg.
        """
        self._assert_aggregatable(parameters)

        self.model.coef_ = parameters[0]

        if self.model.fit_intercept :
            self.model.intercept_ = parameters[1]

    def fit(self, parameters, config=None,**kwargs) -> Tuple[List[np.ndarray], int, Dict]:
        """
        Train model on local data and return updated weights.
        This is called each round by the Flower server.
        Steps:
          1. Set parameters from server (global model weights)
          2. Train model on private local data for N epochs
          3. Return updated weights, number of training samples, metrics dict
        TODO: implement training loop. Never send raw data — only weights.
        """
        self.set_parameters(parameters)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            self.model.fit(self.X_train, self.y_train)
            print(f'[{self.node_id}] Training completed !!!')

        weights = self.get_parameters({})

        # sklearn rebuilds coef_ to match the classes actually present in
        # y_train, so a shard missing a class returns a narrower array than
        # the other nodes and the server's weighted sum raises on shape
        # mismatch. Fail loudly with the reason instead of letting the
        # aggregate blow up several layers away.
        self._assert_aggregatable(weights)

        # Score on the held-out test split — not the training set.
        # Training-set accuracy is always inflated and would make the
        # blockchain audit trail meaningless.
        accuracy = self.model.score(self.X_test, self.y_test)

        return (weights, len(self.X_train), {"accuracy": accuracy})

    def _assert_aggregatable(self, weights: List[np.ndarray]) -> None:
        """Verify these weights can be averaged with every other node's."""
        n_classes = self.num_classes or len(self.local_classes)
        expected = coef_rows(n_classes)

        if weights[0].shape[0] != expected:
            raise RuntimeError(
                f'[{self.node_id}] local fit produced coef_ with '
                f'{weights[0].shape[0]} row(s) but this dataset needs '
                f'{expected} for {n_classes} class(es) — this shard only holds '
                f'{list(self.local_classes)}. Re-generate the partitions so '
                f'every node sees every class (data/generate_partitions.py), '
                f'then re-run.'
            )
            

    def evaluate(self, parameters, config=None,**kwargs) -> Tuple[float, int, Dict]:
        """
        Score the global model on local held-out data.
        Returns: (loss, num_examples, metrics_dict)

        This is the score the server seals on-chain. It runs on the aggregated
        parameters the server broadcasts here, not on this node's own local
        model, so what gets recorded describes the global model. Only the score
        and the count travel back — the rows never leave the node.
        """
        self.set_parameters(parameters)
        loss =  log_loss(self.y_test,self.model.predict_proba(self.X_test))
        accuracy = self.model.score(self.X_test,self.y_test)

        return (loss,len(self.X_test),{"accuracy":accuracy})


def load_node_data(node: int):
    """
    Load the node's private data partition from disk.
    Returns X_train, y_train, X_test, y_test.
    TODO: load from NODE_CONFIG[node]["data_dir"] (X.npy / y.npy).
          Split into train/test (e.g. 80/20 split).
          This data NEVER gets sent anywhere — only weights do.
    """
    NODE_PATH = "DUMMY !!!"

    try:

        FILE_PATH = NODE_CONFIG[node]['data_dir']
        NODE_PATH = os.path.join(os.getcwd(),FILE_PATH)

        if not os.path.exists(NODE_PATH):
            raise FileNotFoundError(f"Directory structural profile missing.")

        X_path = os.path.join(NODE_PATH, "X.npy")
        y_path = os.path.join(NODE_PATH, "y.npy")

        X = np.load(X_path, allow_pickle=True)
        y = np.load(y_path, allow_pickle=True)        

        X_train,X_test,y_train,y_test = train_test_split(
            X,y,test_size=0.2,random_state=42
        )

        return (X_train,y_train,X_test,y_test)

    except KeyError:
        print(f"❌ Configuration Error: Node ID '{node}' is not registered in NODE_CONFIG.")
        return None
    except FileNotFoundError:
        print(f"❌ Storage Error: The data folder path '{NODE_PATH}' could not be resolved.")
        return None
    except Exception as e:
        print(f"❌ Initialization Failure: Couldn't mount dataset: {e}")
        return None    


def main():
    parser = argparse.ArgumentParser(description="Start a FedLedger FL training node.")
    parser.add_argument(
        "--node", type=int, choices=[1, 2, 3], required=True,
        help="Node number: 1 = OrgA, 2 = OrgB, 3 = OrgC",
    )
    args = parser.parse_args()

    config = NODE_CONFIG[args.node]
    print(f"Starting {config['org']} node with data from {config['data_dir']}...")

    # A shard that misses a class cannot participate in FedAvg, so report it
    # here with the actual remedy rather than letting the first round fail
    # deep inside the aggregation step.
    global_classes = load_global_num_classes()
    if global_classes:
        print(f"  dataset declares {global_classes} classes")

    # TODO:
    #   1. Call load_node_data(args.node) to get the private partition
    #   2. Instantiate FedLedgerClient with node_id=config["org"] and the data
    #   3. Call fl.client.start_numpy_client(
    #          server_address="127.0.0.1:8080", client=client,
    #      )

    # 1. Safely load the node data using the correct node index argument
    data = load_node_data(args.node)
    if data is None:
        print("❌ Failed to load private data partitions. Shutting down client node.")
        return

    X_train, y_train, X_test, y_test = data

    # 2. Instantiate client passing specific dataset partitions to instances
    client = FedLedgerClient(
        node_id=config["org"],
        X_train=X_train,
        y_train=y_train,
        X_test=X_test,
        y_test=y_test,
        num_classes=global_classes
    )

    # 3. Modern Flower orchestration interface execution block
    fl.client.start_client(
        server_address="127.0.0.1:8080",
        client=client.to_client()
    )


if __name__ == "__main__":
    main()