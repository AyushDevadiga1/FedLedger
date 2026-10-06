import { useEffect, useState } from 'react'

import {
  confirmations,
  readChainIdentity,
  readChainRound,
  type ChainIdentity,
} from '@/lib/chain'

/**
 * The chain's own view of itself, plus the mapping the Verify tab reasons
 * from.
 *
 * ── Why this replaces counting local rows ───────────────────────────────
 *
 * The dashboard previously derived a chain index by counting non-empty tx
 * hashes in round_results.json. That is a local inference about a global
 * append-only log, and it is wrong in ways that matter:
 *
 *   • A logRound transaction that was mined but REVERTED still has a valid
 *     transaction hash. Counting it as logged advances the index past a round
 *     that does not exist, so every later index verifies the wrong round and
 *     reports it as a mismatch.
 *   • Restarting the node or redeploying the contract resets the array while
 *     the JSON file keeps its rows, so the inferred indices address a chain
 *     that no longer exists.
 *
 * Ethereum does not infer block numbers either. A node asks the chain what is
 * at an index, and treats that answer as the truth about the index. So this
 * hook reads `rounds(index).roundNumber` straight from the contract, and the
 * local file is only ever a hint about which index to look at. When the two
 * disagree, the chain wins and the disagreement is reported rather than
 * silently absorbed.
 */
export type ChainHeadState = 'loading' | 'ready' | 'offline' | 'undeployed'

export interface ChainIndexRecord {
  chainIndex: number
  /** Round number as the CONTRACT records it. */
  roundNumber: number
  accuracy: number
  /** keccak(sha256_hex) — a commitment, not the digest itself. */
  modelHash: string
}

export interface ChainHead {
  identity: ChainIdentity
  state: ChainHeadState
  /** Read from the contract for each index, in parallel. */
  records: Map<number, ChainIndexRecord>
  /** Blocks between the head and a given transaction's block, inclusive. */
  confirmationsFor: (blockNumber: number | null) => number | null
  reload: () => void
}

const POLL_MS = 4_000

/**
 * Ceiling on how many indices are resolved per poll.
 *
 * Each index costs one eth_call, so an unbounded fan-out would turn a long
 * run into hundreds of requests every few seconds against a dev node. Past
 * this many the extra rounds are shown by index alone — still selectable and
 * still verifiable, just without the pre-fetched round number beside them.
 */
const MAX_RESOLVED = 120

export function useChainHead(indices: number[]): ChainHead {
  const [identity, setIdentity] = useState<ChainIdentity>({
    genesis: null,
    chainId: null,
    headBlock: null,
    totalRounds: null,
    contractAddress: null,
  })
  const [state, setState] = useState<ChainHeadState>('loading')
  const [records, setRecords] = useState<Map<number, ChainIndexRecord>>(new Map())
  const [nonce, setNonce] = useState(0)

  // Serialised so the effect does not re-run on a fresh array identity every
  // render — `verifiable.map(...)` produces a new one each time.
  const key = indices.join(',')
  const reload = () => setNonce((n) => n + 1)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const wanted = key === '' ? [] : key.split(',').map(Number).slice(0, MAX_RESOLVED)

    const read = async () => {
      const identity = await readChainIdentity(controller.signal)
      if (cancelled) return
      setIdentity(identity)

      // No contract at the configured address is not "offline" — the node
      // answered, there is simply nothing deployed to read.
      if (!identity.contractAddress) {
        setState('undeployed')
        return
      }
      if (identity.headBlock === null) {
        setState('offline')
        return
      }

      // Anything the chain says exists, but which the caller asked about, is
      // still worth reporting as out of range rather than dropped silently.
      const found = await Promise.all(
        wanted.map(async (index) => {
          const round = await readChainRound(index, controller.signal)
          if (!round) return null
          return [
            index,
            {
              chainIndex: index,
              roundNumber: round.roundNumber,
              accuracy: round.accuracyPct,
              modelHash: round.modelHash,
            },
          ] as const
        }),
      )

      if (cancelled) return
      setRecords(new Map(found.filter((f): f is NonNullable<typeof f> => f !== null)))
      setState('ready')
    }

    void read()
    const id = window.setInterval(read, POLL_MS)
    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(id)
    }
  }, [key, nonce])

  return {
    identity,
    state,
    records,
    confirmationsFor: (blockNumber) =>
      confirmations(blockNumber, identity.headBlock),
    reload,
  }
}