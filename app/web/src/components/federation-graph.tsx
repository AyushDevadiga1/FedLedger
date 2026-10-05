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
import { formatAccuracy } from '@/lib/ledger'
import { directionFor, type FlowDirection, type PhaseId } from '@/lib/phases'
import { ORGANISATIONS } from '@/lib/federation'

/* ── node data ─────────────────────────────────────────────────────── */

interface OrgData extends Record<string, unknown> {
  name: string
  rows: number
  accent: 'muted' | 'active' | 'verified'
}

interface ServerData extends Record<string, unknown> {
  accuracy: number | null
  state: 'idle' | 'working'
}

interface ChainData extends Record<string, unknown> {
  blocks: number
  state: 'idle' | 'sealing'
}

const ORG_ICON: Record<string, string> = {
  OrgA: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6',
  OrgB: 'M4 21V8l8-5 8 5v13M9 21v-5h6v5M4 12h16',
  OrgC: 'M3 21h18M6 21V11m6 10V11m6 10V11M3 11h18L12 4 3 11Z',
}

const STATE_STROKE: Record<OrgData['accent'], string> = {
  muted: 'border-border',
  active: 'border-primary',
  verified: 'border-verified',
}

/**
 * An organisation node. The row count and the "0 rows sent" marker are part
 * of the node, not the edge, because the claim being demonstrated is that the
 * data does not move — so the data has to be visibly still.
 *
 * While a node is training it is ringed by a dashed boundary. That ring is
 * the diagram's one piece of argument: it is the only thing standing between
 * the local shard and the wire, so it is drawn at the moment the shard is
 * most at risk and never animated as if it were decorative.
 */
function OrgNode({ data }: NodeProps<Node<OrgData, 'org'>>) {
  const { name, rows, accent } = data
  const sealed = accent === 'active'

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
          'w-[190px] border bg-card px-3 py-2.5 transition-colors duration-300',
          STATE_STROKE[accent],
        )}
      >
{/* Both org handles sit on the bottom edge because the server is
            *below* them. They are split left/right and given explicit ids so
            the outbound and inbound links take separate paths instead of
            drawing over each other. */}
        <Handle
          id="out"
          type="source"
          position={Position.Bottom}
          style={{ left: '32%' }}
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
              'font-mono text-xs',
              accent === 'verified' ? 'text-verified' : 'text-subtle',
            )}
          >
            {accent === 'verified' ? 'model updated' : '0 rows sent'}
          </span>
        </div>
        <Handle
          id="in"
          type="target"
          position={Position.Bottom}
          style={{ left: '68%' }}
        />
      </div>
    </div>
  )
}

function ServerNode({ data }: NodeProps<Node<ServerData, 'server'>>) {
  const { accuracy, state } = data
  return (
    <div
      className={cn(
        'w-[240px] border bg-card px-4 py-3 transition-colors duration-300',
        state === 'working' ? 'border-primary' : 'border-border',
      )}
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
        style={{ left: '32%' }}
      />
      <Handle
        id="dist"
        type="source"
        position={Position.Top}
        style={{ left: '68%' }}
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
      <Handle id="chain" type="source" position={Position.Bottom} />
    </div>
  )
}

