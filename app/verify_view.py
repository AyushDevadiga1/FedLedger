"""
verify_view.py
Renders the hash verification panel.
Any participant pastes their local weights and verifies against on-chain hash.
If hashes match = server ran FedAvg honestly.
If hashes mismatch = tampering detected.
"""

import streamlit as st
import numpy as np
from blockchain_logger import BlockchainLogger


def render_verify_panel():
    """
    Verification interface for participants.

    TODO:
      1. st.subheader("Verify Round Integrity")
      2. st.number_input("Round to verify", min_value=0)
      3. st.text_area("Paste your locally computed weights (JSON format)")
      4. On button click "Verify":
           a. Parse weights from text_area (json.loads)
           b. Convert to list of numpy arrays
           c. Call blockchain_logger.verify_round(round_index, weights)
           d. If True: st.success("VERIFIED — Server ran FedAvg honestly")
           e. If False: st.error("MISMATCH — Potential tampering detected")
      5. Show the stored on-chain hash for reference
    """
    pass