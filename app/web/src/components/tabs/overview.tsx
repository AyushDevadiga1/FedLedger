import {
  AlertTriangle,
  Check,
  Download,
  Minus,
  Upload,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import {
  EmptyState,
  Eyebrow,
  Panel,
  PanelHead,
  StatTile,
  Token,
} from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { useDatasetMeta } from '@/hooks/use-dataset-meta'
import { parseRounds, summarise, type LedgerRound } from '@/lib/ledger'
import { PHASES } from '@/lib/phases'
import { revealStyle } from '@/lib/motion'
import {
  ORGANISATIONS,
  organisationRows,
  parameterCount,
} from '@/lib/federation'
import {
  downloadTemplate,
  fetchTemplate,
  SNAPSHOT_TEMPLATES,
  WEIGHT_TEMPLATES,} from '@/lib/templates'

/**
 * What the system can actually prove, stated as claims with the evidence
 * attached. This replaces the old hero, stack cards and key-property cards:
 * those were marketing copy dressed as documentation, and none of it was data.
 * For a viva this page is worth more, because every line points at something a
 * reviewer can independently check.
 *
 * The first check states a number the dataset decides — how many floats one
 * node ships — so it is parameterised rather than hardcoded. Fifteen was
 * correct only on iris.
 */
function claimsFor(floatsPerNode: number): {
  claim: string
  evidence: string
  check: string
}[] {
  return [
    {
      claim: 'Raw records never leave a node',
      evidence:
        'Each of the three organisations trains on its own shard and ships only updated coefficients. Nothing in the wire format is a record.',
      check: `Inspect what a node sends — ${floatsPerNode} floats, no rows.`,
    },
    {
      claim: 'Every logged round is permanent',
      evidence:
        'FLAuditLog has no update or delete entry point, so a sealed round cannot be edited even by the deployer.',
      check: 'Read the contract; there is no function that mutates a record.',
    },
    {
      claim: 'A logged model can be re-derived and checked',
      evidence:
        'Recompute FedAvg over the node updates, hash the result, and compare against the hash stored on-chain for that round.',
      check: 'Use the Verify tab against the same round index.',
    },
  ]
}

/**
 * The argument the project rests on, in the order a reviewer asks for it:
 * the constraint, what the system does about it, and what the chain adds that
 * a results file on its own could not.
 */
const BEATS = [
  {
    eyebrow: 'the constraint',
    title: 'The rows cannot be pooled',
    body: 'Each organisation holds data it is not allowed to hand over, so the model has to travel instead of the data. Federated learning solves exactly that — and stops there: the server still sees every update and still reports every number, with nothing recording what it did in between.',
    tone: 'fedledger-tone fedledger-tone-neutral',
    dot: 'bg-border-strong',
  },
  {
    eyebrow: 'what this does',
    title: 'Train in place, ship coefficients',
    body: 'Each organisation fits a logistic regression on its own shard and returns only its updated coefficients and intercept. The server takes the sample-weighted mean of the three updates — the single place weights combine — scores that global model on every node and sends it back out.',
    tone: 'fedledger-tone fedledger-tone-accent',
    dot: 'bg-primary',
  },
  {
    eyebrow: 'what that buys',
    title: 'A hash anyone can re-derive',
    body: 'Every round is SHA-256 hashed and appended to FLAuditLog through logRound(). Recompute the hash from the same weights and compare it with the stored one: a match means the model you derived is the model that was sealed, and a mismatch is a difference you can point at.',
    tone: 'fedledger-tone fedledger-tone-verified',
    dot: 'bg-verified',
  },
] as const

/** What each tab is for, as this page describes it. */
const TABS_GUIDE = [
  {
    tab: 'Overview',
    what: 'this page — claims, limits, snapshots',
    tone: 'fedledger-tone fedledger-tone-accent',
    dot: 'bg-primary',
  },
  {
    tab: 'Federation',
    what: 'one round, phase by phase, with what crosses each link',
    tone: 'fedledger-tone fedledger-tone-accent',
    dot: 'bg-primary',
  },
  {
    tab: 'Ledger',
    what: 'every round with its receipt read from the chain',
    tone: 'fedledger-tone fedledger-tone-neutral',
    dot: 'bg-border-strong',
  },
  {
    tab: 'Verify',
    what: 'recompute a round’s weight hash and compare it on-chain',
    tone: 'fedledger-tone fedledger-tone-verified',
    dot: 'bg-verified',
  },
] as const

/** The two columns of the trust argument. */
const TRUST_GAP = {
  without: {
    label: 'a results file alone',
    tone: 'fedledger-tone fedledger-tone-neutral',
    rows: [
      'The server writes the accuracy and the weights-derived hash to a file it also owns, so a reader cannot tell a computed round from a typed one.',
      'Nothing binds a hash to the round it belongs to. Earlier entries can be rewritten in place, and the file shows only what is there now.',
      'To check anything you still have to trust whoever hands you the weights.',
    ],
  },
  withChain: {
    label: 'with an append-only chain',
    tone: 'fedledger-tone fedledger-tone-verified',
    rows: [
      'logRound() is the only function that writes, and the contract has no counterpart that edits or removes what it wrote.',
      'Each round becomes its own transaction: a block number, a timestamp the chain assigns, and the writer recorded as loggedBy.',
      'The stored hash is public, so a check runs against a value nobody on the server side can quietly swap out.',
    ],
  },
} as const

/**
 * What `python run_fedledger.py` actually starts, in the order it starts it.
 * Kept as prose rather than a diagram: the Federation tab already draws the
 * data path, and this is about processes and ports, not about arrows.
 */
const SERVICES = [
  {
    port: '—',
    file: 'run_fedledger.py',
    what: 'Starts everything below in order, waits for each port, then opens this page. Ctrl+C stops the lot.',
  },
  {
    port: ':8545',
    file: 'blockchain/ · hardhat node',
    what: 'A local Ethereum chain. No gas, no testnet, no internet — the whole audit trail is reproducible on one machine.',
  },
  {
    port: '—',
    file: 'FLAuditLog.sol',
    what: 'Deployed once per session. The deployer address is the only writer, and the contract has no update or delete entry point.',
  },
  {
    port: ':8080',
    file: 'fl_server/server.py',
    what: 'The Flower server. Runs FedAvg over the three updates and writes app/round_results.json after every round.',
  },
  {
    port: '—',
    file: 'fl_nodes/node.py --node 1|2|3',
    what: 'The three organisations, one script each, holding data/node1, node2 and node3. Each ships weights only.',
  },
  {
    port: '—',
    file: 'fl_server/blockchain_logger.py',
    what: 'The web3.py bridge: SHA-256 of the aggregated weights, then one logRound() transaction per round.',
  },
  {
    port: ':5173',
    file: 'app/dashboard_server.py',
    what: 'Serves the built dashboard and proxies read-only chain calls, so no write method ever reaches the browser.',
  },
  {
    port: ':8088',
    file: 'app/verify_server.py',
    what: 'Recomputes a hash from supplied weights and compares it against the one the chain holds.',
  },
] as const

function ClaimRow({
  claim,
  evidence,
  check,
  supported,
  index,
}: {
  claim: string
  evidence: string
  check: string
  supported: boolean | null
  /** Stagger step for the entrance reveal. */
  index: number
}) {
  return (
    <li
      style={revealStyle(index)}
      className={`fedledger-reveal grid gap-x-6 gap-y-2 border-t border-border px-5 py-4 md:grid-cols-[1fr_1.25fr] ${
        supported
          ? 'shadow-[inset_2px_0_0_0_hsl(var(--verified)/0.6)]'
          : 'shadow-[inset_2px_0_0_0_hsl(var(--border-strong))]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          {supported === null ? (
            <Minus className="size-4 text-subtle" />
          ) : supported ? (
            <Check className="size-4 text-verified" />
          ) : (
            <AlertTriangle className="size-4 text-destructive" />
          )}
        </span>
        <span className="text-sm font-medium text-foreground">{claim}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted-foreground">{evidence}</p>
        <p className="font-mono text-xs text-subtle">check: {check}</p>
      </div>
    </li>
  )
}

function LimitGroup({
  title,
  note,
  rows,
}: {
  title: string
  note: string
  rows: { missing: string; why: string }[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Eyebrow>{title}</Eyebrow>
        <span className="text-xs text-subtle">{note}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.missing}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <Token>{row.missing}</Token>
            <span className="text-sm text-subtle">{row.why}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OverviewTab({
  rounds,
  verified,
  snapshotActive,
  onLoadSnapshot,
  onClearSnapshot,
}: {
  rounds: LedgerRound[]
  verified: ReadonlySet<number>
  /** True while the visible rounds are a frozen snapshot, not the live feed. */
  snapshotActive: boolean
  onLoadSnapshot?: (rounds: LedgerRound[]) => void
  onClearSnapshot?: () => void
}) {
  const stats = summarise(rounds, verified)
  const datasetMeta = useDatasetMeta()
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  /**
   * Shared by the file picker and the demo template, so both go through the
   * same parseRounds guard. A template that fails to parse would otherwise
   * look identical to a template that worked.
   *
   * A loaded snapshot replaces the live feed everywhere — header counter
   * included — and persists to localStorage, so the first page reopens
   * exactly where the demo was left.
   */
  const acceptSnapshot = useCallback(
    (text: string, label: string) => {
      try {
        const parsed = parseRounds(JSON.parse(text))
        if (parsed.length === 0) {
          setSnapshotError(
            `${label} parsed, but held no rounds — expected an array of [round, accuracy, txHash]`,
          )
          return
        }
        onLoadSnapshot?.(parsed)
        setSnapshotError(null)
      } catch {
        setSnapshotError(`${label} is not valid JSON.`)
      }
    },
    [onLoadSnapshot],
  )

  const saveSnapshot = useCallback(() => {
    const raw = rounds.map((r) => [r.round, r.accuracy, r.txHash])
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fedledger_snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [rounds])

  const loadSnapshot = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      acceptSnapshot(await file.text(), file.name)
      if (fileRef.current) fileRef.current.value = ''
    },
    [acceptSnapshot],
  )

  // Figures, claims and limits all need rounds; the explanation, the
  // toolbar and the file formats do not, so they render either way and the
  // empty run gets documentation instead of a blank page.
  const empty = rounds.length === 0

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">

        {/* ── what this is ── */}
        <Panel className="fedledger-hero">
          <div className="fedledger-hero-sheen" aria-hidden />
          <PanelHead
            title="What FedLedger is"
            meta="federated learning, with a record anyone can re-check"
          />
          <div className="flex flex-col gap-5 px-5 py-5">
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Three organisations want one shared model but cannot put their
              rows in the same place. Each fits a logistic regression on its
              own shard and hands the server nothing but its updated
              coefficients; the server averages the three updates, and every
              round it produces is SHA-256 hashed and sealed into{' '}
              <span className="font-mono text-primary">FLAuditLog</span>, a
              Solidity contract on a local Hardhat chain. No row crosses a
              link, and once a round is recorded there is no function in the
              contract that can rewrite it.
            </p>

            {/* The argument, in the order a reviewer asks for it. Each card
                states one move; the claim panel further down is where each one
                gets attached to something checkable. */}
            <div className="grid gap-px border border-border bg-border [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {BEATS.map(({ eyebrow, title, body, tone, dot }, i) => (
                <div
                  key={eyebrow}
                  style={revealStyle(i)}
                  className={`fedledger-reveal fedledger-tone flex flex-col gap-1.5 bg-card px-4 py-3 ${tone}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
                    <Eyebrow>{eyebrow}</Eyebrow>
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {title}
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-border bg-muted/40 px-3 py-2">
              <span className="font-mono text-xs text-subtle">one command</span>
              <code className="font-mono text-xs text-primary">
                python run_fedledger.py
              </code>
              <span className="text-xs text-subtle">
                builds this page, starts the chain, deploys the contract, runs
                the server and all three nodes, then opens the dashboard
              </span>
            </div>
          </div>
        </Panel>

        {/* ── one round, phase by phase ── */}
        {/* Driven by PHASES, the same array the Federation scrubber steps
            through, so the prose here cannot drift from the replay. */}
        <Panel>
          <PanelHead
            title="How one round runs"
            meta="the five phases the Federation tab replays"
          />
          <ol>
            {PHASES.map((phase, i) => (
              <li
                key={phase.id}
                style={revealStyle(i)}
                className="fedledger-reveal grid gap-x-4 gap-y-1.5 border-t border-border px-5 py-3 md:grid-cols-[9rem_1fr]"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-subtle">
                    {phase.step}/{PHASES.length}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {phase.label}
                  </span>
                </div>
                {/* items-start keeps the payload pill shrink-wrapped; as a
                    plain flex child it would stretch the full column. */}
                <div className="flex flex-col items-start gap-1.5">
                  <Token
                    tone={
                      phase.id === 'distribute'
                        ? 'verified'
                        : phase.id === 'send'
                          ? 'accent'
                          : 'neutral'
                    }
                  >
                    {phase.payload}
                  </Token>
                  <p className="text-sm text-muted-foreground">
                    {phase.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t border-border px-5 py-3 text-xs text-subtle">
            Nothing in those five steps is a simulation: this is the path the
            Python server, the three nodes and the contract actually take each
            round. The graph on the Federation tab draws the same path and
            replays it from the round feed.
          </p>
        </Panel>

        {/* ── why the chain, and not a file ── */}
        <Panel>
          <PanelHead
            title="Why the chain and not a results file"
            meta="the gap a JSON file leaves open"
          />
          <div className="grid gap-px border-t border-border bg-border md:grid-cols-2">
            {([TRUST_GAP.without, TRUST_GAP.withChain] as const).map(
              ({ label, rows, tone }, i) => (
                <div
                  key={label}
                  style={revealStyle(i)}
                  className={`fedledger-reveal fedledger-tone flex flex-col gap-2.5 bg-card px-5 py-4 ${tone}`}
                >
                  <Eyebrow>{label}</Eyebrow>
                  <ul className="flex flex-col gap-2">
                    {rows.map((row) => (
                      <li
                        key={row}
                        className="flex gap-2 text-sm text-muted-foreground"
                      >
                        <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-border-strong" />
                        <span>{row}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-subtle">
            Scoped honestly: this runs on a local Hardhat chain, so the
            immutability comes from what the contract does not expose rather
            than from a distributed network making a rewrite expensive. A real
            deployment would put the same contract on a chain the FL server
            does not control — the contract itself would not change.
          </p>
        </Panel>

        {/* ── what is actually running ── */}
        <Panel>
          <PanelHead
            title="What is running behind this page"
            meta="every process the launcher starts"
          />
          <div className="flex flex-col">
            {SERVICES.map(({ port, file, what }, i) => (
              <div
                key={file}
                style={revealStyle(i)}
                className="fedledger-reveal grid gap-x-4 gap-y-1 border-t border-border px-5 py-3 md:grid-cols-[4.5rem_15rem_1fr] md:items-baseline"
              >
                <span className="font-mono text-xs text-subtle">{port}</span>
                <span className="font-mono text-xs break-words text-primary">
                  {file}
                </span>
                <span className="text-sm text-muted-foreground">{what}</span>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-subtle">
            The dashboard is served over HTTP rather than opened as a file, and
            it reads the chain through a read-only proxy — the browser can call
            contract getters, never a write method.
          </p>
        </Panel>

        {/* ── the four tabs ── */}
        <Panel>
          <PanelHead
            title="The four tabs"
            meta="what each one is for"
          />
          {/* auto-fit, not breakpoint-counted: two cards on a narrow pane,
              four on a wide one, and no code change when a fifth tab appears. */}
          <div className="grid gap-px border-t border-border bg-border [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            {TABS_GUIDE.map(({ tab, what, tone, dot }, i) => (
              <div
                key={tab}
                style={revealStyle(i)}
                className={`fedledger-reveal fedledger-tone flex flex-col gap-1 bg-card px-4 py-3 ${tone}`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${dot}`}
                  />
                  <Eyebrow>{tab}</Eyebrow>
                </span>
                <p className="text-xs text-muted-foreground">{what}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-5 py-4 text-xs text-subtle">
            Every figure on this page is read from{' '}
            <span className="font-mono">round_results.json</span> as the run
            writes it, from the contract, or from{' '}
            <span className="font-mono">dataset_meta.json</span> — none of it is
            estimated. A value stored nowhere is listed under “what this
            dashboard does not show” rather than filled in.
          </p>
        </Panel>

        {/* ── dataset in force ── */}
        <div
          style={revealStyle(0)}
          className="fedledger-reveal flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            {datasetMeta ? (
              <>
                <Token tone="accent">{datasetMeta.name}</Token>
                <span className="font-mono text-xs text-muted-foreground">
                  {datasetMeta.total_samples} samples · {datasetMeta.num_features} features · {datasetMeta.num_classes} classes
                </span>
                <span className="font-mono text-xs text-subtle">
                  {organisationRows(datasetMeta).join(' / ')} local rows
                </span>
              </>
            ) : null}
            {snapshotActive ? (
              <span className="ml-1 inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                frozen snapshot
                <button
                  type="button"
                  onClick={onClearSnapshot}
                  className="underline underline-offset-2 hover:text-foreground"
                  title="Discard the snapshot and return to the live feed"
                >
                  resume live
                </button>
              </span>
            ) : null}
          </div>
        </div>

        {/* ── the two JSON files, documented rather than implied ── */}
        <Panel style={revealStyle(1)} className="fedledger-reveal">
          <PanelHead
            title="The two JSON files"
            meta="what you can save, load and verify against"
          />
          <div className="grid gap-px border-t border-border bg-border [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {/* ── round snapshot ── */}
            <div className="fedledger-tone fedledger-tone-accent flex flex-col gap-3 bg-card px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                  <Eyebrow>round snapshot</Eyebrow>
                </span>
                <span className="font-mono text-2xs text-subtle">
                  saved and loaded by this page
                </span>
              </div>
              <pre className="overflow-x-auto border border-border bg-muted/40 px-3 py-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
{`[
  [1, 88.9, "0x4f2a…ba09"],   // round, held-out accuracy %, tx hash
  [2, 91.7, "0x0"],           // 0x0 = this round never reached the chain
  [3, 93.3, "0xd2e5…1210"]    // one array per round, nothing else
]`}
              </pre>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <li>
                  <span className="font-mono text-subtle">round</span> — the
                  round number as the training script counted it.
                </li>
                <li>
                  <span className="font-mono text-subtle">accuracy</span> — a
                  percentage, not a fraction, as printed by the run.
                </li>
                <li>
                  <span className="font-mono text-subtle">txHash</span> — the
                  transaction that sealed the round;{' '}
                  <span className="font-mono">0x0</span> marks one that failed
                  to log and therefore holds no chain index.
                </li>
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <Button
                  id="overview-save-snapshot"
                  size="sm"
                  variant="outline"
                  onClick={saveSnapshot}
                  disabled={rounds.length === 0}
                  title="Export current results to a JSON file for later review"
                >
                  <Download className="size-4" />
                  Save snapshot
                </Button>
                <input
                  ref={fileRef}
                  id="overview-load-snapshot-input"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={loadSnapshot}
                />
                <Button
                  id="overview-load-snapshot"
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  title="Load a previously saved snapshot for offline accuracy review"
                >
                  <Upload className="size-4" />
                  Load snapshot
                </Button>
                {SNAPSHOT_TEMPLATES.map((t) => (
                  <span key={t.url} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const text = await fetchTemplate(t.url)
                        if (typeof text !== 'string') {
                          setSnapshotError(text.error)
                          return
                        }
                        acceptSnapshot(text, t.name)
                      }}
                      className="rounded-sm border border-border-strong px-1.5 py-0.5 font-mono text-2xs text-primary transition-colors hover:border-primary/50 hover:bg-primary/10"
                      title={`Load ${t.blurb}`}
                    >
                      load {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTemplate(t.url, t.name)}
                      className="text-subtle transition-colors hover:text-foreground"
                      title={`Download ${t.name}`}
                      aria-label={`Download ${t.name}`}
                    >
                      <Download className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              {snapshotError ? (
                <span className="flex w-full items-start gap-1.5 text-2xs text-destructive">
                  <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
                  {snapshotError}
                </span>
              ) : null}
            </div>

            {/* ── aggregated weights ── */}
            <div className="fedledger-tone fedledger-tone-verified flex flex-col gap-3 bg-card px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-verified" />
                  <Eyebrow>aggregated weights</Eyebrow>
                </span>
                <span className="font-mono text-2xs text-subtle">
                  dropped or pasted into Verify
                </span>
              </div>
              <pre className="overflow-x-auto border border-border bg-muted/40 px-3 py-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
{`{
  "weights": [
    [[-0.385, 0.814, -1.975, -0.923],   // coef matrix: one
     [ 0.457, -1.341, 0.428, -0.819],   // row per class
     [-0.072, 0.526, 1.546, 1.742]],
    [0.245, 1.109, -1.354]              // intercept vector
  ]                                      // same length as the rows
}`}
              </pre>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <li>
                  This is what FedAvg produces and what the chain hashes: a
                  matrix of coefficients plus a matching intercept vector.
                </li>
                <li>
                  One row per class for three or more classes; a single row
                  for a binary dataset — so the shape depends on which dataset
                  the launcher was given.
                </li>
                <li>
                  The demo files are deliberately plausible-but-invented, so
                  comparing them reports a mismatch: that is verification
                  genuinely running, not a broken button.
                </li>
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {WEIGHT_TEMPLATES.map((t) => (
                  <button
                    key={t.url}
                    type="button"
                    onClick={() => downloadTemplate(t.url, t.name)}
                    className="rounded-sm border border-border-strong px-1.5 py-0.5 font-mono text-2xs text-primary transition-colors hover:border-primary/50 hover:bg-primary/10"
                    title={`Download ${t.blurb} — ${t.shape}`}
                  >
                    <Download className="mr-1 inline size-3" aria-hidden />
                    {t.name}
                  </button>
                ))}
                <span className="text-2xs text-subtle">
                  then drop the file on the Verify tab
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {empty ? (
          <Panel style={revealStyle(2)} className="fedledger-reveal">
            <EmptyState title="no rounds recorded yet">
              Start the launcher to partition the dataset and run the first
              round. The files above explain what will appear here once it
              does.
            </EmptyState>
          </Panel>
        ) : (
          <>

            {/* ── figures ── */}
            {/* auto-fit, not breakpoint-counted: the row holds two tiles on
                a narrow pane and five on a wide one, whatever the run
                produced. Each tile reveals on its own stagger step. */}
            <div className="grid gap-px border border-border bg-border [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              {(
                [
                  {
                    key: 'organisations',
                    node: (
                      <StatTile
                        label="organisations"
                        value={ORGANISATIONS.length}
                        hint={
                          organisationRows(datasetMeta).join(' / ') +
                          ' local rows'
                        }
                      />
                    ),
                  },
                  {
                    key: 'rounds',
                    node: <StatTile label="rounds" value={stats.total} />,
                  },
                  {
                    key: 'sealed',
                    node: (
                      <StatTile
                        label="sealed on-chain"
                        value={stats.logged}
                        tone={stats.unlogged > 0 ? 'destructive' : 'verified'}
                        hint={
                          stats.unlogged > 0
                            ? `${stats.unlogged} failed to log`
                            : 'all logged'
                        }
                      />
                    ),
                  },
                  {
                    key: 'best',
                    node: (
                      <StatTile
                        label="best test accuracy"
                        value={
                          stats.best === null
                            ? '—'
                            : `${stats.best.toFixed(1)}%`
                        }
                        tone="accent"
                        hint={
                          stats.meanDelta === null
                            ? 'mean of held-out scores'
                            : `${stats.meanDelta >= 0 ? '+' : ''}${stats.meanDelta.toFixed(1)}% across run`
                        }
                      />
                    ),
                  },
                  {
                    key: 'verified',
                    node: (
                      <StatTile
                        label="verified"
                        value={stats.verified}
                        tone={stats.verified > 0 ? 'verified' : 'default'}
                        hint={`of ${stats.logged} sealed`}
                      />
                    ),
                  },
                ]
              ).map(({ key, node }, i) => (
                <div
                  key={key}
                  style={revealStyle(i)}
                  className="fedledger-reveal min-w-0"
                >
                  {node}
                </div>
              ))}
            </div>

            {/* ── the three claims ── */}
            <Panel>
              <PanelHead
                title="What this run demonstrates"
                meta="each claim is checkable"
              />
              <ul>
                {claimsFor(parameterCount(datasetMeta)).map((c, i) => (
                  <ClaimRow
                    key={c.claim}
                    {...c}
                    index={i}
                    supported={stats.logged > 0 ? true : null}
                  />
                ))}
              </ul>
            </Panel>

            {/* ── honest limits ── */}
            <Panel>
              <PanelHead
                title="What this dashboard does not show"
                meta="stated so nothing here is overclaimed"
              />
              <div className="flex flex-col gap-4 px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">round_results.json</span> carries
                  three fields per round: the round number, the mean held-out
                  accuracy of the aggregated global model, and the transaction
                  hash. Anything beyond that is read from the contract itself,
                  and anything the contract never stored is marked as missing
                  rather than filled in.
                </p>

                <div style={revealStyle(0)} className="fedledger-reveal">
                  <LimitGroup
                    title="Not recorded anywhere"
                    note="The backend and the contract both lack these. No amount of reading fixes them."
                    rows={[
                      {
                        missing: 'per-round weights',
                        why: 'Verification needs the global weights and nothing exposes them, so they must be dropped or pasted into the Verify tab.',
                      },
                      {
                        missing: 'score on a common test set',
                        why: `The ${stats.latest?.toFixed(1) ?? '—'}% figure is one global model scored by all three nodes, each on its own 20% held-out split of its local data, then averaged. The model is shared but the test rows are not, so this is not directly comparable to a single-model generalisation score on one common test set.`,
                      },
                      {
                        missing: 'per-organisation accuracy',
                        why: 'Aggregation stores only the mean, so an individual node’s contribution to a round cannot be checked afterwards.',
                      },
                    ]}
                  />
                </div>

                <div style={revealStyle(1)} className="fedledger-reveal">
                  <LimitGroup
                    title="On chain, read on demand"
                    note="Present in the contract but absent from the results file. Open a round in the Ledger tab and these populate from the node."
                    rows={[
                      {
                        missing: 'block number · gas used',
                        why: 'Read from the transaction that sealed the round, shown in the chain receipt.',
                      },
                      {
                        missing: 'timestamp',
                        why: 'Stamped by the contract at log time, not written by the training script.',
                      },
                      {
                        missing: 'participants',
                        why: 'Stored as a string[], which Solidity omits from the public array getter, so the dashboard does not display it.',
                      },
                    ]}
                  />
                </div>
              </div>
            </Panel>

            <p className="flex items-center gap-2 text-xs text-subtle">
              <Eyebrow>rounds counted</Eyebrow>
              <span>
                a round that failed to log still counts as a round, but it does
                not consume a chain index — which is why the Verify tab asks
                for an index and not a round number.
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
