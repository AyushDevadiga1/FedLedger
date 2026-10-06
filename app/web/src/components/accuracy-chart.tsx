import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatAccuracy, type LedgerRound } from '@/lib/ledger'

interface Point {
  round: number
  accuracy: number
  onChain: boolean
}

function buildPoints(rounds: LedgerRound[]): Point[] {
  return rounds.map((r) => ({
    round: r.round,
    accuracy: r.accuracy,
    onChain: r.onChain,
  }))
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Point }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div className="border border-border-strong bg-popover px-3 py-2">
      <div className="font-mono text-xs text-subtle">
        round {point.round}
      </div>
      <div className="mt-0.5 font-mono text-sm font-medium text-primary">
        {formatAccuracy(point.accuracy)}
      </div>
      <div className="mt-1 font-mono text-xs text-subtle">
        {point.onChain ? 'logged on-chain' : 'not logged'}
      </div>
    </div>
  )
}

/**
 * Accuracy across rounds.
 *
 * Thin line, no area fill, hairline grid — a gradient wash under a
 * two-point line is decoration pretending to be data. The mean is drawn
 * as a reference line because the interesting question is not "did it go
 * up" but "is the last round actually better than typical".
 */
export function AccuracyChart({ rounds }: { rounds: LedgerRound[] }) {
  const points = buildPoints(rounds)

  if (points.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-sm text-subtle">
        no rounds to plot
      </div>
    )
  }

  const values = points.map((p) => p.accuracy)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max(4, (max - min) * 0.35)
  // Accuracy is a percentage: padding may lift the tick range but the axis
  // must never show headroom above 100%.
  const yMin = Math.max(0, min - pad)
  const yMax = Math.min(100, max + pad)
  const mean = values.reduce((a, b) => a + b, 0) / values.length

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={points}
        margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="var(--color-border)"
          strokeDasharray="0"
        />
        <XAxis
          dataKey="round"
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          tick={{
            fill: 'var(--color-subtle)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
          tickFormatter={(v: number) => `r${v}`}
        />
        <YAxis
          domain={[yMin, yMax]}
          width={44}
          tickLine={false}
          axisLine={false}
          tick={{
            fill: 'var(--color-subtle)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <ReferenceLine
          y={mean}
          stroke="var(--color-border-strong)"
          strokeDasharray="4 4"
          label={{
            value: `mean ${mean.toFixed(1)}%`,
            position: 'insideTopRight',
            fill: 'var(--color-subtle)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={{
            r: 3.5,
            fill: 'var(--color-card)',
            stroke: 'var(--color-primary)',
            strokeWidth: 2,
          }}
          activeDot={{ r: 5, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
