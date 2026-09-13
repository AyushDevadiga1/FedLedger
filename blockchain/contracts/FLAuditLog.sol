// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title FLAuditLog
/// @notice Immutable audit trail for FedLedger training rounds
/// @dev Append-only by design — no delete or edit functions

contract FLAuditLog {

    // ── Data Structure ─────────────────────────────────────────────
    struct TrainingRound {
        uint256 roundNumber;
        uint256 accuracy;       // accuracy * 1000, e.g. 74300 = 74.3%
        string[] participants;  // node identifiers e.g. ["OrgA","OrgB","OrgC"]
        bytes32 modelHash;      // SHA-256 of aggregated weights
        uint256 timestamp;      // Unix timestamp when logged
        address loggedBy;       // address of FL server account
    }

    // ── Storage ────────────────────────────────────────────────────
    TrainingRound[] public rounds;   // append-only array — no pop()
    address public flServer;         // only FL server can write

    // ── Events ─────────────────────────────────────────────────────
    event RoundLogged(
        uint256 indexed roundNumber,
        uint256 accuracy,
        bytes32 modelHash,
        uint256 timestamp
    );

    // ── Constructor ────────────────────────────────────────────────
    constructor() {
        flServer = msg.sender;       // deployer becomes the authorised server
    }

    // ── Write: log one training round ─────────────────────────────
    // Called by Python via web3.py after every FedAvg aggregation
    function logRound(
        uint256 _roundNumber,
        uint256 _accuracy,
        string[] memory _participants,
        bytes32 _modelHash
    ) public {
        require(msg.sender == flServer, "Only FL server can log rounds");

        rounds.push(TrainingRound({
            roundNumber: _roundNumber,
            accuracy: _accuracy,
            participants: _participants,
            modelHash: _modelHash,
            timestamp: block.timestamp,
            loggedBy: msg.sender
        }));

        emit RoundLogged(_roundNumber, _accuracy, _modelHash, block.timestamp);
    }

    // ── Read: retrieve any round by index ─────────────────────────
    // Public — any participant (OrgA, OrgB, OrgC, regulator) can verify
    function getRound(uint256 index)
        public view
        returns (TrainingRound memory)
    {
        require(index < rounds.length, "Round index out of bounds");
        return rounds[index];
    }

    // ── Read: how many rounds logged ──────────────────────────────
    function totalRounds() public view returns (uint256) {
        return rounds.length;
    }

    // ── NO delete function. NO edit function. ─────────────────────
    // Immutability is enforced by what this contract CANNOT do.
    // Once logRound() is called, that record exists forever on-chain.
}