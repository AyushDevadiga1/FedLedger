/**
 * The five things that actually happen in a round, in order.
 *
 * Replaces the old dashboard's three run modes (manual / auto / speed
 * run) with one replay scrubber. Every phase names the payload that is
 * moving, because an arrow with no label is a decorative arrow — this is
 * the claim the whole project rests on, so the motion has to show it.
 */
export type PhaseId = 'train' | 'send' | 'aggregate' | 'seal' | 'distribute'

export interface Phase {
  id: PhaseId
  /** 1-based position, shown in the scrubber. */
  step: number
  label: string
  /** What crosses the wire during this phase. */
  payload: string
  detail: string
}

export const PHASES: Phase[] = [
  {
    id: 'train',
    step: 1,
    label: 'Train',
    payload: 'nothing leaves',
    detail:
      'OrgA, OrgB and OrgC each fit a logistic regression on their own 40-row shard. The rows stay on the node.',
  },
  {
    id: 'send',
    step: 2,
    label: 'Send',
    payload: '15 floats per node',
    detail:
      'Each node ships only its updated coefficients and intercept. No records, no gradients, nothing recoverable.',
  },
  {
    id: 'aggregate',
    step: 3,
    label: 'Aggregate',
    payload: 'FedAvg result',
    detail:
      'The server takes the sample-weighted mean of the three updates. This is the only place weights are combined.',
  },
  {
    id: 'seal',
    step: 4,
    label: 'Seal',
    payload: 'round + accuracy + hash',
    detail:
      'logRound() writes the round number, the mean accuracy and the SHA-256 of the global weights to FLAuditLog.',
  },
  {
    id: 'distribute',
    step: 5,
    label: 'Distribute',
    payload: 'global model',
    detail:
      'The aggregated model goes back out to all three nodes and becomes the next round’s starting point.',
  },
]

export const PHASE_BY_ID = Object.fromEntries(
  PHASES.map((p) => [p.id, p]),
) as Record<PhaseId, Phase>

/** Which direction payloads travel in each phase. */
export type FlowDirection = 'none' | 'up' | 'down'

export function directionFor(phase: PhaseId | null): FlowDirection {
  switch (phase) {
    case 'send':
    case 'aggregate':
      return 'up'
    case 'distribute':
      return 'down'
    default:
      return 'none'
  }
}

/** Milliseconds each phase holds before advancing, at 1× speed. */
export const PHASE_DURATION_MS: Record<PhaseId, number> = {
  train: 1400,
  send: 1100,
  aggregate: 1300,
  seal: 1000,
  distribute: 1100,
}
