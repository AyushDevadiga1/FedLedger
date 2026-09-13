"""
training_view.py
Renders the FL training panel in the Streamlit dashboard.
Shows node status, current round, and accuracy over time.
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from typing import List, Tuple


def render_node_status(nodes: List[str], active_nodes: List[str]):
    """
    Display status indicators for each FL node.
    Green = active and training. Grey = idle.

    Args:
        nodes: all node identifiers ["OrgA", "OrgB", "OrgC"]
        active_nodes: nodes currently training this round

    TODO:
      Use st.columns(len(nodes)) to create one column per node.
      In each column: show node name and coloured indicator.
      st.success() for active, st.info() for idle.
    """
    pass


def render_accuracy_chart(round_results: List[Tuple[int, float]]):
    """
    Plot global model accuracy over FL rounds as a line chart.

    Args:
        round_results: list of (round_number, accuracy) tuples

    TODO:
      1. Convert to pandas DataFrame with columns ["Round", "Accuracy"]
      2. Use plotly or st.line_chart() to render
      3. Add horizontal reference line at 0.5 (random baseline)
    """
    pass


def render_training_panel():
    """
    Main training panel renderer.
    Reads round_results from fl_server/server.py (shared state or SQLite).

    TODO:
      1. st.subheader("FL Training Progress")
      2. Show current round / total rounds
      3. Call render_node_status()
      4. Call render_accuracy_chart()
      5. Add st.metric() for current accuracy, improvement from last round
    """
    pass