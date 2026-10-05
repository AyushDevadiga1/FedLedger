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

function ClaimRow({
  claim,
  evidence,
  check,
  supported,
}: {
  claim: string
  evidence: string
  check: string
  supported: boolean | null
}) {
  return (
    <li className="grid gap-x-6 gap-y-2 border-t border-border px-5 py-4 md:grid-cols-[1fr_1.25fr]">
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
  onLoadSnapshot,
}: {
  rounds: LedgerRound[]
  verified: ReadonlySet<number>
  onLoadSnapshot?: (rounds: LedgerRound[]) => void
}) {
  const stats = summarise(rounds, verified)
  const datasetMeta = useDatasetMeta()
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshotLoaded, setSnapshotLoaded] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  /**
   * Shared by the file picker and the demo template, so both go through the
   * same parseRounds guard. A template that fails to parse would otherwise
   * look identical to a template that worked.
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
        setSnapshotLoaded(true)
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

        {/* ── what this page is ── */}
        <Panel>
          <PanelHead
            title="What this page shows"
            meta="the run, and where every number comes from"
          />
          <div className="flex flex-col gap-4 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              Three organisations each fit a logistic regression on their own
              local rows, hand the server only their updated coefficients, and
              have every averaged round hashed and sealed into{' '}
              <span className="font-mono text-foreground">FLAuditLog</span> — a
              Solidity contract on a local Hardhat chain. No raw row crosses a
              link, and nothing the chain has recorded can be edited
              afterwards.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Overview', 'this page — claims, limits, snapshots'],
                [
                  'Federation',
                  'one round, phase by phase, with what crosses each link',
                ],
                ['Ledger', 'every round with its receipt read from the chain'],
                [
                  'Verify',
                  'recompute a round’s weight hash and compare it on-chain',
                ],
              ].map(([tab, what]) => (
                <div
                  key={tab}
                  className="border border-border bg-muted/40 px-3 py-2.5"
                >
                  <Eyebrow>{tab}</Eyebrow>
                  <p className="mt-1 text-xs text-muted-foreground">{what}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-subtle">
              Every figure here is read from{' '}
              <span className="font-mono">round_results.json</span> as the run
              writes it, from the contract, or from{' '}
              <span className="font-mono">dataset_meta.json</span> — none of it
              is estimated. A value stored nowhere is listed under “what this
              dashboard does not show” rather than filled in.
            </p>
          </div>
        </Panel>

        {/* ── dataset in force ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {datasetMeta ? (
              <>
                <Token>{datasetMeta.name}</Token>
                <span className="font-mono text-xs text-muted-foreground">
                  {datasetMeta.total_samples} samples · {datasetMeta.num_features} features · {datasetMeta.num_classes} classes
                </span>
                <span className="font-mono text-xs text-subtle">
                  {organisationRows(datasetMeta).join(' / ')} local rows
                </span>
              </>
            ) : null}
            {snapshotLoaded ? (
              <span className="ml-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                frozen snapshot
              </span>
            ) : null}
          </div>
        </div>

        {/* ── the two JSON files, documented rather than implied ── */}
        <Panel>
          <PanelHead
            title="The two JSON files"
            meta="what you can save, load and verify against"
          />
          <div className="grid gap-px border-t border-border bg-border md:grid-cols-2">
            {/* ── round snapshot ── */}
            <div className="flex flex-col gap-3 bg-card px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Eyebrow>round snapshot</Eyebrow>
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
            <div className="flex flex-col gap-3 bg-card px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Eyebrow>aggregated weights</Eyebrow>
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
          <Panel>
            <EmptyState title="no rounds recorded yet">
              Start the launcher to partition the dataset and run the first
              round. The files above explain what will appear here once it
              does.
            </EmptyState>
          </Panel>
        ) : (
          <>

            {/* ── figures ── */}
            <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
              <StatTile
                label="organisations"
                value={ORGANISATIONS.length}
                hint={
                  organisationRows(datasetMeta).join(' / ') + ' local rows'
                }
              />
              <StatTile label="rounds" value={stats.total} />
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
              <StatTile
                label="best test accuracy"
                value={stats.best === null ? '—' : `${stats.best.toFixed(1)}%`}
                tone="accent"
                hint={
                  stats.meanDelta === null
                    ? 'mean of held-out scores'
                    : `${stats.meanDelta >= 0 ? '+' : ''}${stats.meanDelta.toFixed(1)}% across run`
                }
              />
              <StatTile
                label="verified"
                value={stats.verified}
                tone={stats.verified > 0 ? 'verified' : 'default'}
                hint={`of ${stats.logged} sealed`}
              />
            </div>

            {/* ── the three claims ── */}
            <Panel>
              <PanelHead
                title="What this run demonstrates"
                meta="each claim is checkable"
              />
              <ul>
                {claimsFor(parameterCount(datasetMeta)).map((c) => (
                  <ClaimRow
                    key={c.claim}
                    {...c}
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
