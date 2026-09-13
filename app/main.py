"""
main.py
FedLedger Streamlit dashboard.
Run: streamlit run app/main.py

Three panels:
  Left:   FL training progress (node status + accuracy chart)
  Right:  Blockchain audit log (live transaction feed)
  Bottom: Verification panel (hash verification)
"""

import streamlit as st
from training_view import render_training_panel
from audit_view import render_audit_panel
from verify_view import render_verify_panel


def main():
    st.set_page_config(
        page_title="FedLedger",
        page_icon=":link:",
        layout="wide"
    )

    st.title("FedLedger — Federated Learning with Blockchain Audit Trail")
    st.caption("Privacy-preserving collaborative ML with cryptographic proof of honest training")

    # ── Layout ────────────────────────────────────────────────────
    col_left, col_right = st.columns([1, 1])

    with col_left:
        # TODO: call render_training_panel() from training_view.py
        # Shows: node status indicators, round counter, accuracy line chart
        pass

    with col_right:
        # TODO: call render_audit_panel() from audit_view.py
        # Shows: live blockchain transaction log, one row per round
        pass

    st.divider()

    # TODO: call render_verify_panel() from verify_view.py
    # Shows: input field for weights, hash recomputation, verified/failed status


if __name__ == "__main__":
    main()