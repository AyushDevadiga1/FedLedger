import { useCallback, useEffect, useState } from 'react'

import {
  loadMotionPreference,
  prefersReducedMotion,
  resolveAnimate,
  saveMotionPreference,
  type MotionPreference,
} from '@/lib/motion'

export interface MotionState {
  preference: MotionPreference
  setPreference: (preference: MotionPreference) => void
  /** False when nothing on the page should move. */
  animate: boolean
}

/**
 * Page-wide motion switch, persisted across reloads.
 *
 * Publishes to `html[data-motion]` so CSS and JS stay in agreement: the
 * stylesheet kills keyframe reveals under `reduced`, and animated
 * components read `animate` before starting anything imperative. The
 * default is 'auto', which simply follows the OS setting.
 */
export function useMotionPreference(): MotionState {
  const [preference, setPreferenceState] =
    useState<MotionPreference>('auto')
  const [osReduced, setOsReduced] = useState(false)

  useEffect(() => {
    setPreferenceState(loadMotionPreference())
    setOsReduced(prefersReducedMotion())

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) =>
      setOsReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const animate = resolveAnimate(preference, osReduced)

  useEffect(() => {
    document.documentElement.dataset.motion = animate ? 'full' : 'reduced'
  }, [animate])

  const setPreference = useCallback((next: MotionPreference) => {
    setPreferenceState(next)
    saveMotionPreference(next)
  }, [])

  return { preference, setPreference, animate }
}
