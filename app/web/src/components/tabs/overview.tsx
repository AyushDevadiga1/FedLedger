import {
  AlertTriangle,
  Check,
  Download,
  FileCode,
  Minus,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  EmptyState,
  Eyebrow,
  Panel,
  PanelHead,
  StatTile,
  Token,
} from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { parseRounds, summarise, type LedgerRound } from '@/lib/ledger'
import { ORGANISATIONS } from '@/lib/federation'
import { downloadTemplate, fetchTemplate, SNAPSHOT_TEMPLATES } from '@/lib/templates'

interface DatasetMeta {
  name: string
  description: string
  total_samples: number
  num_features: number
  num_classes: number
}

function useDatasetMeta(): DatasetMeta | null {
  const [meta, setMeta] = useState<DatasetMeta | null>(null)
  useEffect(() => {
    fetch('/dataset_meta.json')
      .then((r) => (r.ok ? (r.json() as Promise<DatasetMeta>) : Promise.reject()))
      .then((data) => setMeta(data))
      .catch(() => null)
  }, [])
  return meta
}

/**
 * What the system can actually prove, stated as claims with the evidence
 * attached. This replaces the old hero, stack cards and key-property
 * cards: those were marketing copy dressed as documentation, and none of
 * it was data. For a viva this page is worth more, because every line
 * points at something a reviewer can independently check.
 */
const CLAIMS = [
  {
    claim: 'Raw records never leave a node',
    evidence:
      'Each of the three organisations trains on its own shard and ships only updated coefficients. Nothing in the wire format is a record.',
    check: 'Inspect what a node sends — 15 floats, no rows.',
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

  if (rounds.length === 0) {
    return (
      <div className="min-h-0 flex-1">
        <Panel className="h-full">
          <PanelHead title="Overview" />
          <EmptyState title="no rounds recorded yet">
            Start the launcher to partition the dataset and run the first
            round. Until then there is nothing to summarise.
          </EmptyState>
        </Panel>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">

        {/* ── dataset + snapshot toolbar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {datasetMeta ? (
              <>
                <Token>{datasetMeta.name}</Token>
                <span className="font-mono text-xs text-muted-foreground">
                  {datasetMeta.total_samples} samples · {datasetMeta.num_features} features · {datasetMeta.num_classes} classes
                </span>
              </>
            ) : null}
            {snapshotLoaded ? (
              <span className="ml-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                frozen snapshot
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {/* ── snapshot format, stated rather than implied ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-muted/40 px-3 py-2">
          <FileCode className="size-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="text-2xs text-muted-foreground">Snapshot format</span>
          <code className="font-mono text-2xs text-foreground">
            [round, accuracy, txHash]
          </code>
          <span className="text-2xs text-subtle">
            — one array per round, accuracy as a percentage. A txHash of
            <span className="font-mono"> &quot;0x0&quot;</span> means the round
            did not reach the chain.
          </span>
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
          {snapshotError ? (
            <span className="flex w-full items-start gap-1.5 text-2xs text-destructive">
              <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
              {snapshotError}
            </span>
          ) : null}
        </div>

        {/* ── figures ── */}
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="organisations"
            value={ORGANISATIONS.length}
            hint={ORGANISATIONS.map((o) => o.rows).join(' / ') + ' local rows'}
          />
          <StatTile label="rounds" value={stats.total} />
          <StatTile
            label="sealed on-chain"
            value={stats.logged}
            tone={stats.unlogged > 0 ? 'destructive' : 'verified'}
            hint={
              stats.unlogged > 0 ? `${stats.unlogged} failed to log` : 'all logged'
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
            {CLAIMS.map((c) => (
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
              hash. Anything beyond that is read from the contract itself, and
              anything the contract never stored is marked as missing rather
              than filled in.
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
            not consume a chain index — which is why the Verify tab asks for
            an index and not a round number.
          </span>
        </p>
      </div>
    </div>
  )
}
