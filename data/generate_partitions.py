"""
generate_partitions.py
Splits dataset into 3 private partitions for FL nodes.
Run once before starting training: python data/generate_partitions.py
"""

import os
import numpy as np
from sklearn.datasets import load_iris  # swap for MNIST if preferred


def load_dataset():
    """
    Load the full dataset.
    Returns X (features) and y (labels) as numpy arrays.
    TODO: swap load_iris() for MNIST if you want image classification.
    """
    pass


def split_into_partitions(X, y, num_nodes=3, random_seed=42):
    """
    Split X and y into num_nodes non-overlapping partitions.
    Each partition has roughly equal size.
    Returns list of (X_partition, y_partition) tuples.
    TODO: implement numpy array_split or sklearn StratifiedShuffleSplit.
    """
    pass


def save_partitions(partitions, output_dir="data"):
    """
    Save each partition to its node's folder as .npy files.
    Folder structure: data/node1/X.npy, data/node1/y.npy etc.
    TODO: use np.save() for each partition.
    """
    pass


if __name__ == "__main__":
    X, y = load_dataset()
    partitions = split_into_partitions(X, y)
    save_partitions(partitions)
    print(f"Dataset split into {len(partitions)} partitions.")
    for i, (Xp, yp) in enumerate(partitions):
        print(f"  Node {i+1}: {len(Xp)} samples")