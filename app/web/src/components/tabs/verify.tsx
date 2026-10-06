import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileCode,
  Link2,
  X,
} from 'lucide-react'

import {
  EmptyState,
  Eyebrow,
  Hash,
  Panel,
  PanelHead,
  StatusPill,
} from '@/components/primitives'
import { tamperWeights, WeightsDropzone } from '@/components/dropzone'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useChainHead } from '@/hooks/use-chain-head'
import {
  parseChainIndex,
  parseWeights,
  fetchGlobalWeights,
  verifyRound,
  type LedgerRound,
  type VerifyOutcome,
} from '@/lib/ledger'
import { cn } from '@/lib/utils'
import {
  downloadTemplate,
  downloadTextFile,
  fetchTemplate,
  weightsFromTemplate,
  WEIGHT_TEMPLATES,
} from '@/lib/templates'
import { formatTimestamp, shortDigest } from '@/lib/chain'

/**
 * Verification, modelled on how a chain is actually read.
 *
 * Three decisions carry the whole design, and each replaces something that
 * used to be wrong:
 *
 * 1. THE CHAIN OWNS THE INDEX→ROUND MAPPING. Rounds are not identified by
 *    counting rows in round_results.json. The contract is asked what sits at
 *    each index, exactly as a node asks a peer what sits at each block
 *    number. The local file is a hint about where to look, never the
 *    authority — which is what stops a stale, mocked, or frozen snapshot from
 *    making this page accuse a chain of being altered.
 *
 * 2. A MISSING RECORD IS NOT AN ALTERED ONE. Asking for an index the chain
 *    never wrote returns a 404 and is described as a gap. Ethereum keeps that
 *    line sharp for the same reason: no block above the head is evidence of
 *    anything.
 *
 * 3. A VERDICT CARRIES ITS EVIDENCE. Both digests are shown in full, because
 *    "they differ" is a claim and "here are the two values" is the thing a
 *    third party can check. The panel that used to say "read from FLAuditLog"
 *    under a heading promising a hash showed no hash at all.
 */
