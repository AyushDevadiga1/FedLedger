# FedLedger — Frontend Baseline Spec

Status: **draft for approval.** Palette is provisional and swappable — see §2.
Stack option **B** confirmed (Vite + React + Tailwind v4 + shadcn registry).

Scope: frontend only. No backend files are modified by this work.

---

## 1. Stack

| Concern | Choice | Note |
|---|---|---|
| Build | Vite + React 19 + TypeScript | `npx shadcn@latest init -t vite` |
| Styling | Tailwind v4 | via `@tailwindcss/vite`, no `tailwind.config.js` |
| Primitives | shadcn/ui registry | copied into `src/components/ui`, not a dependency |
| Node graph | `@xyflow/react` | custom edges for payload labels |
| Animation | Anime.js v4 | `svg.createMotionPath()`, `createTimeline()` |
| Charts | Bklit UI (`@bklit/*`) | Visx + Motion, peer deps auto-installed |
| Icons | `lucide-react` | SVG, tree-shakes |

Charts are the only place Bklit is used. Everything else is shadcn primitives
or hand-rolled, to avoid pulling a whole library for one component.

---

## 2. Colour tokens — PROVISIONAL

**You are still choosing the palette.** The structure below is final; the hex
values are placeholders that satisfy the stated constraints. Every colour is a
CSS custom property in `@theme`, so re-theming is a single-file edit and never
touches a component.

```css
@theme {
  /* surfaces — flat, no glow layers */
  --color-bg:        #0a0a0a;
  --color-surface:   #111111;
  --color-raised:    #161616;

  /* hairlines — 1px, never glowy */
  --color-line:      #1f1f1f;
  --color-line-hi:   #2a2a2a;

  /* text */
  --color-fg:        #ededed;
  --color-fg-muted:  #8a8a8a;
  --color-fg-dim:    #4a4a4a;

  /* ONE accent. Reused for interactive affordances only. */
  --color-accent:    <TBD>;

  /* semantic — reserved. Nothing else may use these. */
  --color-ok:        #16a34a;   /* verified */
  --color-err:       #dc2626;   /* mismatch / not logged */
}
```

Rules, enforced by review:

- No purple/blue glows, no gradient borders, no box-shadow bloom.
- `--color-accent` is the only decorative colour. Green and red mean
  *verified* and *mismatch* — never decoration.
- Monospace (`JetBrains Mono`, tabular figures) only for hashes, numbers,
  round ids and log lines. Everything else is Inter.
- Background is flat. No grid overlays, no radial hero glow, no particles.

---

## 3. Layout

Three views replace the four tabs. The Overview tab is cut; its only useful
content becomes a dismissible "how it works" note in the Federation view.

```
┌──────────────────────────────────────────────────────────┐
│ STATUS BAR — services · run state · round counter        │
├──────────────────────────────────────────────────────────┤
│ STAT STRIP — rounds · best acc · latest acc · verified  │
├───────────────────────────┬──────────────────────────────┤
│ FEDERATION                │ LEDGER                       │
│  node graph (React Flow)  │  rounds table (expandable)   │
│  replay scrubber          │  accuracy line chart         │
├───────────────────────────┴──────────────────────────────┤
│ VERIFY — round select · weights input · hash comparison  │
└──────────────────────────────────────────────────────────┘
```

Dense, left-aligned, no centred hero. Sidebar collapses under 1024px.

**Why three views:** each maps to one claim the viva must prove —
raw data never leaves a node (Federation), every round is on-chain (Ledger),
the record can be checked (Verify).

---

## 4. Animation — transparency only

Motion is allowed only where it carries information. Two rules:

1. **What moves must be labelled.** A travelling dot is decoration unless it
   says what it carries.
2. **What stays must be visible.** Each org node shows its row count pinned
   in place for the whole round.

The backend reports a round only *after* it completes — there is no live event
stream. So this is an honest **replay of a finished round**, labelled as such
in the UI. Never present it as live.

Replay steps, driven by one Anime.js timeline:

| Step | Edge/node state | Label on edge |
|---|---|---|
| train | node pulse, rows pinned | `local only · 40 rows` |
| send | payload dot travels node→server | `weights only · 15 floats · 0 rows` |
| aggregate | server node active | `FedAvg · sample-weighted` |
| seal | chain node active, tx appears | `logRound() · 0xabc…` |
| distribute | payload dot travels server→node | `global model · 15 floats` |

