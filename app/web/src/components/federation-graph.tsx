import { animate, svg } from 'animejs'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { memo, useEffect, useMemo, useRef } from 'react'
import { Maximize2, Minus, Plus, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatAccuracy, shortHash, type LedgerRound } from '@/lib/ledger'
import { directionFor, type FlowDirection, type PhaseId } from '@/lib/phases'
import { ORGANISATIONS } from '@/lib/federation'

/* ── layout ───────────────────────────────────────────────────────────
   Wide and shallow rather than square: the panel it renders into is
   landscape, and a diagram whose bounding box matches the panel gets the
   highest fit-view zoom. The old 230px pitch left the whole thing drawn
   small with dead margin on both sides. */

const ORG_PITCH = 300
const ORG_W = 210
const SERVER_W = 300
const CHAIN_W = 470
const ORG_Y = 0
const SERVER_Y = 150
const CHAIN_Y = 305
/** Centre of the middle organisation — the server and chain hang off it. */
const AXIS = ORG_PITCH + ORG_W / 2

/* ── node data ─────────────────────────────────────────────────────── */

/**
 * What an organisation is doing at this moment, as one word. Derived from
 * the phase rather than tracked per node, because there is a fixed cast of
 * three and they always do the same thing at the same time.
 */
type OrgStatus = 'training' | 'uploading' | 'awaiting' | 'updated'

interface OrgData extends Record<string, unknown> {
  name: string
  rows: number
  status: OrgStatus
  /** Draw the dashed privacy boundary: only while local rows exist inside. */
  sealed: boolean
}

interface ServerData extends Record<string, unknown> {
  accuracy: number | null
  state: 'idle' | 'working'
  /** One line naming what the server is doing right now. */
  note: string
}

interface ChainEntry {
  chainIndex: number
  round: number
  accuracy: number
  txHash: string
}

interface ChainData extends Record<string, unknown> {
  /** Newest block first, as a ledger reads. */
  entries: ChainEntry[]
  /** Round being hashed this instant — drawn as an in-flight row, not a block. */
  minting: number | null
}

const ORG_ICON: Record<string, string> = {
  OrgA: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6',
  OrgB: 'M4 21V8l8-5 8 5v13M9 21v-5h6v5M4 12h16',
  OrgC: 'M3 21h18M6 21V11m6 10V11m6 10V11M3 11h18L12 4 3 11Z',
}

const STATUS_LABEL: Record<OrgStatus, string> = {
  training: 'training on rows',
  uploading: 'sending coefs',
  awaiting: 'awaiting model',
  updated: 'model updated',
}

const STATUS_TONE: Record<OrgStatus, string> = {
  training: 'text-primary',
  uploading: 'text-primary',
  awaiting: 'text-subtle',
  updated: 'text-verified',
}

const ORG_BORDER: Record<OrgStatus, string> = {
  training: 'border-primary',
  uploading: 'border-primary',
  awaiting: 'border-border',
  updated: 'border-verified',
}

/**
 * An organisation node.
 *
 * The row count and the "0 rows sent" claim are part of the node, not the
 * edge, because the claim is that data does not move — a still label is the
 * evidence. While local rows exist inside, the node carries a dashed
 * boundary: that ring is the diagram's one argument, drawn at the moment the
 * shard is most at risk.
 */
function OrgNode({ data }: NodeProps<Node<OrgData, 'org'>>) {
  const { name, rows, status, sealed } = data

  return (
    <div className="relative">
      {sealed ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-2.5 border border-dashed border-primary/45"
          />
          <span
            className="absolute -top-2 right-2 flex items-center gap-1 border border-primary/40 bg-card px-1 py-0.5 font-mono text-2xs text-primary"
            title="Raw rows stay inside this boundary. Only coefficients cross it."
          >
            <ShieldCheck className="size-2.5" aria-hidden />
            sealed
          </span>
        </>
      ) : null}

      <div
        className={cn(
          'border bg-card px-3 py-2.5 transition-colors duration-300',
          ORG_BORDER[status],
        )}
        style={{ width: ORG_W }}
      >
        {/* Both handles sit on the bottom edge because the server is below.
            They are split left/right and given explicit ids so the outbound
            and inbound links take separate paths instead of overlapping. */}
        <Handle
          id="out"
          type="source"
          position={Position.Bottom}
          style={{ left: '30%' }}
        />
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-sm font-medium text-foreground">
            {name}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 size-4 shrink-0 text-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d={ORG_ICON[name] ?? ORG_ICON.OrgA!} />
          </svg>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {rows} rows · local
          </span>
          <span
            className={cn(
              'flex items-center gap-1.5 font-mono text-xs transition-colors duration-300',
              STATUS_TONE[status],
            )}
          >
            {/* The two phases where something is genuinely happening on the
                node get a live marker; the idle ones do not, so a pulse means
                work rather than decoration. */}
            {status === 'training' || status === 'uploading' ? (
              <span
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-current"
                aria-hidden
              />
            ) : null}
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
          <span className="font-mono text-2xs text-subtle">records held</span>
          <span className="font-mono text-2xs text-muted-foreground">
            0 rows sent
          </span>
        </div>
        <Handle
          id="in"
          type="target"
          position={Position.Bottom}
          style={{ left: '70%' }}
        />
      </div>
    </div>
  )
}

