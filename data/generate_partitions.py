"""
generate_partitions.py
Splits dataset into 3 private partitions for FL nodes.
Run once before starting training: python data/generate_partitions.py
"""

import os
import numpy as np
from sklearn.datasets import load_iris  # swap for MNIST if preferred
from sklearn.model_selection import StratifiedKFold
# from joblib import Memory 

# Cache logic(Optional) : Implemented for better persistence and faster response
# CACHE_DIR = os.path.join(os.getcwd(),".dataset_cache")
# memory = Memory(CACHE_DIR,verbose=0)

# @memory.cache
def load_dataset():
    """
    Load the full dataset.
    Returns X (features) and y (labels) as numpy arrays.
    TODO: swap load_iris() for MNIST if you want image classification.
    """
    X,y = load_iris(return_X_y=True)

    return X,y


def split_into_partitions(X, y, num_nodes=3, random_seed=42):
    """
    Split X and y into num_nodes non-overlapping partitions.
    Each partition has roughly equal size.
    Returns list of (X_partition, y_partition) tuples. 
    """

    # SCALING WARNING: np.bincount requires sequential integers starting from 0.
    #   Optimization fix: If switching to string labels ('cat', 'dog'), swap this 
    #     line out for: unique, counts = np.unique(y, return_counts=True)
    
    # Quick safety check for distributed setups
    min_class_count = np.min(np.bincount(y))
    if num_nodes > min_class_count:
        raise ValueError(
            f"Cannot split into {num_nodes} nodes because your smallest class "
            f"only has {min_class_count} samples. Reduce num_nodes or get more data."
        )

    # This can be scalled better if we make partitions with a function which only returns the index instead to create partition.

    skf = StratifiedKFold(
        n_splits=num_nodes,
        shuffle=True,
        random_state=random_seed
    )
    
    partition_list = [
        (X[test_index], y[test_index]) 
        for _, test_index in skf.split(X, y)
    ]

    return partition_list 

def save_partitions(partitions, output_dir="data"):
    """
    Save each partition to its node's folder as .npy files.
    Folder structure: data/node1/X.npy, data/node1/y.npy etc.
    """
    # Loop through each tuple container in your list
    for i, (X_partition, y_partition) in enumerate(partitions):
        # 1. Dynamically create the node's specific folder path (e.g., "data/node1")
        node_folder = os.path.join(output_dir, f"node{i+1}")
        
        # 2. Safely create the directory if it doesn't already exist
        os.makedirs(node_folder, exist_ok=True)
        
        # 3. Define the precise output file paths for X and y
        X_path = os.path.join(node_folder, "X.npy")
        y_path = os.path.join(node_folder, "y.npy")
        
        # 4. Save the numpy arrays directly into those paths
        np.save(X_path, X_partition)
        np.save(y_path, y_partition)
        
        print(f" Saved Node {i+1} data to: {node_folder}/")


if __name__ == "__main__":
    X, y = load_dataset()
    partitions = split_into_partitions(X, y)
    save_partitions(partitions)
    print(f"Dataset split into {len(partitions)} partitions.")
    for i, (Xp, yp) in enumerate(partitions):
        print(f"  Node {i+1}: {len(Xp)} samples")