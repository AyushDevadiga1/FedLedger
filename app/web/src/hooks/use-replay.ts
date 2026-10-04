import { useCallback, useEffect, useRef, useState } from 'react'

import { PHASES, PHASE_DURATION_MS, type PhaseId } from '@/lib/phases'

export interface Replay {
  phase: PhaseId | null
  isPlaying: boolean
  /** Index into PHASES, or -1 before a replay starts. */
  cursor: number
  speed: number
  play: () => void
  pause: () => void
  reset: () => void
  goTo: (index: number) => void
  next: () => void
  setSpeed: (speed: number) => void
  reducedMotion: boolean
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Drives the five-phase replay.
 *
 * Deliberately a single sequence with a scrubber rather than the old
 * manual / auto / speed-run modes: those were three names for "play the
 * same animation", and the difference between them was only how long you
 * waited.
 */
export function useReplay(): Replay {
  const [phase, setPhase] = useState<PhaseId | null>(null)
  const [cursor, setCursor] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [reducedMotion] = useState(prefersReducedMotion)

  const timerRef = useRef<number | null>(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const show = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, PHASES.length - 1))
    setCursor(clamped)
    setPhase(PHASES[clamped]!.id)
  }, [])

  const play = useCallback(() => {
    clearTimer()
    setIsPlaying(true)
    // Start from the beginning if we are parked at the end.
    setCursor((current) => {
      if (current >= PHASES.length - 1) {
        setPhase(PHASES[0]!.id)
        return 0
      }
      return current
    })
  }, [clearTimer])

  const pause = useCallback(() => {
    clearTimer()
    setIsPlaying(false)
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    setIsPlaying(false)
    setCursor(-1)
    setPhase(null)
  }, [clearTimer])

  const goTo = useCallback(
    (index: number) => {
      clearTimer()
      setIsPlaying(false)
      show(index)
    },
    [clearTimer, show],
  )

  const next = useCallback(() => {
    goTo(cursor + 1)
  }, [cursor, goTo])

  // Advance the cursor on a timer while playing.
  useEffect(() => {
    if (!isPlaying) return

    if (cursor >= PHASES.length - 1) {
      setIsPlaying(false)
      return
    }

    const current = PHASES[Math.max(cursor, 0)]!
    const duration = PHASE_DURATION_MS[current.id] / speedRef.current

    timerRef.current = window.setTimeout(() => {
      show(cursor + 1)
    }, duration)

    return clearTimer
  }, [clearTimer, cursor, isPlaying, show])

  useEffect(() => clearTimer, [clearTimer])

  return {
    phase,
    isPlaying,
    cursor,
    speed,
    play,
    pause,
    reset,
    goTo,
    next,
    setSpeed: setSpeedState,
    reducedMotion,
  }
}
