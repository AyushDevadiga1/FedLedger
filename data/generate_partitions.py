"""
generate_partitions.py
Splits a chosen dataset into 3 private partitions for the FL nodes.

Usage:
  python data/generate_partitions.py                       # default: iris
  python data/generate_partitions.py --dataset wine
  python data/generate_partitions.py --dataset breast_cancer
  python data/generate_partitions.py --dataset digits

Available datasets:
  iris           150 samples, 4 features,  3 classes  (default, fast)
  wine           178 samples, 13 features, 3 classes
  breast_cancer  569 samples, 30 features, 2 classes
  digits        1797 samples, 64 features, 10 classes  (largest)
"""

import argparse
import json
import os
import sys

# Windows consoles still default to cp1252, which cannot encode the arrows
# and separators printed below. The script would die on a print statement
# long after it had written the .npy files, leaving a half-finished run.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
from sklearn.datasets import (
    load_breast_cancer,
    load_digits,
    load_iris,
    load_wine,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

DATASETS = {
    "iris": {
        "loader": load_iris,
        "description": "150 samples, 4 features, 3 classes",
        "scale": False,
    },
    "wine": {
        "loader": load_wine,
        "description": "178 samples, 13 features, 3 classes",
        "scale": True,   # wine features have very different magnitudes
    },
    "breast_cancer": {
        "loader": load_breast_cancer,
        "description": "569 samples, 30 features, 2 classes",
        "scale": True,
    },
    "digits": {
        "loader": load_digits,
        "description": "1797 samples, 64 features, 10 classes",
        "scale": True,
    },
}


def load_dataset(name: str):
    """Load the chosen sklearn dataset. Scales features when the dataset
    description says magnitudes vary (wine, breast_cancer, digits)."""
    meta = DATASETS[name]
    X, y = meta["loader"](return_X_y=True)
    if meta["scale"]:
        X = StandardScaler().fit_transform(X)
    return X, y


def split_into_partitions(X, y, num_nodes: int = 3, random_seed: int = 42):
    """Split X and y into num_nodes non-overlapping stratified partitions."""
    min_class_count = int(np.min(np.bincount(y)))
    if num_nodes > min_class_count:
        raise ValueError(
            f"Cannot split into {num_nodes} nodes: smallest class has only "
            f"{min_class_count} samples. Reduce --nodes or use a bigger dataset."
        )

    skf = StratifiedKFold(n_splits=num_nodes, shuffle=True, random_state=random_seed)
    return [
        (X[test_idx], y[test_idx])
        for _, test_idx in skf.split(X, y)
    ]


def save_partitions(partitions, output_dir: str = "data"):
    """Save each partition to data/nodeN/{X,y}.npy."""
    for i, (X_part, y_part) in enumerate(partitions):
        node_dir = os.path.join(output_dir, f"node{i + 1}")
        os.makedirs(node_dir, exist_ok=True)
        np.save(os.path.join(node_dir, "X.npy"), X_part)
        np.save(os.path.join(node_dir, "y.npy"), y_part)
        print(f"  Saved Node {i + 1}: {len(X_part)} samples  →  {node_dir}/")


def save_dataset_meta(name: str, X, y, output_dir: str = "data"):
    """Write data/dataset_meta.json so the dashboard can read the active dataset."""
    meta = {
        "name": name,
        "description": DATASETS[name]["description"],
        "total_samples": int(len(X)),
        "num_features": int(X.shape[1]),
        "num_classes": int(len(np.unique(y))),
    }
    path = os.path.join(output_dir, "dataset_meta.json")
    with open(path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Metadata written to {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Partition a dataset into per-node shards for FedLedger."
    )
    parser.add_argument(
        "--dataset",
        choices=list(DATASETS.keys()),
        default="iris",
        help="Which sklearn dataset to use (default: iris)",
    )
    parser.add_argument(
        "--nodes",
        type=int,
        default=3,
        help="Number of FL nodes / partitions (default: 3)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for stratified split (default: 42)",
    )
    args = parser.parse_args()

    print(f"\n Dataset : {args.dataset}  ({DATASETS[args.dataset]['description']})")
    print(f" Nodes   : {args.nodes}")
    print(f" Seed    : {args.seed}\n")

    X, y = load_dataset(args.dataset)
    partitions = split_into_partitions(X, y, num_nodes=args.nodes, random_seed=args.seed)
    save_partitions(partitions)
    save_dataset_meta(args.dataset, X, y)

    print(f"\nDone. {args.nodes} partitions written under data/\n")