function ChainNode({ data }: NodeProps<Node<ChainData, 'chain'>>) {
  const { blocks, state } = data
  return (
    <div
      className={cn(
        'w-[240px] border bg-card px-4 py-3 transition-colors duration-300',
        state === 'sealing' ? 'border-primary' : 'border-border',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-medium text-foreground">
          FLAuditLog
        </span>
        <span className="font-mono text-xs text-subtle">Hardhat :8545</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
        {blocks === 0 ? (
          <span className="font-mono text-xs text-subtle">no blocks yet</span>
        ) : (
          Array.from({ length: blocks }, (_, i) => {
            const isNewest = i === blocks - 1
            const minting = state === 'sealing' && isNewest
            return (
              <span
                key={i}
                className={cn(
                  'rounded-sm border px-1.5 py-0.5 font-mono text-xs',
                  minting
                    ? 'fedledger-slot border-primary bg-primary/10 text-primary'
                    : 'border-border-strong text-muted-foreground',
                )}
              >
                #{i + 1}
              </span>
            )
          })
        )}
      </div>
      <div className="mt-1.5 font-mono text-xs text-subtle">
        append-only · no update or delete
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
}

/**
 * The animated edge.
 *
 * Anime.js drives the payload dot straight on the DOM node rather than
 * through React state, so a replay does not re-render the graph sixty
 * times a second. `svg.createMotionPath` samples the already-computed
 * bezier, which keeps the dot exactly on the visible line instead of
 * approximating it with keyframes.
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
  const { live, tone, label, labelDy = 0 } = data ?? {}

  useEffect(() => {
    const guide = guideRef.current
    const dot = dotRef.current
    if (!guide || !dot || !live) return

    const { translateX, translateY } = svg.createMotionPath(guide)

    const instance = animate(dot, {
      translateX,
      translateY,
      opacity: [
        { to: 0, duration: 0 },
        { to: 1, duration: 180 },
        { to: 1, duration: 620 },
        { to: 0, duration: 220 },
      ],
      duration: 1020,
      delay: (_target, i) => (i ?? 0) * 130,
      loop: true,
      ease: 'inOutQuad',
    })

    return () => {
      instance.pause()
      instance.revert()
    }
  }, [live])

  const active = live === true
  const stroke = tone === 'verified' ? 'var(--color-verified)' : 'var(--color-primary)'

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
          strokeWidth: active ? 1.5 : 1,
          strokeDasharray: active ? undefined : '3 4',
          transition: 'stroke 300ms, stroke-width 300ms',
        }}
      />

      {active ? (
        <circle
          ref={dotRef}
          r="3.5"
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

export interface FederationGraphProps {
  phase: PhaseId | null
  accuracy: number | null
  blocks: number
  className?: string
}

/**
 * Positions are fixed rather than auto-laid-out: this is a fixed cast of
 * three organisations and a server, so a layout pass would only add a
 * dependency and make the diagram jump between rounds.
 */
export function useFederationGraph({
  phase,
  accuracy,
  blocks,
}: FederationGraphProps) {
  const direction = directionFor(phase)

  const orgAccent: OrgData['accent'] =
    phase === 'train' ? 'active' : phase === 'distribute' ? 'verified' : 'muted'

  const nodes = useMemo<Node[]>(
    () => [
      ...ORGS.map((org, i) => ({
        id: org.id,
        type: 'org' as const,
        position: { x: i * 230, y: 0 },
        data: { name: org.name, rows: org.rows, accent: orgAccent } satisfies OrgData,
      })),
      {
        id: 'server',
        type: 'server' as const,
        position: { x: 205, y: 190 },
        data: {
          accuracy,
          state: phase === 'aggregate' ? ('working' as const) : ('idle' as const),
        } satisfies ServerData,
      },
      {
        id: 'chain',
        type: 'chain' as const,
        position: { x: 205, y: 340 },
        data: {
          blocks,
          state: phase === 'seal' ? ('sealing' as const) : ('idle' as const),
        } satisfies ChainData,
      },
    ],
    [orgAccent, accuracy, blocks, phase],
  )

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = []

    for (const [i, org] of ORGS.entries()) {
      // Weights travelling up from the node to the aggregator. Each of the
      // three carries an identical payload, so they share one label and it is
      // nudged along the path per node — three copies of the same sentence at
      // the same x is what made the old diagram look like one broken thread.
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
          label: 'weights only · coef + intercept',
          direction,
          lane: 'up',
          live: direction === 'up',
          tone: 'accent',
          labelDy: -22 + i * 22,
        } satisfies PayloadData,
      })
      // Global model travelling back down to the same organisation.
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
          label: 'global model',
          direction,
          lane: 'down',
          live: direction === 'down',
          tone: 'verified',
          labelDy: -22 + i * 22,
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
      } satisfies PayloadData,
    })

    return list
  }, [direction, phase])

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
        onClick={() => fitView({ padding: 0.16, duration: 300 })}
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
        fitViewOptions={{ padding: 0.16, maxZoom: 1.5 }}
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
