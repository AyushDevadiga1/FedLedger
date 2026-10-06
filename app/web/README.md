# FedLedger Dashboard

The dashboard half of FedLedger: a Vite + React + TypeScript single-page app
that visualises a federated learning run and its on-chain audit trail.

Built output (`npm run build` → `dist/`) is served by `app/dashboard_server.py`
on http://127.0.0.1:5173 together with the JSON the backend writes. Run it via
`python run_fedledger.py` (which builds this app first) or manually:

```bash
npm install
npm run build          # or: npm run dev (Vite dev server, needs dashboard_server running)
python ../../app/dashboard_server.py
```

## Where data comes from

| Endpoint | Producer | Used for |
|---|---|---|
| `GET /round_results.json` | `fl_server/server.py` after each round | round feed, ledger table, accuracy chart |
| `GET /global_weights.json` | `fl_server/server.py` after each round | per-round aggregates the chain hashed — the Verify tab's "load live weights" button reads the entry for the selected round |
| `GET /dataset_meta.json` | `data/generate_partitions.py` | dataset stats on the Overview tab |
| `GET /chain/config` | `blockchain/scripts/deploy.js` | contract address |
| `POST /chain/rpc` | `app/dashboard_server.py` → Hardhat `:8545` (read-only proxy) | receipts, block numbers, contract reads |
| `POST http://127.0.0.1:8088/verify` | `app/verify_server.py` | hash comparison on the Verify tab |

The feed polls every 2 s; `404` on `round_results.json` is a normal state
(round 1 has not finished yet), not an error.

## Motion

All timings come from `src/lib/motion.ts`, not from the components that
move. The Federation replay reads two controls from it:

- speed slider — divides both the phase clock and the payload-dot travel,
  so 2× is twice as fast everywhere at once;
- motion preference (Auto / Full / Still) — Auto follows the OS
  reduced-motion setting, Full always animates, Still lights the links
  without moving the dots.

Entrance reveals (Overview lists, tiles) stagger through one CSS primitive
(`.fedledger-reveal` + `--reveal-index`), so any number of children
animates correctly with no per-count code.

## Persistence

These survive a reload via `localStorage`, all under `fedledger:*` keys:

| Key | What |
|---|---|
| `fedledger:motion` | motion preference (auto / full / reduced) |
| `fedledger:replay-speed` | Federation replay speed |
| `fedledger:snapshot-v1` | frozen round snapshot (raw triples, re-parsed on load) |

## Screenshots

```bash
# from the repo root, with the dashboard live on :5173 and Chrome installed
node scripts/take-screenshots.js   # → outputs/1.PNG … 4.PNG (one per tab)
```

Uses Chrome's remote-debugging protocol over WebSocket; no npm
dependencies. Paths assume a default Windows Chrome install — adjust
`CHROME` in the script otherwise.

## Layout

```
src/
├── App.tsx                  # shell, tabs, snapshot persistence
├── components/
│   ├── tabs/                # overview · training (federation) · audit (ledger) · verify
│   ├── federation-graph.tsx # replayable FL architecture diagram
│   ├── accuracy-chart.tsx   # held-out accuracy curve
│   ├── crypto-receipt.tsx   # on-chain receipt display
│   ├── round-inspector.tsx  # per-round detail
│   ├── dropzone.tsx         # weights file drop/paste + parsing
│   └── ui/                  # shared primitives
├── hooks/                   # use-round-feed, use-replay, use-dataset-meta, …
└── lib/                     # ledger parsing, chain reads, phases, motion, templates
```

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b && vite build → dist/
npm run preview  # serve dist/ locally
npm run lint     # oxlint
```
