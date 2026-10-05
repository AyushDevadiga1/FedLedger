import { ArrowLeft, TriangleAlert } from 'lucide-react'

import { CryptoReceipt } from '@/components/crypto-receipt'
import { Eyebrow, Token } from '@/components/primitives'
import { useRoundReceipt } from '@/hooks/use-round-receipt'
import type { LedgerRound } from '@/lib/ledger'

/**
 * Split-pane inspector for a single round: the machine-learning state on the
 * left, the immutable blockchain receipt on the right.
 *
 * The pairing is the argument the project makes — the numbers a participant
 * can recompute sit next to the record it cannot rewrite. Keeping them in one
 * view is the whole point, which is why the left pane is a pane and not a
 * caption.
 */
export function RoundInspector({
  round,
  onClose,
}: {
  round: LedgerRound
  onClose: () => void
}) {
  const receipt = useRoundReceipt(round.chainIndex, round.onChain ? round.txHash : null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-medium text-foreground">
            Round {round.round}
          </h2>
          <span className="font-mono text-xs text-subtle">
            {round.onChain
              ? `chain index ${round.chainIndex}`
              : 'never reached the chain'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 font-mono text-xs text-subtle transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" aria-hidden />
          all rounds
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <MlState round={round} />
        <div className="min-h-0 overflow-y-auto border-l border-border">
          <CryptoReceipt
            receipt={receipt}
            txHash={round.txHash}
            roundNumber={round.round}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Left pane. Everything here is recomputable from a participant's own copy,
 * which is the half of the round that is not authoritative.
 */
function MlState({ round }: { round: LedgerRound }) {
  const { accuracy } = round

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
      <div className="flex items-center gap-5">
        <AccuracyRing value={accuracy} />
        <div className="flex flex-col gap-1">
          <Eyebrow>Held-out accuracy</Eyebrow>
          <p className="text-sm text-muted-foreground">
            Mean of the three organisations&apos; accuracy, each scored on its
            own local 20% held-out split.
          </p>
        </div>
      </div>

      {round.chainIndex !== null && round.round !== round.chainIndex + 1 ? (
        <p className="flex items-start gap-2 border-l-2 border-border-strong pl-3 text-xs text-subtle">
          <TriangleAlert className="mt-0.5 size-3 shrink-0 text-subtle" aria-hidden />
          <span>
            Round {round.round} sits at chain index {round.chainIndex}. An
            earlier round failed to log, so the round number and the on-chain
            position have drifted apart — verify by the index, not the round.
          </span>
        </p>
      ) : null}

      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt>
            <Eyebrow>What left each organisation</Eyebrow>
          </dt>
          <dd className="text-xs text-subtle">
            Aggregated coefficients and intercepts only. Raw records never
            cross the organisation boundary, and nothing in this round is
            sufficient to reconstruct them.
          </dd>
        </div>

        <div className="flex flex-col gap-1">
          <dt>
            <Eyebrow>Not recorded anywhere</Eyebrow>
          </dt>
          <dd className="flex flex-col gap-1 text-xs text-subtle">
            <span>
              Per-organisation accuracies — only the mean survives aggregation,
              so an individual node&apos;s contribution cannot be audited after
              the fact.
            </span>
            <span>
              Per-round weights — only their hash is kept, which is what makes
              the log verifiable but not replayable.
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-auto">
        <Token tone={round.onChain ? 'accent' : 'destructive'}>
          {round.onChain ? 'sealed on chain' : 'off chain — unverifiable'}
        </Token>
      </div>
    </div>
  )
}

/**
 * Circular progress ring. Stroke uses the accent at full strength and tracks
 * on the border token — no gradient, no glow, and the value is also written
 * out beside it so the arc is never the only way to read the number.
 */
function AccuracyRing({
  value,
  size = 92,
  stroke = 7,
}: {
  value: number
  size?: number
  stroke?: number
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // accuracy arrives as a percentage already
  const fraction = Math.max(0, Math.min(1, value / 100))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${value.toFixed(1)} percent`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-foreground">
        {value.toFixed(1)}
      </span>
    </div>
  )
}