export function VerifyTab({
  rounds,
  onVerified,
  feedIsReal,
}: {
  rounds: LedgerRound[]
  onVerified: (round: number) => void
  /**
   * False when the rounds on screen are mock or a frozen snapshot. The tab
   * keeps working — the chain is the authority either way — but it stops
   * describing a comparison as being about the live run.
   */
  feedIsReal?: boolean
}) {
  // Candidates come from the local feed. They are a suggestion about which
  // indices are worth offering; the contract decides what they mean.
  const candidates = useMemo(
    () =>
      rounds
        .filter((r): r is LedgerRound & { chainIndex: number } => r.onChain && r.chainIndex !== null)
        .map((r) => r.chainIndex),
    [rounds],
  )

  const chain = useChainHead(candidates)
  const [chainIndex, setChainIndex] = useState('')
  const [weights, setWeights] = useState('')
  const [droppedName, setDroppedName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)
  const [liveBusy, setLiveBusy] = useState(false)

  // ── in-flight control ──────────────────────────────────────────────
  // A stale verdict is worse than no verdict on a page whose job is to be
  // believed, so every submission carries an id and an abort handle. Editing
  // the target mid-flight cancels the pending answer rather than letting it
  // land beside a question it does not answer.
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const [requestId, setRequestId] = useState(0)

  useEffect(
    () => () => {
      requestRef.current?.controller.abort()
    },
    [],
  )

  const parsed = weights.trim() ? parseWeights(weights) : null
  const parseError = parsed && !Array.isArray(parsed) ? parsed.error : null
  const weightsOk = Array.isArray(parsed)

  /**
   * What to act on when the box is untouched.
   *
   * Defaults to the head — the most recently sealed round — because that is
   * the one anyone checking a live run wants, and the oldest round is almost
   * never it. Falls back to the local feed's first logged index if the chain
   * cannot be read.
   */
  const headIndex =
    chain.identity.totalRounds !== null && chain.identity.totalRounds > 0
      ? chain.identity.totalRounds - 1
      : (candidates[0] ?? null)

  const activeIndexText = chainIndex !== '' ? chainIndex : headIndex === null ? '' : String(headIndex)
  const indexError =
    activeIndexText.trim() === ''
      ? null
      : parseChainIndex(activeIndexText, -1) === null
        ? 'A chain index is a whole number, counting from 0.'
        : null

  const parsedIndex = parseChainIndex(activeIndexText, -1)

  /** The contract's own answer for this index, when it has one. */
  const onChain = parsedIndex === null ? undefined : chain.records.get(parsedIndex)
  const localClaim = rounds.find((r) => r.chainIndex === parsedIndex)

  /** True when the local feed and the contract disagree about this index. */
  const disagreement =
    onChain !== undefined && localClaim !== undefined && onChain.roundNumber !== localClaim.round
      ? { chain: onChain.roundNumber, file: localClaim.round }
      : null

  const select = useCallback((index: number) => {
    requestRef.current?.controller.abort()
    setChainIndex(String(index))
    setOutcome(null)
  }, [])

  const run = async () => {
    if (!weightsOk || parsedIndex === null) return

    requestRef.current?.controller.abort()
    const controller = new AbortController()
    const id = requestId + 1
    requestRef.current = { id, controller }
    setRequestId(id)
    setBusy(true)
    setOutcome(null)

    try {
      const result = await verifyRound(parsedIndex, parsed, controller.signal)
      // A superseded request must not paint over the newer one.
      if (requestRef.current?.id !== id) return
      setOutcome(result)
      // The round number used to badge the round comes from the CONTRACT,
      // not the local file, so a match can never be filed against the wrong
      // round.
      if (result.status === 'match') onVerified(result.evidence.roundNumber)
    } finally {
      if (requestRef.current?.id === id) setBusy(false)
    }
  }

  const submitDisabled =
    busy || parseError !== null || !weightsOk || parsedIndex === null || indexError !== null

  /**
   * The round whose weights to fetch from the run: the CONTRACT's round
   * number for this index first, the local feed's claim second. Either is
   * good enough to key global_weights.json — and if they disagree, the
   * comparison that follows is still judged against the chain, so a wrong
   * guess here can only produce an honest mismatch, never a false match.
   */
  const roundForLive = onChain?.roundNumber ?? localClaim?.round ?? null

  /**
   * Fetch the exact weights this run saved for the selected round.
   *
   * Shared by the load and download buttons so the two files a user can
   * hold — the one in the box and the one on disk — are byte-identical in
   * value and both verify with a match. Failures report through the outcome
   * panel with the same wording whichever button was pressed.
   */
  const getLiveText = useCallback(async (): Promise<{
    round: number
    text: string
  } | null> => {
    if (roundForLive === null) return null
    const file = await fetchGlobalWeights()
    const entry = file?.[String(roundForLive)] ?? null
    if (!entry) {
      setOutcome({
        status: 'error',
        chainIndex: parsedIndex ?? 0,
        code: 'not_found',
        message:
          `This run saved no weights for round ${roundForLive} — it likely ` +
          `started before weight logging existed. Re-run to generate them.`,
      })
      return null
    }
    // Compact here; the download path pretty-prints. Either parses to the
    // same numbers, and only the values matter to the verifier.
    return { round: roundForLive, text: JSON.stringify(entry) }
  }, [roundForLive, parsedIndex])

  /**
   * Load the exact weights this run saved for the selected round.
   *
   * This is the path to a MATCH: the server persisted the same .tolist()
   * arrays compute_weight_hash hashed, so comparing them must agree. Demo
   * files and hand-pasted weights can only mismatch (or match by miracle);
   * this button is what a viva actually clicks.
   */
  const loadLive = useCallback(async () => {
    setLiveBusy(true)
    try {
      const live = await getLiveText()
      if (!live) return
      // Stringified, not pretty-printed: parseWeights re-validates it below,
      // which is the strict gate regardless of where the text came from.
      setWeights(live.text)
      setDroppedName(`live weights · round ${live.round}`)
      setOutcome(null)
    } finally {
      setLiveBusy(false)
    }
  }, [getLiveText])

  /**
   * Download the same weights as a file — the "actual" half of the demo
   * pair. Dropping it back into the box (or the dropzone) and comparing
   * must report a match, next to the demo file's honest mismatch.
   */
  const downloadLive = useCallback(async () => {
    setLiveBusy(true)
    try {
      const live = await getLiveText()
      if (!live) return
      downloadTextFile(
        `fedledger_round${live.round}_weights.json`,
        JSON.stringify(JSON.parse(live.text) as unknown, null, 2),
      )
    } finally {
      setLiveBusy(false)
    }
  }, [getLiveText])

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2">
      {/* ── input ── */}
      <Panel className="border-r-0">
        <PanelHead title="Verify a round" meta="POST :8088/verify" />

        {/* Chain context. A verdict about a chain means nothing without
            knowing which chain, so identity is shown before the form. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2.5">
          <StatusPill
            label="chain node"
            tone={
              chain.state === 'ready'
                ? 'ok'
                : chain.state === 'loading'
                  ? 'idle'
                  : 'off'
            }
          />
          <span className="font-mono text-2xs text-subtle">
            {chain.state === 'loading' ? (
              'reading chain head…'
            ) : chain.state === 'undeployed' ? (
              'no contract at the configured address'
            ) : chain.state === 'offline' ? (
              'node not answering'
            ) : chain.identity.genesis ? (
              <>
                chain{' '}
                <span title={chain.identity.genesis}>
                  {shortDigest(chain.identity.genesis)}
                </span>
                {chain.identity.chainId ? ` · id ${chain.identity.chainId}` : ''}
                {chain.identity.headBlock !== null
                  ? ` · block ${chain.identity.headBlock}`
                  : ''}
              </>
            ) : (
              // Reachable and answering, but the genesis hash could not be
              // read. Saying "node not answering" here would be a lie about
              // a node that answered, and would hide a proxy misconfiguration.
              'head read; chain identity unavailable'
            )}
          </span>
          <button
            type="button"
            onClick={chain.reload}
            className="ml-auto font-mono text-2xs text-subtle underline underline-offset-2 transition-colors hover:text-foreground"
          >
            refresh
          </button>
        </div>

        {candidates.length === 0 ? (
          <EmptyState title="nothing sealed to verify against">
            Verification compares a recomputed hash against what is already
            recorded on-chain. No round has been sealed yet.
          </EmptyState>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <WeightsDropzone
              onWeights={(text, filename) => {
                setWeights(text)
                setDroppedName(filename)
                setOutcome(null)
                if (candidates.length === 1 && candidates[0] !== undefined) {
                  select(candidates[0])
                }
              }}
            />

            {/* ── round picker, read from the chain ── */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="chain-index">chain index</Label>
                <span className="font-mono text-2xs text-subtle">
                  {chain.identity.totalRounds !== null
                    ? `chain holds ${chain.identity.totalRounds} round${chain.identity.totalRounds === 1 ? '' : 's'}`
                    : 'round count unknown'}
                </span>
              </div>

              <Input
                id="chain-index"
                inputMode="numeric"
                placeholder="0"
                value={activeIndexText}
                aria-invalid={indexError !== null}
                onChange={(e) => {
                  requestRef.current?.controller.abort()
                  setChainIndex(e.target.value)
                  setOutcome(null)
                }}
                className="max-w-32 font-mono"
              />

              {indexError ? (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {indexError}
                </p>
              ) : (
                <p className="text-xs text-subtle">
                  Position in the contract&apos;s array, not the round number.{' '}
                  {onChain ? (
                    <>
                      The chain records{' '}
                      <span className="font-mono text-muted-foreground">
                        round {onChain.roundNumber}
                      </span>{' '}
                      at index {parsedIndex}
                      {disagreement ? (
                        <span className="text-destructive">
                          {' '}
                          — but round_results.json calls this round {disagreement.file}, so the
                          local file is out of step with the chain. The chain is authoritative.
                        </span>
                      ) : null}
                      .
                    </>
                  ) : (
                    <>
                      The chain has not been read for this index yet
                      {parsedIndex !== null && chain.identity.totalRounds !== null && parsedIndex >= chain.identity.totalRounds
                        ? ` — it holds only ${chain.identity.totalRounds} rounds, so this index is above the head.`
                        : '.'}
                    </>
                  )}
                </p>
              )}

              {/* Tokens are the real control; the box above is the fallback
                  for someone who already knows the number. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Eyebrow>sealed rounds</Eyebrow>
                {candidates.map((index) => {
                  const record = chain.records.get(index)
                  const active = index === parsedIndex
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => select(index)}
                      aria-pressed={active}
                      title={
                        record
                          ? `chain index ${index} holds round ${record.roundNumber}`
                          : `chain index ${index}`
                      }
                      className={cn(
                        'rounded-sm border px-1.5 py-0.5 font-mono text-2xs whitespace-nowrap transition-colors',
                        active
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border-strong text-subtle hover:border-primary/50 hover:bg-primary/10 hover:text-primary',
                      )}
                    >
                      {index}
                      <span className="text-subtle"> → </span>
                      round {record ? record.roundNumber : '?'}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="weights">global weights, as JSON</Label>
                <span className="font-mono text-2xs text-subtle">
                  [coef_matrix, intercept_vector]
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 border border-border bg-muted/40 px-3 py-2">
                <FileCode className="size-3.5 shrink-0 text-subtle" aria-hidden />
                {feedIsReal !== false ? (
                  <span className="flex items-center gap-1">
                    <span className="text-2xs text-muted-foreground">
                      From this run — will match
                    </span>
                    <button
                      type="button"
                      onClick={loadLive}
                      disabled={roundForLive === null || liveBusy}
                      className="rounded-sm border border-verified/50 bg-verified/10 px-1.5 py-0.5 font-mono text-2xs text-verified transition-colors hover:border-verified hover:bg-verified/20 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        roundForLive === null
                          ? 'Pick a chain index first'
                          : `Load the exact weights this run saved for round ${roundForLive} — comparing them must report a match`
                      }
                    >
                      {liveBusy
                        ? 'loading…'
                        : roundForLive === null
                          ? 'load live weights'
                          : `load live weights · round ${roundForLive}`}
                    </button>
                    <button
                      type="button"
                      onClick={downloadLive}
                      disabled={roundForLive === null || liveBusy}
                      className="text-subtle transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        roundForLive === null
                          ? 'Pick a chain index first'
                          : `Download round ${roundForLive}'s weights as fedledger_round${roundForLive}_weights.json — the actual file`
                      }
                      aria-label="Download live weights as a file"
                    >
                      <Download className="size-3" />
                    </button>
                  </span>
                ) : null}
                <span className="text-2xs text-muted-foreground">
                  Demo files — invented, will mismatch
                </span>
                {WEIGHT_TEMPLATES.map((t) => (
                  <span key={t.url} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const text = await fetchTemplate(t.url)
                        if (typeof text !== 'string') {
                          setOutcome({
                            status: 'error',
                            chainIndex: parsedIndex ?? 0,
                            code: 'malformed',
                            message: text.error,
                          })
                          return
                        }
                        const bare = weightsFromTemplate(text)
                        if (typeof bare !== 'string') {
                          setOutcome({
                            status: 'error',
                            chainIndex: parsedIndex ?? 0,
                            code: 'malformed',
                            message: bare.error,
                          })
                          return
                        }
                        setWeights(bare)
                        setDroppedName(t.name)
                        setOutcome(null)
                      }}
                      className="rounded-sm border border-border-strong px-1.5 py-0.5 font-mono text-2xs text-primary transition-colors hover:border-primary/50 hover:bg-primary/10"
                      title={`Load ${t.blurb} — ${t.shape}`}
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTemplate(t.url, t.name)}
                      className="text-subtle transition-colors hover:text-foreground"
                      title={`Download ${t.name}`}
                      aria-label={`Download ${t.name}`}
                    >
                      <Download className="size-3" />
                    </button>
                  </span>
                ))}
                <span className="text-2xs text-subtle">
                  — the pair shows both verdicts: the run's own file
                  matches, the invented demo files mismatch
                </span>
              </div>

              <Textarea
                id="weights"
                spellCheck={false}
                placeholder={'[[[0.0412, -0.1188], [-0.3310, 0.4455]], [0.1, -0.2]]'}
                value={weights}
                onChange={(e) => {
                  setWeights(e.target.value)
                  setDroppedName(null)
                  setOutcome(null)
                }}
                className="font-mono text-xs leading-relaxed"
              />

              {parseError ? (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {parseError}
                </p>
              ) : droppedName ? (
                <p className="text-xs text-subtle">
                  loaded{' '}
                  <span className="font-mono text-muted-foreground">{droppedName}</span>
                  {' · '}
                  {weightsOk
                    ? `coef matrix ${parsed[0].length}×${parsed[0][0]?.length ?? 0} + ${parsed[1].length} intercepts`
                    : ''}
                </p>
              ) : (
                <p className="text-xs text-subtle">
                  Load the live weights this run saved for the selected
                  round, drop a weights file, or paste JSON — or recompute
                  FedAvg over the three node updates by hand.
                </p>
              )}
            </div>

            <Alert className="border-primary/40 bg-primary/5 text-foreground [&>svg]:text-primary">
              <AlertTriangle />
              <AlertTitle>Two files, two verdicts — that is the demo</AlertTitle>
              <AlertDescription>
                The chain stores a SHA-256 of the <em>real</em> aggregated
                weights, so which file you compare decides the verdict before
                you click: the run's own weights must report a{' '}
                <em>match</em>, and the plausible-but-invented demo files
                must report a <em>mismatch</em>. Either verdict going the
                other way means something is genuinely wrong — and the
                mismatch side is the proof that verification really runs
                instead of always saying yes.
                <span className="mt-2 block text-muted-foreground">
                  Your formatting cannot cause a false mismatch: the verifier
                  re-serialises the numbers itself, so{' '}
                  <span className="font-mono">0</span> and{' '}
                  <span className="font-mono">0.0</span> hash identically. Only
                  the <em>values</em> matter.
                </span>
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={submitDisabled}>
                {busy ? 'checking…' : 'Compare hashes'}
              </Button>

              {/* Demonstrates the mismatch path without hand-editing JSON. */}
              <Button
                variant="outline"
                disabled={busy || !weightsOk || parsedIndex === null}
                onClick={() => {
                  const altered = tamperWeights(weights)
                  if (altered === null) return
                  setWeights(altered)
                  setDroppedName(null)
                  setOutcome(null)
                }}
              >
                Alter one coefficient
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* ── result ── */}
      <Panel>
        <PanelHead
          title="Result"
          meta={
            outcome && outcome.status !== 'error'
              ? `round ${outcome.evidence.roundNumber}`
              : onChain
                ? `round ${onChain.roundNumber}`
                : undefined
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {outcome === null ? (
            <EmptyState title="no comparison run yet">
              Pick a sealed round above, paste the recomputed weights, and compare.
            </EmptyState>
          ) : outcome.status === 'error' ? (
            <div className="flex items-start gap-3 border border-destructive bg-destructive/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <span className="font-mono text-sm text-destructive">
                  nothing was compared
                </span>
                <span className="text-sm text-muted-foreground">{outcome.message}</span>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'flex items-start gap-3 border px-4 py-3',
                  outcome.status === 'match'
                    ? 'border-verified bg-verified/10'
                    : 'border-destructive bg-destructive/10',
                )}
              >
                {outcome.status === 'match' ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-verified" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'font-mono text-sm',
                      outcome.status === 'match' ? 'text-verified' : 'text-destructive',
                    )}
                  >
                    {outcome.status === 'match' ? 'match' : 'mismatch'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {outcome.status === 'match'
                      ? 'The weights you submitted produce the same commitment the chain holds for this round, so the logged model is the one you computed.'
                      : 'These weights produce a different commitment from the one recorded for this round.'}
                  </span>
                </div>
              </div>

              {/* ── the evidence, in full ── */}
              <div className="flex flex-col gap-px border border-border bg-border">
                <DigestRow
                  label="on-chain · FLAuditLog.modelHash"
                  caption="keccak256 over the hex text of the round's SHA-256"
                  value={outcome.evidence.stored}
                  tone={outcome.status === 'match' ? 'verified' : 'default'}
                />
                <DigestRow
                  label="recomputed · from the weights you submitted"
                  caption="same construction, applied to the submitted array"
                  value={outcome.evidence.recomputed}
                  tone={outcome.status === 'match' ? 'verified' : 'destructive'}
                />
              </div>

              <p className="text-xs text-subtle">
                The chain stores a commitment, not the weights:{' '}
                <span className="font-mono">keccak(sha256_hex)</span>, so the
                on-chain value is one step removed from the digest itself. The
                SHA-256 underneath this comparison is{' '}
                <span className="font-mono break-all text-muted-foreground">
                  {outcome.evidence.weightHash || '—'}
                </span>
                . Verifying it yourself means hashing your own serialised array
                and comparing that string, not these bytes32 values.
              </p>

              {/* ── confirmation depth, the part that makes it a chain ── */}
              <div className="flex flex-col gap-2 border border-border px-3 py-3">
                <Eyebrow>record</Eyebrow>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-subtle">round number</dt>
                  <dd className="font-mono text-foreground">
                    {outcome.evidence.roundNumber}
                  </dd>
                  <dt className="text-subtle">sealed accuracy</dt>
                  <dd className="font-mono text-foreground">
                    {outcome.evidence.accuracy.toFixed(1)}%
                  </dd>
                  <dt className="text-subtle">sealed at</dt>
                  <dd className="font-mono text-foreground">
                    {formatTimestamp(outcome.evidence.timestamp)}
                  </dd>
                  <dt className="text-subtle">rounds on chain</dt>
                  <dd className="font-mono text-foreground">
                    {outcome.evidence.totalRounds}
                  </dd>
                  <dt className="text-subtle">tx hash</dt>
                  <dd className="font-mono">
                    <Hash
                      value={localClaim?.txHash ?? '—'}
                      onChain={localClaim?.onChain ?? false}
                    />
                  </dd>
                </dl>
                <p className="text-xs text-subtle">
                  FLAuditLog exposes no delete or edit function, so a sealed
                  round cannot be rewritten through this contract — removal
                  would require redeploying it, which changes the address and
                  the genesis-hash identity shown above.
                </p>
              </div>
            </>
          )}

          {feedIsReal === false && outcome !== null ? (
            <div className="flex items-start gap-2 border border-border-strong bg-muted/40 px-3 py-2">
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-subtle" />
              <p className="text-xs text-subtle">
                These rounds are a demo or a frozen snapshot, not a live run.
                The comparison above is still against the real chain — but it is
                not evidence about the training run you are looking at.
              </p>
            </div>
          ) : null}

          {candidates.length > 0 ? (
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="font-mono text-2xs text-subtle">
                {chain.records.size} of {candidates.length} indices read from the chain
              </span>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}

/**
 * One digest, in full, with a copy affordance.
 *
 * Truncated to fit would defeat the purpose: the entire point of showing the
 * evidence is that a reader can compare it character by character against
 * their own recomputation.
 */
function DigestRow({
  label,
  caption,
  value,
  tone,
}: {
  label: string
  caption: string
  value: string
  tone: 'default' | 'verified' | 'destructive'
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked — the value is selectable on screen regardless */
    }
  }

  return (
    <div className="flex flex-col gap-1.5 bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xs text-muted-foreground">{label}</span>
          <span className="font-mono text-2xs text-subtle">{caption}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label={`copy ${label}`}
          className="shrink-0 rounded p-1 text-subtle transition-colors hover:text-foreground"
        >
          {copied ? <Check className="size-3 text-verified" /> : <Copy className="size-3" />}
        </button>
      </div>
      <span
        className={cn(
          'font-mono text-xs break-all',
          tone === 'verified' && 'text-verified',
          tone === 'destructive' && 'text-destructive',
          tone === 'default' && 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
}