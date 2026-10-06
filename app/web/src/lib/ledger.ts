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
  /**
   * Mean of the three nodes' scores for the *aggregated global model*, each
   * measured on that node's own local held-out split.
   *
   * Not the mean of the three local models' accuracies: the backend measures
   * this in `aggregate_evaluate`, after FedAvg, by broadcasting the new global
   * weights back to the nodes and scoring those. See fl_server/server.py:213.
   */
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

/** Machine-readable failure kinds, mirroring the codes :8088 returns. */
export type VerifyErrorCode =
  | 'not_found'
  | 'bad_request'
  | 'chain_unavailable'
  | 'unreachable'
  | 'timeout'
  | 'cancelled'
  | 'malformed'

/**
 * The evidence behind a verdict.
 *
 * `stored` is the bytes32 committed on-chain — keccak256 over the hex text of
 * a SHA-256 digest, so it is a commitment rather than the digest itself.
 * `recomputed` is the same construction applied to the submitted weights, and
 * `weightHash` is the underlying SHA-256 hex. Both layers are returned because
 * only the pair can be compared by eye, and because calling `stored` a "model
 * hash" without saying which layer it is would be the kind of imprecision
 * this whole page exists to avoid.
 */
export interface VerifyEvidence {
  /** keccak(sha256_hex) as stored in FLAuditLog.modelHash. */
  stored: string
  /** keccak(sha256_hex) of the submitted weights. */
  recomputed: string
  /** SHA-256 of the serialised weights, pre-keccak. */
  weightHash: string
  /** Round number as the CONTRACT records it, not as the local file claims. */
  roundNumber: number
  accuracy: number
  timestamp: number
  /** Rounds the contract held at verification time. */
  totalRounds: number
}

export type VerifyOutcome =
  | { status: 'match'; chainIndex: number; evidence: VerifyEvidence }
  | { status: 'mismatch'; chainIndex: number; evidence: VerifyEvidence }
  | {
      status: 'error'
      chainIndex: number
      message: string
      code: VerifyErrorCode
    }

/**
 * Copy for each failure kind.
 *
 * `not_found` is worded deliberately: a request for a round the chain never
 * wrote is a gap in the record, and saying so keeps it from being read as an
 * altered one. Every message here describes a failure to CHECK something, not
 * a finding about the data — only a completed comparison may draw that
 * conclusion.
 */
const ERROR_COPY: Record<VerifyErrorCode, string> = {
  unreachable:
    'The verifier on :8088 is not running. Start it with python app/verify_server.py.',
  not_found:
    'That chain index has no record. The chain holds fewer rounds than the index asks for — this is a missing round, not an altered one.',
  bad_request: 'The verifier rejected the request as malformed.',
  chain_unavailable:
    'The verifier could not reach the chain node on :8545, so nothing was compared.',
  timeout: 'The verifier did not answer in time. Nothing was compared.',
  cancelled: 'Comparison cancelled.',
  malformed: 'The verifier replied in a form this page cannot read.',
}

/**
 * POST /verify?round=<chainIndex> with {weights:[coef_matrix, intercept_vector]}.
 *
 * Two ordering decisions carry real weight here.
 *
 * The body is parsed BEFORE the status is judged. The verifier decodes the
 * contract's revert reason and returns it in `error`; reading `response.ok`
 * first threw that away and rendered every failure as "HTTP 500", including
 * the case where the contract had plainly answered "Round index out of
 * bounds".
 *
 * A timeout is imposed even though the caller may pass none. Without one, a
 * verifier that accepts the connection and never replies leaves the caller
 * stuck in a pending state forever with no way out.
 */
