import {
  CirclePlay,
  Pause,
  RotateCcw,
  SkipForward,
} from 'lucide-react'

import { FederationCanvas } from '@/components/federation-graph'
import {
  EmptyState,
  Hash,
  Panel,
  PanelHead,
  Token,
} from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReplay } from '@/hooks/use-replay'
import { useMotionPreference } from '@/hooks/use-motion-preference'
import { useDatasetMeta } from '@/hooks/use-dataset-meta'
import { formatAccuracy, type LedgerRound } from '@/lib/ledger'
import { organisationRows, parameterCount } from '@/lib/federation'
import { PHASES, type Phase } from '@/lib/phases'
import type { MotionPreference } from '@/lib/motion'
import { cn } from '@/lib/utils'

const SPEEDS = [0.5, 1, 1.5, 2, 3] as const

const MOTION_OPTIONS: ReadonlyArray<{
  id: MotionPreference
  label: string
  hint: string
}> = [
  { id: 'auto', label: 'Auto', hint: 'Follow the OS reduced-motion setting' },
  { id: 'full', label: 'Full', hint: 'Always animate payloads' },
  { id: 'reduced', label: 'Still', hint: 'Light the links, never move the dots' },
]

/**
 * The payload line shown for a phase.
 *
 * Static for four of the five phases, but Send states a number the dataset
 * decides — 15 floats on iris, 31 on breast_cancer, 650 on digits — so it is
 * computed here from metadata rather than printed from a constant.
 */
function payloadFor(phase: Phase, floatsPerNode: number): string {
  return phase.id === 'send'
    ? `${floatsPerNode} floats per node`
    : phase.payload
}

export function TrainingTab({
  rounds,
  verified,
  usingMock,
}: {
  rounds: LedgerRound[]
  verified: ReadonlySet<number>
  usingMock: boolean
}) {
  const replay = useReplay()
  const motion = useMotionPreference()
  const latest = rounds[rounds.length - 1] ?? null
  const blocks = rounds.filter((r) => r.onChain).length
  const meta = useDatasetMeta()
  const localRows = organisationRows(meta)
  const floatsPerNode = parameterCount(meta)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] grid-rows-[1fr_auto]">
      {/* ── diagram ── */}
      <Panel className="col-start-1 row-start-1 border-r-0 border-b-0">
        <PanelHead
          title="Federation"
          meta={
            replay.phase
              ? `step ${replay.cursor + 1} of ${PHASES.length}`
              : `${blocks} block${blocks === 1 ? '' : 's'} sealed`
          }
          actions={
            replay.phase ? (
              <Token
                tone={
                  replay.phase === 'distribute' ? 'verified' : 'accent'
                }
              >
                {payloadFor(PHASES[replay.cursor]!, floatsPerNode)}
              </Token>
            ) : null
          }
        />

        <div className="relative min-h-0 flex-1">
          <FederationCanvas
            phase={replay.phase}
            accuracy={latest?.accuracy ?? null}
            rounds={rounds}
            rows={localRows}
            timeScale={replay.speed}
            motionOn={motion.animate}
            className="size-full"
          />

          {rounds.length === 0 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/92">
              <EmptyState title="no rounds to replay">
                The graph draws the federation either way, but there is no
                accuracy to report and no blocks to seal until the FL server
                completes a round.
              </EmptyState>
            </div>
          ) : null}
        </div>

        {/* ── replay scrubber ── */}
        <div className="shrink-0 border-t border-border px-5 py-4">
          <Tabs
            value={replay.cursor < 0 ? '' : String(replay.cursor)}
            onValueChange={(v) => {
              const i = Number(v)
              if (Number.isFinite(i)) replay.goTo(i)
            }}
          >
            <TabsList variant="line" className="w-full justify-start gap-0">
              {PHASES.map((phase, i) => (
                <TabsTrigger
                  key={phase.id}
                  value={String(i)}
                  className={cn(
                    'flex-1 flex-col items-start gap-0.5 rounded-none border-b-2 border-transparent px-3 py-2 text-left data-active:border-primary data-active:bg-transparent',
                    replay.cursor === i
                      ? 'text-foreground'
                      : 'text-subtle hover:text-muted-foreground',
                  )}
                >
                  <span className="font-mono text-xs">
                    {phase.step}. {phase.label}
                  </span>
                  <span className="text-xs font-normal">
                    {payloadFor(phase, floatsPerNode)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <p className="mt-3 min-h-10 text-sm text-muted-foreground">
            {replay.phase
              ? PHASES[replay.cursor]?.detail
              : 'Press replay to walk a round end to end. Every edge is labelled with what actually crosses it.'}
          </p>
        </div>
      </Panel>

      {/* ── sidebar feed ── */}
      <Panel className="col-start-2 row-start-1 border-b-0">
        <PanelHead
          title="Round feed"
          meta={`${rounds.length}`}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rounds.length === 0 ? (
            <EmptyState title="nothing logged yet">
              Polling <span className="font-mono">round_results.json</span>
              {usingMock ? '' : ' every 2s'}.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {[...rounds].reverse().map((round) => (
                <li
                  key={round.round}
                  className="flex flex-col gap-1.5 px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm text-foreground">
                      Round {round.round}
                    </span>
                    <span className="font-mono text-sm text-primary">
                      {formatAccuracy(round.accuracy)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Hash
                      value={round.txHash}
                      onChain={round.onChain}
                    />
                    {verified.has(round.round) ? (
                      <Token tone="verified">verified</Token>
                    ) : round.onChain ? (
                      <Token>chain #{round.chainIndex}</Token>
                    ) : (
                      <Token tone="destructive">not logged</Token>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* ── transport ── */}
      <Panel className="col-span-2 row-start-2 border-t">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={replay.isPlaying ? replay.pause : replay.play}
              disabled={rounds.length === 0}
            >
              {replay.isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <CirclePlay className="size-4" />
              )}
              {replay.isPlaying ? 'Pause' : 'Replay round'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={replay.next}
              disabled={rounds.length === 0 || replay.cursor >= PHASES.length - 1}
            >
              <SkipForward className="size-4" />
              Step
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={replay.reset}
              disabled={replay.cursor < 0}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="replay-speed"
              className="font-mono text-xs text-muted-foreground"
            >
              speed
            </label>
            <Slider
              id="replay-speed"
              className="w-40"
              min={0}
              max={SPEEDS.length - 1}
              step={1}
              value={SPEEDS.indexOf(
                replay.speed as (typeof SPEEDS)[number],
              )}
              onValueChange={(v) => {
                const s = SPEEDS[Number(v)]
                if (s !== undefined) replay.setSpeed(s)
              }}
            />
            <span className="w-10 font-mono text-xs text-primary">
              {replay.speed}×
            </span>
          </div>

          {replay.reducedMotion ? (
            <p className="text-xs text-subtle">
              Reduced-motion is on, so stepping is manual.
            </p>
          ) : null}

          <div className="flex items-center gap-1" role="group" aria-label="Motion">
            <span className="mr-1 font-mono text-xs text-muted-foreground">
              motion
            </span>
            {MOTION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => motion.setPreference(option.id)}
                aria-pressed={motion.preference === option.id}
                title={option.hint}
                className={cn(
                  'rounded-sm border px-1.5 py-0.5 font-mono text-xs transition-colors',
                  motion.preference === option.id
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-subtle hover:border-primary/40 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  )
}
