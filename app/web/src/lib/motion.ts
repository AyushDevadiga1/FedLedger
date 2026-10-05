import type { CSSProperties } from 'react'

/**
 * The one place motion numbers live.
 *
 * Animation here is evidence, not decoration — a dot crossing a link, a block
 * dropping into a chain — so every duration is derived from what it has to
 * outlast rather than typed where it is used. Anything that moves reads its
 * timing from these tokens, which is what makes the system flexible: one
 * speed control or one reduced-motion switch rescales the whole dashboard
 * instead of whichever component remembered to listen.
 */

export const MOTION = {
  /** Gap between one staggered child and the next. */
  revealStaggerMs: 70,
  /** One reveal's own travel time. */
  revealDurationMs: 420,
  /** Slow ambient drift (hero sheen). Long on purpose — it should be felt,
   *  not watched. */
  ambientDurationMs: 9000,
  /** Easing for entrances: settles with a hint of overshoot. */
  easeEnter: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
  /** Easing for payload travel along a link. */
  easeTravel: 'inOutQuad',
} as const

export type MotionPreference = 'auto' | 'full' | 'reduced'

const STORAGE_KEY = 'fedledger:motion'

/** Read the persisted preference without throwing in private mode. */
export function loadMotionPreference(): MotionPreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'full' || raw === 'reduced' || raw === 'auto') return raw
  } catch {
    /* storage blocked — fall through to auto */
  }
  return 'auto'
}

export function saveMotionPreference(preference: MotionPreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* storage blocked — the session value still applies */
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Whether anything should move right now.
 *
 * 'full' means move regardless of the OS setting, 'reduced' means hold
 * still regardless, and 'auto' defers to the OS. The return value drives
 * both the CSS switch (`html[data-motion]`) and the JS switch (anime.js
 * never starts when this is false), so the two can never disagree.
 */
export function resolveAnimate(
  preference: MotionPreference,
  osReduced: boolean,
): boolean {
  if (preference === 'full') return true
  if (preference === 'reduced') return false
  return !osReduced
}

/**
 * Stagger helper for entrance reveals.
 *
 * The index becomes a CSS custom property, and the delay is computed in the
 * stylesheet — so a list of three and a list of thirty stagger correctly
 * with no per-count code. That is the whole scalability story: any number
 * of children, zero branches.
 */
export function revealStyle(index: number): CSSProperties {
  return { '--reveal-index': index } as CSSProperties
}
