import { useState } from 'react'

import { AccuracyChart } from '@/components/accuracy-chart'
import { RoundInspector } from '@/components/round-inspector'
import {
  EmptyState,
  Hash,
  Panel,
  PanelHead,
  StatTile,
  Token,
} from '@/components/primitives'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { summarise, type LedgerRound } from '@/lib/ledger'
import { cn } from '@/lib/utils'

/**
 * One ledger surface.
 *
 * The v1 dashboard showed the same blocks twice — compact cards in the
 * training sidebar and full cards in the audit tab — which is why it read
 * as busy. Here the table is the only representation, and the detail a
 * block card used to carry is one click away on the row itself.
 */
export function AuditTab({
  rounds,
  verified,
}: {
  rounds: LedgerRound[]
  verified: ReadonlySet<number>
}) {
  const [selected, setSelected] = useState<LedgerRound | null>(null)
  const stats = summarise(rounds, verified)

  if (rounds.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <Panel className="border-r-0">
          <PanelHead title="Ledger" />
          <EmptyState title="the chain is empty">
            Rounds appear here as the FL server seals them. Nothing is
            written until a round completes.
          </EmptyState>
        </Panel>
        <Panel>
          <PanelHead title="Accuracy" />
          <div className="flex flex-1 items-center justify-center text-sm text-subtle">
            no rounds to plot
          </div>
        </Panel>
      </div>
    )
  }

  // Inspecting a round widens the right column: the receipt carries a 66-char
  // hash and a full timestamp, which do not survive a 360px pane.
  if (selected) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(540px,52%)]">
        <Panel className="border-r-0">
          <PanelHead title="Ledger" meta={`${rounds.length} rounds`} />
          <div className="min-h-0 flex-1 overflow-auto">
            <LedgerTable
              rounds={rounds}
              verified={verified}
              selectedRound={selected.round}
              onSelect={setSelected}
            />
          </div>
        </Panel>
        <Panel>
          <RoundInspector round={selected} onClose={() => setSelected(null)} />
        </Panel>
      </div>
    )
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
      <Panel className="border-r-0">
        <PanelHead title="Ledger" meta={`${rounds.length} rounds`} />
        <div className="min-h-0 flex-1 overflow-auto">
          <LedgerTable
            rounds={rounds}
            verified={verified}
            selectedRound={null}
            onSelect={setSelected}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Accuracy" meta="global held-out evaluation" />
        <div className="min-h-0 flex-1 px-3 py-4">
          <AccuracyChart rounds={rounds} />
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-px border-t border-border bg-border">
          <StatTile label="best" value={`${stats.best?.toFixed(1) ?? '—'}%`} tone="accent" />
          <StatTile
            label="improvement"
            value={
              stats.meanDelta === null
                ? '—'
                : `${stats.meanDelta >= 0 ? '+' : ''}${stats.meanDelta.toFixed(1)}%`
            }
            tone={stats.meanDelta === null ? 'default' : 'verified'}
            hint="first to last"
          />
        </div>
      </Panel>
    </div>
  )
}

/**
 * Rows select a round rather than expanding in place. Expanding inline was
 * what pushed the old table past its own height; selecting keeps the table a
 * stable list and gives the detail a proper two-pane surface to live in.
 */
function LedgerTable({
  rounds,
  verified,
  selectedRound,
  onSelect,
}: {
  rounds: LedgerRound[]
  verified: ReadonlySet<number>
  selectedRound: number | null
  onSelect: (round: LedgerRound) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>round</TableHead>
          <TableHead>held-out acc</TableHead>
          <TableHead>tx hash</TableHead>
          <TableHead>chain #</TableHead>
          <TableHead>state</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...rounds].reverse().map((round) => {
          const isSelected = selectedRound === round.round
          const isVerified = verified.has(round.round)

          return (
            <TableRow
              key={round.round}
              className={cn('cursor-pointer', isSelected && 'bg-muted')}
              onClick={() => onSelect(round)}
            >
              <TableCell className="font-mono text-sm text-foreground">
                {round.round}
              </TableCell>
              <TableCell className="font-mono text-sm text-primary">
                {round.accuracy.toFixed(1)}%
              </TableCell>
              <TableCell>
                <Hash value={round.txHash} onChain={round.onChain} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {round.chainIndex === null ? (
                  <span className="text-subtle">—</span>
                ) : (
                  round.chainIndex
                )}
              </TableCell>
              <TableCell>
                {isVerified ? (
                  <Token tone="verified">verified</Token>
                ) : round.onChain ? (
                  <Token tone="accent">on-chain</Token>
                ) : (
                  <Token tone="destructive">not logged</Token>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