export async function verifyRound(
  chainIndex: number,
  weights: WeightPayload,
  signal?: AbortSignal,
): Promise<VerifyOutcome> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => controller.abort(), 15_000)

  const fail = (
    code: VerifyErrorCode,
    message: string = ERROR_COPY[code],
  ): VerifyOutcome => ({ status: 'error', chainIndex, message, code })

  let response: Response
  try {
    response = await fetch(`${VERIFY_URL}?round=${chainIndex}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights }),
      signal: controller.signal,
    })
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      return signal?.aborted ? fail('cancelled', 'cancelled') : fail('timeout')
    }
    return fail('unreachable')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }

  let payload: Partial<VerifyEvidence> & { match?: boolean; error?: string; code?: string }
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    return fail(
      'malformed',
      `The verifier replied with something that is not JSON (HTTP ${response.status}).`,
    )
  }

  // `payload.error` is checked before `response.ok` on purpose: the verifier
  // sends the useful explanation in the body, and the status alone says
  // nothing an operator can act on.
  if (payload.error) {
    const code: VerifyErrorCode =
      payload.code === 'not_found' ||
      payload.code === 'bad_request' ||
      payload.code === 'chain_unavailable'
        ? payload.code
        : response.ok
          ? 'malformed'
          : 'chain_unavailable'
    return fail(code, payload.error || ERROR_COPY[code])
  }

  if (typeof payload.match !== 'boolean' || typeof payload.stored !== 'string') {
    return fail('malformed', 'The verifier replied without a comparison result.')
  }

  const evidence: VerifyEvidence = {
    stored: payload.stored,
    recomputed: payload.recomputed ?? '',
    weightHash: payload.weightHash ?? '',
    roundNumber: payload.roundNumber ?? -1,
    accuracy: payload.accuracy ?? 0,
    timestamp: payload.timestamp ?? 0,
    totalRounds: payload.totalRounds ?? 0,
  }

  return { status: payload.match ? 'match' : 'mismatch', chainIndex, evidence }
}

/* ── polling ─────────────────────────────────────────────────────── */

/**
 * Parse the chain-index box.
 *
 * Returns null for anything that is not a whole number in range. The Verify
 * tab previously ran `Number.isInteger` inside its submit handler and simply
 * returned, which left the button enabled and clicking it did nothing at all
 * — no request, no message, no way for the user to tell that the field was
 * wrong. Validating here means the caller always has something to show.
 */
export function parseChainIndex(text: string, max: number): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 0) return null
  if (max >= 0 && value > max) return null
  return value
}

/**
 * Expected weight shape: [coef_matrix, intercept_vector].
 *
 * This mirrors `compute_weight_hash` in fl_server/fedavg.py, which does
 * `[x.tolist() for x in global_weights]` over the list the FedAvg step
 * returns. So the payload is NOT a list of [coef, intercept] pairs — it is
 * a 2-element array whose first element is the whole coefficient matrix
 * and whose second is the intercept vector. Getting this wrong still
 * hashes *something*, so the mismatch surfaces as bogus "tampering".
 */
export type WeightPayload = [number[][], number[]]

function isFlatVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n))
}

function tryParseJSON(text: string): { parsed: unknown } | null {
  try {
    return { parsed: JSON.parse(text) }
  } catch {
    return null
  }
}

/**
 * Coerce the shapes people actually paste out of a Python session into JSON
 * before parsing.
 *
 * The Verify box is where a user drops weights they computed themselves, and
 * those come from `print(global_weights)`, a sklearn model's `coef_`, or a dict
 * they built by hand — none of which is JSON. Answering that with "not valid
 * JSON" is a dead end: the numbers are right there, only the syntax differs. So
 * the wrappers come off here: `np.float64(x)` and `array([[...]])` are unwrapped,
 * single quotes and Python literals are translated, trailing commas removed.
 * This only runs after a strict parse has already failed, so legitimate JSON is
 * never touched — which is also why dropping every paren is safe: a JSON
 * weight payload contains none.
 */
function coerceWeightsText(text: string): string {
  let out = text.trim()
  if (out === '') return out

  // numpy / stdlib wrappers: np.float64(0.5), array([[..]])
  out = out.replace(/\b(?:np|numpy|jnp|torch|tf)\s*\.\s*\w+\s*\(/g, '(')
  out = out.replace(/\b(?:array|ndarray)\s*\(/g, '(')
  out = out.replace(/[()]/g, '')

  // Python literals. Only translated when the text has no double quotes yet,
  // so a real string containing an apostrophe is never mangled.
  if (!out.includes('"')) out = out.replace(/'/g, '"')
  out = out
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')

  // trailing commas, with whatever whitespace sits between it and the closer
  out = out.replace(/,\s*([\]}])/g, '$1')

  return out
}

/** sklearn exports these as objects rather than the pair the ledger hashes. */
function fromAttributeObject(parsed: Record<string, unknown>): WeightPayload | null {
  const coef = parsed.coef ?? parsed.coef_
  const intercept = parsed.intercept ?? parsed.intercept_
  if (coef === undefined || intercept === undefined) return null
  return [coef, intercept] as unknown as WeightPayload
}

export function parseWeights(text: string): WeightPayload | { error: string } {
  if (text.trim() === '') return { error: 'expected [coef_matrix, intercept_vector]' }

  // Strict first: valid JSON is passed through untouched.
  const strict = tryParseJSON(text)
  const parsed = strict ? strict.parsed : tryParseJSON(coerceWeightsText(text))?.parsed

  if (parsed === undefined) return { error: 'not valid JSON' }

  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    const fromObject = fromAttributeObject(parsed as Record<string, unknown>)
    if (fromObject === null) {
      return { error: 'expected [coef_matrix, intercept_vector]' }
    }
    const serialised = JSON.stringify(fromObject)
    if (typeof serialised !== 'string') return { error: 'weights are not JSON-serialisable' }
    return parseWeights(serialised)
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'expected [coef_matrix, intercept_vector]' }
  }
  if (parsed.length !== 2) {
    return {
      error: `expected exactly 2 items (coef matrix, intercept vector), got ${parsed.length}`,
    }
  }

  const [coef, intercept] = parsed as unknown[]

  // coef: rows of equal length, all finite, and consistent with intercept.
  if (!Array.isArray(coef) || coef.length === 0) {
    return { error: 'coef_matrix must be a non-empty array of rows' }
  }
  if (!coef.every(isFlatVector)) {
    return { error: 'coef_matrix must be rows of finite numbers' }
  }
  const width = (coef as number[][])[0].length
  if (!coef.every((row) => (row as number[]).length === width)) {
    return { error: 'every coef row must have the same number of columns' }
  }

  if (!isFlatVector(intercept) || intercept.length === 0) {
    return { error: 'intercept_vector must be a non-empty array of finite numbers' }
  }
  if (intercept.length !== coef.length) {
    return {
      error: `intercept length ${intercept.length} must match coef rows ${coef.length}`,
    }
  }

  return [coef as number[][], intercept as number[]]
}

export const RESULTS_URL = '/round_results.json'

export const GLOBAL_WEIGHTS_URL = '/global_weights.json'

/**
 * Per-round aggregated weights the FL server persisted to
 * app/global_weights.json, keyed by round number as strings.
 *
 * These are the exact arrays compute_weight_hash hashed — .tolist() output,
 * written by the same process — so loading one and comparing must report a
 * match. Entries are validated only as 2-element arrays here; the entry
 * actually loaded goes through parseWeights, which is the strict gate.
 * Null when the file is absent (no round completed yet, or the run started
 * before weight logging existed) or unreadable.
 */
export async function fetchGlobalWeights(
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(GLOBAL_WEIGHTS_URL, { signal })
    if (!res.ok) return null
    const raw: unknown = await res.json()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    return raw as Record<string, unknown>
  } catch {
    return null
  }
}

/* ── dataset metadata ─────────────────────────────────────────────── */

/**
 * Shape of data/dataset_meta.json, written by data/generate_partitions.py.
 * The row count lives here rather than being hardcoded so the UI stays
 * correct when the launcher runs a different dataset.
 */
export interface DatasetMeta {
  name: string
  description: string
  total_samples: number
  num_features: number
  num_classes: number
}

const DATASET_META_FALLBACK: DatasetMeta = {
  name: 'iris',
  description: '150 samples, 4 features, 3 classes',
  total_samples: 150,
  num_features: 4,
  num_classes: 3,
}

export const DATASET_META_URL = '/dataset_meta.json'

export async function fetchDatasetMeta(
  signal?: AbortSignal,
): Promise<DatasetMeta> {
  try {
    const res = await fetch(DATASET_META_URL, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const meta = (await res.json()) as Partial<DatasetMeta>
    if (typeof meta.total_samples !== 'number' || typeof meta.name !== 'string') {
      throw new Error('unexpected shape')
    }
    return { ...DATASET_META_FALLBACK, ...meta }
  } catch {
    // The server already serves a matching default when the file is absent,
    // so reaching here means the dashboard is offline rather than unconfigured.
    return DATASET_META_FALLBACK
  }
}
