import { useEffect, useState } from 'react'

import {
  readChainRound,
  readChainTx,
  readTotalRounds,
  type ChainRound,
  type ChainTx,
} from '@/lib/chain'

/**
 * On-chain detail for one round, fetched lazily and cached for the session.
 *
 * The three terminal states are kept distinct on purpose: 'offline' means
 * Hardhat is not answering, 'missing' means the node answered but has no such
 * round, and 'ready' means we have the record. They need different copy — a
 * node that is merely not running must never read as a failed verification.
 */
export type ChainState = 'loading' | 'ready' | 'offline' | 'missing'

export interface RoundReceipt {
  chain: ChainRound | null
  tx: ChainTx | null
  state: ChainState
}

const IDLE: RoundReceipt = { chain: null, tx: null, state: 'missing' }

interface CacheEntry extends RoundReceipt {
  fetchedAt: number
}

const CACHE_TTL = 30_000
const cache = new Map<number, CacheEntry>()

/** Drop cached receipts so the next read goes back to the node. */
export function invalidateReceipts(): void {
  cache.clear()
}

export function useRoundReceipt(
  chainIndex: number | null,
  txHash: string | null,
): RoundReceipt {
  const [receipt, setReceipt] = useState<RoundReceipt>(() => {
    if (chainIndex === null) return IDLE
    const hit = cache.get(chainIndex)
    return hit ? { chain: hit.chain, tx: hit.tx, state: hit.state } : { ...IDLE, state: 'loading' }
  })

  useEffect(() => {
    if (chainIndex === null) {
      setReceipt(IDLE)
      return
    }

    const hit = cache.get(chainIndex)
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) {
      setReceipt({ chain: hit.chain, tx: hit.tx, state: hit.state })
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setReceipt((prev) => ({ ...prev, state: 'loading' }))

    // Ask the node how many rounds it holds at the same time as the round
    // itself. Its answer is what separates "offline" from "missing": if
    // totalRounds came back we know the node is up, so a null round means the
    // index is genuinely out of bounds.
    Promise.all([
      readChainRound(chainIndex, controller.signal),
      readTotalRounds(controller.signal),
    ])
      .then(async ([chain, total]) => {
        if (cancelled) return

        const state: ChainState = chain
          ? 'ready'
          : total !== null
            ? 'missing'
            : 'offline'

        cache.set(chainIndex, { chain, tx: null, state, fetchedAt: Date.now() })
        setReceipt({ chain, tx: null, state })

        if (!chain || !txHash || txHash === '0x0') return

        const tx = await readChainTx(txHash, controller.signal)
        if (cancelled || !tx) return

        cache.set(chainIndex, { chain, tx, state, fetchedAt: Date.now() })
        setReceipt({ chain, tx, state })
      })
      .catch(() => {
        if (!cancelled) setReceipt({ chain: null, tx: null, state: 'offline' })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [chainIndex, txHash])

  return receipt
}