One scrubber steps through these. This replaces all four previous run modes
(manual / auto / speedrun / replay).

`prefers-reduced-motion` disables the timeline and advances steps instantly.

---

## 5. Adapter module — the one hard boundary

`src/lib/adapter.ts` is the **only** file that knows the backend's wire format.
No component imports `round_results.json` or knows a field is missing.

```ts
// Raw shape actually written by fl_server/server.py:162
type RawRow = [round: number, accuracy: number, txHash: string]
              | [round: number, accuracy: number, txHash: string,
                 participants: string[], timestamp: number]

export type Round = {
  round: number
  accuracyPct: number
  txHash: string | null        // null when the on-chain write failed ("0x0")
  logged: boolean
  participants: string[] | null // null — backend does not supply these
  timestamp: number | null      // null — backend does not supply these
  chainIndex: number | null     // 0-based on-chain position, see below
}

export function adaptRows(raw: unknown): Round[]
```

Four rules it enforces:

1. **Accept 3- or 5-field rows.** A 5-field row is accepted so the backend can
   be fixed later without touching the UI. Missing fields become `null`, never
   `undefined` and never a fabricated default.
2. **`chainIndex` is not `round`.** It is the count of earlier rows whose
   `txHash !== "0x0"`. Verification addresses the on-chain array, so a run
   with a failed round would otherwise drift by one.
3. **`txHash` is never presented as the weight hash.** They are different
   values; the type keeps them in separate fields.
4. **Malformed rows are dropped, not crashed on** — a half-written file during
   a poll returns `[]` rather than throwing into render.

`src/lib/verifyClient.ts` owns the `POST :8088/verify` call, coerces weights
to `0.0`-style floats (integer `0` changes the SHA-256 and fails a correct
answer), and maps `chainIndex` to the request.

`src/config/orgs.ts` is a list, not three hardcoded boxes:

```ts
export const ORGS = [
  { id: 'orgA', label: 'OrgA', nodeId: 1, icon: 'Landmark' },
  { id: 'orgB', label: 'OrgB', nodeId: 2, icon: 'Cross'    },
  { id: 'orgC', label: 'OrgC', nodeId: 3, icon: 'Landmark' },
]
```

Layout positions derive from list length, so N orgs need no code change.

---

## 6. Component inventory

| View | Components |
|---|---|
| Shell | `StatusBar`, `StatStrip` |
| Federation | `OrgGraph`, `PayloadEdge`, `ReplayScrubber`, `HowItWorks` |
| Ledger | `RoundsTable`, `RoundRow`, `HashCell`, `AccuracyChart` |
| Verify | `VerifyForm`, `HashCompare`, `VerifyResult` |
| Shared | `EmptyState`, `ErrorState`, `RelativeTime` |

Cut from v1: Overview tab, hero, stack cards, key-property cards, phase guide,
the four run modes, both block-card feeds, and the fake status pings.

---

## 7. Known constraints carried into the UI

These are backend facts, not bugs in the frontend. Each gets honest UI rather
than a workaround.

| Constraint | UI response |
|---|---|
| No `participants` / `timestamp` in JSON | Columns render `—`; not hidden, not faked |
| `accuracy` is mean local **train** accuracy | Labelled "local train acc" everywhere |
| No weights exposed anywhere | Verify needs pasted weights; tamper demo is out of reach until the backend changes |
| `chainIndex ≠ round` | Adapter computes it |
| Status dots are not real checks | Replaced with actual file-freshness + service probe, or removed |
| `file://` blocks `fetch` | Dev runs on the Vite server; `file://` shows an explicit error state |

---

## 8. Open items

- [ ] **Palette** — awaiting your selection; §2 values are placeholders.
- [ ] **`server.py` will not import by any path.** `blockchain_logger.py:20`
      uses `from fl_server.fedavg` while `server.py:18-19` use bare siblings.
      Since `server.py` is the only writer of `round_results.json`, no
      frontend work can be verified end-to-end until this is fixed. Out of
      scope here (frontend only) — but it blocks verification.
- [ ] **Serve `dist/`** — `verify_server.py` does not serve static files yet.
      Dev server is fine for now.
- [ ] Icons per org — placeholders chosen, swap freely.