function ServerNode({ data }: NodeProps<Node<ServerData, 'server'>>) {
  const { accuracy, state, note } = data
  return (
    <div
      className={cn(
        'border bg-card px-4 py-3 transition-colors duration-300',
        state === 'working' ? 'border-primary' : 'border-border',
      )}
      style={{ width: SERVER_W }}
    >
      {/* 'in' and 'dist' both live on the top edge because the organisations
          sit above the server; 'chain' leaves downward to the ledger. Explicit
          ids are required — two handles sharing a null id cannot be told apart
          by the edge resolver, which is what made the inbound link attach to
          the wrong one. */}
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        style={{ left: '30%' }}
      />
      <Handle
        id="dist"
        type="source"
        position={Position.Top}
        style={{ left: '70%' }}
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-medium text-foreground">
          FL Server
        </span>
        <span className="font-mono text-xs text-subtle">FedAvg</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-3xl leading-none font-semibold',
            state === 'working' ? 'text-primary' : 'text-foreground',
          )}
        >
          {formatAccuracy(accuracy)}
        </span>
        <span className="text-xs text-muted-foreground">
          global test acc
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="font-mono text-2xs text-subtle">weighted mean</span>
        <span
          className={cn(
            'flex items-center gap-1.5 font-mono text-2xs transition-colors duration-300',
            state === 'working' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {state === 'working' ? (
            <span
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-current"
              aria-hidden
            />
          ) : null}
          {note}
        </span>
      </div>
      <Handle id="chain" type="source" position={Position.Bottom} />
    </div>
  )
}

/**
 * The ledger.
 *
 * Sized to be read, not to be a decoration under the server: every sealed
 * round is a row with its block number, accuracy and transaction hash, newest
 * on top, and a row mounting for the first time drops in with the
 * fedledger-slot overshoot — so a live run shows the chain being written one
 * round at a time instead of a chip count jumping.
 */
