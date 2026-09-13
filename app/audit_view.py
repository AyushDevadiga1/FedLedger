"""
audit_view.py
Renders the blockchain audit log panel in the Streamlit dashboard.
Shows one row per completed training round — all immutable on-chain records.
"""

import streamlit as st
import pandas as pd
from blockchain_logger import BlockchainLogger


def render_audit_panel():
    """
    Display all logged training rounds from the blockchain.

    TODO:
      1. st.subheader("Blockchain Audit Log")
      2. Instantiate BlockchainLogger()
      3. Call blockchain_logger.total_rounds() to get count
      4. Loop through all rounds: blockchain_logger.get_round(i)
      5. Build a list of dicts with keys:
           Round | Accuracy | Nodes | Weight Hash (first 16 chars) | Timestamp
      6. Display as st.dataframe() with green header
      7. Add note: "All records are permanent and tamper-proof"
      8. Show total transaction count as st.metric()
    """
    pass