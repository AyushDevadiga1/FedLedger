/**
 * Adapter for the backend as it actually is.
 *
 * Verified against fl_server/server.py:162, which appends
 * `(server_round, accuracy, tx_hash)` — three fields, not five. There is
 * no participants list and no timestamp anywhere in the payload, so
 * anything in the UI that implies otherwise would be fiction. Where the
 * old dashboard invented `['OrgA','OrgB','OrgC']` and a "seen HH:MM:SS"
 * for every block, this module returns null and the UI renders an
 * explicit em-dash instead.
 */

export type RawRound = [round: number, accuracy: number, txHash: string]

export interface LedgerRound {
  /** Server round number as written by the backend. */
  round: number
  /** Mean of the three nodes' accuracy on their own local TRAIN set. */
  accuracy: number
  /** Transaction hash, or '0x0' when the round never made it on-chain. */
  txHash: string
  /**
   * Index to pass to the verify endpoint. This is NOT the round number:
   * it is the count of earlier rows that actually logged, so a failed
   * round shifts every subsequent index. Round 3 can be chain index 1.
   */
  chainIndex: number | null
  onChain: boolean
  /** Always null — the backend writes no timestamp. */
  timestamp: null
  /** Always null — the backend writes no participants. */
  participants: null
}

export const MOCK_ROUNDS: RawRound[] = [
  [1, 72.5, '0x4f2a9c1e8b7d6a5f4e3c2b1a0987654321fedcba0987654321fedcba09'],
  [2, 81.0, '0x0'],
  [3, 85.7, '0xd2e577b4a1c0e9f8d7c6b5a4938271605f4e3d2c1b0a9988776655443322110'],
]

function isLogged(txHash: unknown): boolean {
  return typeof txHash === 'string' && txHash !== '' && txHash !== '0x0'
}

/**
 * Parse round_results.json defensively. The file is appended to by a
 * Python process while we poll it, so a torn read is possible and must
 * not take the dashboard down.
 */
export function parseRounds(raw: unknown): LedgerRound[] {
  if (!Array.isArray(raw)) return []

  const out: LedgerRound[] = []
  let chainIndex = 0

  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 3) continue

    const [round, accuracy, txHash] = row as RawRound
    if (typeof round !== 'number' || !Number.isFinite(round)) continue
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) continue

    const onChain = isLogged(txHash)
    out.push({
      round,
      accuracy,
      txHash: typeof txHash === 'string' ? txHash : '0x0',
      chainIndex: onChain ? chainIndex : null,
      onChain,
      timestamp: null,
      participants: null,
    })
    if (onChain) chainIndex += 1
  }

  return out
}

export interface LedgerStats {
  total: number
  logged: number
  unlogged: number
  verified: number
  best: number | null
  latest: number | null
  meanDelta: number | null
}

export function summarise(rounds: LedgerRound[], verified: ReadonlySet<number>): LedgerStats {
  const logged = rounds.filter((r) => r.onChain)
  const accuracies = rounds.map((r) => r.accuracy)

  let meanDelta: number | null = null
  const first = rounds[0]
  const last = rounds[rounds.length - 1]
  if (rounds.length > 1 && first && last) {
    meanDelta = last.accuracy - first.accuracy
  }

  return {
    total: rounds.length,
    logged: logged.length,
    unlogged: rounds.length - logged.length,
    verified: rounds.filter((r) => verified.has(r.round)).length,
    best: accuracies.length ? Math.max(...accuracies) : null,
    latest: accuracies.length ? last!.accuracy : null,
    meanDelta,
  }
}

/** `0x4f2a9c1e8b7d6a5f…` — enough to recognise, short enough to scan. */
export function shortHash(hash: string, lead = 6, tail = 4): string {
  if (!isLogged(hash)) return '—'
  if (hash.length <= lead + tail + 1) return hash
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`
}

export function formatAccuracy(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

/* ── verify endpoint ─────────────────────────────────────────────── */

const VERIFY_URL = 'http://127.0.0.1:8088/verify'

export type VerifyOutcome =
  | { status: 'match'; chainIndex: number }
  | { status: 'mismatch'; chainIndex: number }
  | { status: 'error'; chainIndex: number; message: string }

/**
 * POST /verify?round=<chainIndex> with {weights:[[coef,intercept],...]}.
 *
 * Note the weights must serialise as floats. `[0.0412, -0.1188]` is fine
 * but `0` instead of `0.0` changes the JSON text, which changes the
 * SHA-256, which silently turns a genuine match into a mismatch.
 */
export async function verifyRound(
  chainIndex: number,
  weights: number[][],
  signal?: AbortSignal,
): Promise<VerifyOutcome> {
  let response: Response
  try {
    response = await fetch(`${VERIFY_URL}?round=${chainIndex}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights }),
      signal,
    })
  } catch (cause) {
    return {
      status: 'error',
      chainIndex,
      message:
        cause instanceof Error && cause.name === 'AbortError'
          ? 'cancelled'
          : 'verify server unreachable — run: python app/verify_server.py',
    }
  }

  if (!response.ok) {
    return { status: 'error', chainIndex, message: `HTTP ${response.status}` }
  }

  let payload: { match?: boolean; error?: string }
  try {
    payload = (await response.json()) as { match?: boolean; error?: string }
  } catch {
    return { status: 'error', chainIndex, message: 'malformed response' }
  }

  if (payload.error) {
    return { status: 'error', chainIndex, message: payload.error }
  }
  return payload.match
    ? { status: 'match', chainIndex }
    : { status: 'mismatch', chainIndex }
}

/* ── polling ─────────────────────────────────────────────────────── */

/**
 * Parse a pasted weights blob, rejecting the shapes that silently break
 * hashing rather than letting them reach the verifier.
 */
export function parseWeights(text: string): number[][] | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'not valid JSON' }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'expected a non-empty array of [coef, intercept] pairs' }
  }
  for (const row of parsed) {
    if (!Array.isArray(row) || row.length !== 2) {
      return { error: 'each row must be exactly [coef, intercept]' }
    }
    if (!row.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return { error: 'weights must be finite numbers' }
    }
  }
  return parsed as number[][]
}

export const RESULTS_URL = '/round_results.json'