function ChainNode({ data }: NodeProps<Node<ChainData, 'chain'>>) {
  const { entries, minting } = data

  return (
    <div
      className="border bg-card px-4 py-3 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)]"
      style={{ width: CHAIN_W }}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-medium text-foreground">
            FLAuditLog
          </span>
          <span className="font-mono text-2xs text-subtle">Hardhat :8545</span>
        </div>
        <span className="font-mono text-2xs text-muted-foreground">
          {entries.length} block{entries.length === 1 ? '' : 's'} · append-only
        </span>
      </div>

      <div className="max-h-[168px] min-h-[74px] overflow-y-auto py-1">
        <ul>
          {minting !== null ? (
            <li
              key="minting"
              className="flex items-baseline gap-3 border-b border-dashed border-primary/40 px-1 py-1.5"
            >
              <span className="font-mono text-xs text-primary">
                #{entries.length + 1}
              </span>
              <span className="font-mono text-xs text-primary">
                round {minting}
              </span>
              <span className="truncate font-mono text-2xs text-subtle">
                sha256(global weights)…
              </span>
              <span className="ml-auto animate-pulse font-mono text-2xs text-primary">
                hashing
              </span>
            </li>
          ) : null}

          {entries.length === 0 && minting === null ? (
            <li className="px-1 py-4 text-center font-mono text-xs text-subtle">
              no blocks yet — nothing has been sealed
            </li>
          ) : (
            entries.map((entry) => (
              <li
                key={entry.chainIndex}
                className="fedledger-slot flex items-baseline gap-3 border-b border-border/60 px-1 py-1.5 last:border-b-0"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  #{entry.chainIndex + 1}
                </span>
                <span className="font-mono text-xs text-foreground">
                  round {entry.round}
                </span>
                <span className="font-mono text-xs text-primary">
                  {formatAccuracy(entry.accuracy)}
                </span>
                <span
                  className="truncate font-mono text-2xs text-subtle"
                  title={entry.txHash}
                >
                  {shortHash(entry.txHash, 10, 8)}
                </span>
                <span className="ml-auto shrink-0 font-mono text-2xs text-subtle">
                  sealed
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mt-1.5 border-t border-border pt-1.5 font-mono text-2xs text-subtle">
        no update, no delete, no reordering
      </div>
      <Handle id="in" type="target" position={Position.Top} />
    </div>
  )
}

/* ── payload edge ──────────────────────────────────────────────────── */

interface PayloadData extends Record<string, unknown> {
  label: string
  direction: FlowDirection
  /**
   * Which way this edge carries its payload, in screen terms: 'up' when the
   * source sits below the target, 'down' when it sits above. Only the edge
   * whose lane equals the current phase direction lights up, so this has to
   * describe the real geometry — an edge whose lane is mislabelled never
   * animates and the flow silently looks dead.
   */
  lane: FlowDirection
  /**
   * Whether this edge carries a payload right now. Computed by the graph
   * builder rather than derived in the edge component, so the phase -> lane
   * decision lives in exactly one place and cannot drift from the geometry.
   */
  live: boolean
  tone: 'accent' | 'verified'
  /** Vertical nudge, in px, applied to the edge label. */
  labelDy?: number
  /**
   * How long to hold before this dot leaves, and how long the trip takes.
   *
   * Up-links are given a per-organisation delay so the three uploads go one
   * after another down their own threads — which is what actually happens:
   * each node ships its own update, they are not a single broadcast. The
   * down-link has no delay because the server really does return the global
   * model to everyone at once.
   *
   * Both numbers are *base* timings at 1x speed. The edge divides them by
   * `timeScale` before starting, so the replay speed control rescales the
   * whole diagram instead of only the phase clock — and when `motionOn` is
   * false no animation starts at all: the link still lights, the dot simply
   * never leaves.
   */
  delayMs?: number
  travelMs?: number
  timeScale?: number
  motionOn?: boolean
}

/**
 * The animated edge.
 *
 * Anime.js drives the payload dot straight on the DOM node rather than
 * through React state, so a replay does not re-render the graph sixty times a
 * second. `svg.createMotionPath` samples the already-computed bezier, which
 * keeps the dot exactly on the visible line instead of approximating it with
 * keyframes. One pass per phase change: a looping dot on a phase that is
 * still running looks like a screensaver, whereas a single trip reads as one
 * thing being sent.
 */
function PayloadEdgeBase({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<Edge<PayloadData, 'payload'>>) {
  // Arrowhead colour is decided per edge in useFederationGraph, where the
  // phase is known; React Flow renders whatever MarkerType it is handed.
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.3,
  })

  const guideRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const {
    live,
    tone,
    label,
    labelDy = 0,
    delayMs = 0,
    travelMs = 700,
    timeScale = 1,
    motionOn = true,
  } = data ?? {}

  useEffect(() => {
    const guide = guideRef.current
    const dot = dotRef.current
    if (!guide || !dot || !live || !motionOn) return

    const scale = timeScale > 0 ? timeScale : 1
    const duration = Math.max(Math.round(travelMs / scale), 120)
    const delay = Math.max(Math.round(delayMs / scale), 0)
    const ramp = Math.min(160, Math.round(duration * 0.25))

    const { translateX, translateY } = svg.createMotionPath(guide)

    const instance = animate(dot, {
      translateX,
      translateY,
      opacity: [
        { to: 0, duration: 0 },
        { to: 1, duration: ramp },
        { to: 1, duration: Math.max(duration - ramp * 2, 60) },
        { to: 0, duration: ramp },
      ],
      duration,
      delay,
      ease: 'inOutQuad',
    })

    return () => {
      instance.pause()
      instance.revert()
    }
  }, [live, delayMs, travelMs, timeScale, motionOn])

  const active = live === true
  const stroke =
    tone === 'verified' ? 'var(--color-verified)' : 'var(--color-primary)'

  return (
    <>
      {/* measured guide, never painted — Anime samples this */}
      <path ref={guideRef} d={path} fill="none" stroke="none" />

      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: active ? stroke : 'var(--color-border-strong)',
          strokeWidth: active ? 2 : 1,
          strokeDasharray: active ? undefined : '3 4',
          filter: active ? `drop-shadow(0 0 4px ${stroke})` : 'none',
          transition: 'stroke 300ms, stroke-width 300ms',
        }}
      />

      {active ? (
        <circle
          ref={dotRef}
          r="4"
          cx="0"
          cy="0"
          fill={stroke}
          opacity="0"
          style={{ filter: 'none' }}
        />
      ) : null}

      <EdgeLabelRenderer>
        <div
          className={cn(
            'pointer-events-none absolute rounded-sm border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap transition-colors duration-300',
            active
              ? tone === 'verified'
                ? 'border-verified/40 bg-verified/10 text-verified'
                : 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-subtle',
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelDy}px)`,
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const PayloadEdge = memo(PayloadEdgeBase)

const NODE_TYPES = {
  org: OrgNode,
  server: ServerNode,
  chain: ChainNode,
}

const EDGE_TYPES = {
  payload: PayloadEdge,
}

/* ── graph ─────────────────────────────────────────────────────────── */

const ORGS = ORGANISATIONS

/** Milliseconds between one organisation's upload and the next's. */
const UPLOAD_STAGGER_MS = 520
/** One upload's travel time. Three of them plus the last trip must fit
 *  inside PHASE_DURATION_MS.send, which is why send is the long phase. */
const UPLOAD_TRAVEL_MS = 640
const RETURN_TRAVEL_MS = 720
const SEAL_TRAVEL_MS = 520

export interface FederationGraphProps {
  phase: PhaseId | null
  accuracy: number | null
  rounds: LedgerRound[]
  /**
   * Per-organisation local row counts, from dataset_meta.json. Falls back to
   * the iris constants before metadata lands, but it must be passed once
   * known — the diagram's whole claim is that these rows never move, so a
   * row count that disagrees with the running dataset discredits it.
   */
  rows?: number[]
  /**
   * Replay speed multiplier. Rescales dot travel and stagger, not just the
   * phase clock, so 2x reads as twice as fast everywhere at once.
   */
  timeScale?: number
  /**
   * Master motion switch. False holds every dot at its origin while leaving
   * the links lit — the state is still readable, nothing moves.
   */
  motionOn?: boolean
  className?: string
}

function serverNote(phase: PhaseId | null): string {
  switch (phase) {
    case 'train':
      return 'waiting for 3 updates'
    case 'send':
      return 'receiving updates'
    case 'aggregate':
      return 'averaging 3 updates'
    case 'seal':
      return 'writing to ledger'
    case 'distribute':
      return 'shipping to 3 nodes'
    default:
      return 'idle · 3 nodes'
  }
}

/**
 * Positions are fixed rather than auto-laid-out: this is a fixed cast of
 * three organisations and a server, so a layout pass would only add a
 * dependency and make the diagram jump between rounds.
 */
export function useFederationGraph({
  phase,
  accuracy,
  rounds,
  rows,
  timeScale = 1,
  motionOn = true,
}: FederationGraphProps) {
  const direction = directionFor(phase)

  const orgStatus: OrgStatus =
    phase === 'train' || phase === 'send'
      ? phase === 'train'
        ? 'training'
        : 'uploading'
      : phase === 'distribute'
        ? 'updated'
        : 'awaiting'

  const sealed = useMemo(
    () =>
      rounds.filter(
        (r): r is LedgerRound & { chainIndex: number } =>
          r.onChain && r.chainIndex !== null,
      ),
    [rounds],
  )

  /** The round the seal phase is currently writing, or null outside it. */
  const minting = useMemo(() => {
    if (phase !== 'seal') return null
    const last = rounds[rounds.length - 1]
    if (!last) return 1
    return last.onChain ? last.round + 1 : last.round
  }, [phase, rounds])

  const nodes = useMemo<Node[]>(
    () => [
      ...ORGS.map((org, i) => ({
        id: org.id,
        type: 'org' as const,
        position: { x: i * ORG_PITCH, y: ORG_Y },
        data: {
          name: org.name,
          rows: rows?.[i] ?? org.rows,
          status: orgStatus,
          sealed: orgStatus === 'training' || orgStatus === 'uploading',
        } satisfies OrgData,
      })),
      {
        id: 'server',
        type: 'server' as const,
        position: { x: AXIS - SERVER_W / 2, y: SERVER_Y },
        data: {
          accuracy,
          state:
            phase === 'aggregate' || phase === 'seal'
              ? ('working' as const)
              : ('idle' as const),
          note: serverNote(phase),
        } satisfies ServerData,
      },
      {
        id: 'chain',
        type: 'chain' as const,
        position: { x: AXIS - CHAIN_W / 2, y: CHAIN_Y },
        data: {
          entries: [...sealed]
            .reverse()
            .map((r) => ({
              chainIndex: r.chainIndex,
              round: r.round,
              accuracy: r.accuracy,
              txHash: r.txHash,
            })),
          minting,
        } satisfies ChainData,
      },
    ],
    [orgStatus, accuracy, sealed, minting, phase, rows],
  )

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = []

    for (const [i, org] of ORGS.entries()) {
      // Weights travelling up from the node to the aggregator, one
      // organisation at a time: staggered so the three uploads read as three
      // separate shipments down three separate threads rather than one glow.
      list.push({
        id: `${org.id}-up`,
        source: org.id,
        sourceHandle: 'out',
        target: 'server',
        targetHandle: 'in',
        type: 'payload',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: direction === 'up' ? 'var(--color-primary)' : 'var(--color-border-strong)',
        },
        data: {
          label: i === 0 ? 'coefs + intercept, no rows' : 'coefs + intercept',
          direction,
          lane: 'up',
          live: direction === 'up',
          tone: 'accent',
          labelDy: -26 + i * 26,
          delayMs: i * UPLOAD_STAGGER_MS,
          travelMs: UPLOAD_TRAVEL_MS,
          timeScale,
          motionOn,
        } satisfies PayloadData,
      })
      // Global model travelling back to every organisation simultaneously —
      // same threads, no stagger, because the broadcast really is one fan-out.
      list.push({
        id: `${org.id}-down`,
        source: 'server',
        sourceHandle: 'dist',
        target: org.id,
        targetHandle: 'in',
        type: 'payload',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color:
            direction === 'down' ? 'var(--color-verified)' : 'var(--color-border-strong)',
        },
        data: {
          label: i === 0 ? 'global model → all 3' : 'global model',
          direction,
          lane: 'down',
          live: direction === 'down',
          tone: 'verified',
          labelDy: -26 + i * 26,
          delayMs: 0,
          travelMs: RETURN_TRAVEL_MS,
          timeScale,
          motionOn,
        } satisfies PayloadData,
      })
    }

    // Server to ledger. The chain sits BELOW the server, so this payload
    // travels down — the old edge declared lane 'up' and only ever lit up
    // because the phase check happened to pass. An arrowhead now makes a
    // mislabelled lane impossible to miss.
    list.push({
      id: 'server-chain',
      source: 'server',
      sourceHandle: 'chain',
      target: 'chain',
      targetHandle: 'in',
      type: 'payload',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: phase === 'seal' ? 'var(--color-primary)' : 'var(--color-border-strong)',
      },
      data: {
        label: 'logRound() · hash',
        direction: phase === 'seal' ? 'down' : 'none',
        lane: 'down',
        live: phase === 'seal',
        tone: 'accent',
        delayMs: 60,
        travelMs: SEAL_TRAVEL_MS,
        timeScale,
        motionOn,
      } satisfies PayloadData,
    })

    return list
  }, [direction, phase, timeScale, motionOn])

  return { nodes, edges, nodeTypes: NODE_TYPES }
}

/**
 * Zoom toolbar — floated over the top-right corner of the canvas.
 * Uses useReactFlow() which requires a ReactFlowProvider ancestor.
 */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const btn =
    'flex h-7 w-7 items-center justify-center border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground transition-colors'

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
      <button
        id="fed-zoom-in"
        className={btn}
        title="Zoom in"
        onClick={() => zoomIn({ duration: 250 })}
        aria-label="Zoom in"
      >
        <Plus className="size-3.5" />
      </button>
      <button
        id="fed-zoom-out"
        className={btn}
        title="Zoom out"
        onClick={() => zoomOut({ duration: 250 })}
        aria-label="Zoom out"
      >
        <Minus className="size-3.5" />
      </button>
      <button
        id="fed-fit-view"
        className={btn}
        title="Fit to canvas"
        onClick={() => fitView({ padding: 0.1, duration: 300 })}
        aria-label="Fit view"
      >
        <Maximize2 className="size-3" />
      </button>
    </div>
  )
}

/**
 * The canvas.
 *
 * Interaction is on by default: pan with mouse-drag, zoom with scroll wheel,
 * and the three toolbar buttons in the top-right corner give explicit control.
 * Nodes are not draggable or connectable — the topology is fixed.
 *
 * fitView starts the diagram as large as the panel allows rather than at 1:1
 * and centred: on first load the old settings drew a third of the panel and
 * left the rest as margin.
 */
export function FederationCanvas(props: FederationGraphProps) {
  const { nodes, edges } = useFederationGraph(props)

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.4, minZoom: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        className={cn('bg-card', props.className)}
      >
        <ZoomControls />
      </ReactFlow>
    </ReactFlowProvider>
  )
}
