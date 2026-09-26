"""
fedavg.py
Federated Averaging (FedAvg) aggregation algorithm.
McMahan et al. 2017 — Communication-Efficient Learning of Deep Networks
from Decentralized Data. AISTATS 2017.

FedAvg formula:
  global_weights = sum(n_i / N * weights_i) for all nodes i
  where n_i = samples in node i, N = total samples across all nodes
"""

import numpy as np
from typing import List, Tuple


def federated_average(
    weights_list: List[List[np.ndarray]],
    sample_counts: List[int]
) -> List[np.ndarray]:
    """
    Compute weighted average of model weights across all nodes.

    Args:
        weights_list: list of weight arrays from each node
                      e.g. [[coef_node1, intercept_node1], [coef_node2, ...]]
        sample_counts: number of training samples per node
                       used to weight each node's contribution proportionally

    Returns:
        List of globally averaged weight arrays

    Example:
        Node 1: 100 samples, weights [w1_coef, w1_intercept]
        Node 2: 80 samples,  weights [w2_coef, w2_intercept]
        Node 3: 120 samples, weights [w3_coef, w3_intercept]
        Total = 300 samples
        global_coef = (100/300)*w1_coef + (80/300)*w2_coef + (120/300)*w3_coef

    TODO:
        1. Compute total_samples = sum(sample_counts)
        2. For each layer index, compute weighted average across all nodes
        3. Return list of averaged weight arrays
    """

    total_samples = sum(sample_counts)

    has_intercept = len(weights_list[0]) > 1
    
    federeated_sum_weight = np.zeros_like(weights_list[0][0],dtype=np.float64)
    if has_intercept : 
      federeated_sum_intercept = np.zeros_like(weights_list[0][1],dtype=np.float64)

    for sample_count,weight_list in zip(sample_counts,weights_list):
      federeated_sum_weight += sample_count*weight_list[0]
      if has_intercept:
        federeated_sum_intercept += sample_count*weight_list[1]

    federated_weight_avg = federeated_sum_weight/total_samples

    if has_intercept:
      federated_intercept_avg = federeated_sum_intercept/total_samples
      return [federated_weight_avg, federated_intercept_avg]

    return [federated_weight_avg,]
      

def compute_weight_hash(global_weights: List[np.ndarray]) -> str:
    """
    Compute SHA-256 hash of aggregated model weights.
    This hash is stored on-chain to enable cryptographic verification.
    Any participant can recompute this hash and compare to the on-chain value.
    If hashes match — server ran FedAvg honestly.
    If hashes don't match — tampering detected.

    Args:
        global_weights: list of numpy arrays (aggregated model weights)

    Returns:
        Hex string of SHA-256 hash e.g. "4f2a9c3b..."

    TODO:
        1. Import hashlib and json
        2. Convert global_weights to a JSON-serialisable format
           (numpy arrays are not JSON-serialisable by default — use .tolist())
        3. Compute hashlib.sha256(json.dumps(weights_as_list).encode()).hexdigest()
        4. Return hex string
    """

    import hashlib
    import json

    weights_as_list = [
        x.tolist() for x in global_weights
    ]

    hex_string = hashlib.sha256(json.dumps(weights_as_list).encode()).hexdigest()

    return hex_string