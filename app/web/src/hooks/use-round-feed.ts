import { useCallback, useEffect, useRef, useState } from 'react'

import {
  MOCK_ROUNDS,
  parseRounds,
  RESULTS_URL,
  type LedgerRound,
} from '@/lib/ledger'

export type FeedStatus = 'loading' | 'live' | 'empty' | 'unreachable'

export interface RoundFeed {
  rounds: LedgerRound[]
  status: FeedStatus
  /** True while showing MOCK_ROUNDS because the real file is absent. */
  usingMock: boolean
  /** Rounds the user has verified in this session. */
  verified: ReadonlySet<number>
  markVerified: (round: number) => void
  lastUpdated: Date | null
}

const POLL_MS = 2000

/**
 * Polls round_results.json.
 *
 * Two things the previous dashboard got wrong are handled here:
 *  1. It treated a fetch failure as "0 rounds" and rendered an empty
 *     state, so a stopped server looked identical to a fresh project.
 *     `status` distinguishes unreachable from genuinely empty.
 *  2. It only compared lengths to detect a new run. If a run restarted at
 *     the same round count, the stale round 1 was never replaced. The
 *     first row's tx hash is part of the identity check.
 */
export function useRoundFeed(): RoundFeed {
  const [rounds, setRounds] = useState<LedgerRound[]>([])
  const [status, setStatus] = useState<FeedStatus>('loading')
  const [usingMock, setUsingMock] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [verified, setVerified] = useState<ReadonlySet<number>>(() => new Set())

  // Refs keep the poll callback stable so the interval is not torn down
  // and rebuilt on every round change.
  const signatureRef = useRef<string>('')
  const mockTimerRef = useRef<number | null>(null)

  const markVerified = useCallback((round: number) => {
    setVerified((prev) => {
      if (prev.has(round)) return prev
      const next = new Set(prev)
      next.add(round)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const response = await fetch(`${RESULTS_URL}?_=${Date.now()}`, {
          cache: 'no-store',
        })
        if (cancelled) return

        if (response.status === 404) {
          setUsingMock(false)
          setStatus('empty')
          setLastUpdated(new Date())
          return
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const raw: unknown = await response.json()
        const parsed = parseRounds(raw)
        if (cancelled) return

        // A new run is identified by round count AND the first tx hash.
        const signature = `${parsed.length}:${parsed[0]?.txHash ?? ''}`
        if (signature !== signatureRef.current) {
          if (signatureRef.current !== '') setVerified(new Set())
          signatureRef.current = signature
          setRounds(parsed)
        }

        setUsingMock(false)
        setStatus(parsed.length ? 'live' : 'empty')
        setLastUpdated(new Date())
      } catch {
        if (cancelled) return
        setStatus((prev) => (prev === 'live' ? 'live' : 'unreachable'))
      }
    }

    void poll()
    const id = window.setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  // Fall back to mock data so the visual design can be reviewed before the
  // backend has ever produced a round. Deliberately delayed and visibly
  // flagged in the UI — it is never silently substituted for real data.
  useEffect(() => {
    if (status !== 'unreachable') {
      if (mockTimerRef.current !== null) {
        window.clearTimeout(mockTimerRef.current)
        mockTimerRef.current = null
      }
      return
    }
    mockTimerRef.current = window.setTimeout(() => {
      setUsingMock(true)
      setRounds(parseRounds(MOCK_ROUNDS))
      setStatus('live')
    }, 1200)

    return () => {
      if (mockTimerRef.current !== null) {
        window.clearTimeout(mockTimerRef.current)
        mockTimerRef.current = null
      }
    }
  }, [status])

  return { rounds, status, usingMock, verified, markVerified, lastUpdated }
}
