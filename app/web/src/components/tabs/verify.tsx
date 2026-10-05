import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, FileCode, X } from 'lucide-react'

import {
  EmptyState,
  Eyebrow,
  Panel,
  PanelHead,
  Token,
} from '@/components/primitives'
import { tamperWeights, WeightsDropzone } from '@/components/dropzone'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  parseWeights,
  verifyRound,
  type LedgerRound,
  type VerifyOutcome,
} from '@/lib/ledger'
import {
  downloadTemplate,
  fetchTemplate,
  WEIGHT_TEMPLATES,
} from '@/lib/templates'

export function VerifyTab({
  rounds,
  onVerified,
}: {
  rounds: LedgerRound[]
  onVerified: (round: number) => void
}) {
  // Only rounds that actually logged can be verified, so the picker is
  // built from those rather than from the raw round list.
  const verifiable = useMemo(() => rounds.filter((r) => r.onChain), [rounds])

  const [chainIndex, setChainIndex] = useState('')
  const [weights, setWeights] = useState('')
  const [droppedName, setDroppedName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)

  const parsed = weights.trim() ? parseWeights(weights) : null
  const parseError = parsed && !Array.isArray(parsed) ? parsed.error : null

  const target = verifiable.find((r) => r.chainIndex === Number(chainIndex))

  const run = async () => {
    if (!parsed || !Array.isArray(parsed)) return
    const index = Number(chainIndex)
    if (!Number.isInteger(index)) return

    setBusy(true)
    setOutcome(null)
    try {
      const result = await verifyRound(index, parsed)
      setOutcome(result)
      if (result.status === 'match' && target) onVerified(target.round)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2">
      {/* ── input ── */}
      <Panel className="border-r-0">
        <PanelHead
          title="Verify a round"
          meta="POST :8088/verify"
        />

        {verifiable.length === 0 ? (
          <EmptyState title="nothing sealed to verify against">
            Verification compares a recomputed hash against what is already
            recorded on-chain. No round has been sealed yet.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-5 px-5 py-5">
            <WeightsDropzone
              onWeights={(text, filename) => {
                setWeights(text)
                setDroppedName(filename)
                setOutcome(null)
                // A single sealed round is the common case, so a dropped file
                // can target it without the user picking an index by hand.
                if (verifiable.length === 1 && verifiable[0]) {
                  setChainIndex(String(verifiable[0].chainIndex))
                }
              }}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="chain-index">chain index</Label>
              <Input
                id="chain-index"
                inputMode="numeric"
                placeholder={String(verifiable[0]?.chainIndex ?? 0)}
                value={chainIndex}
                onChange={(e) => {
                  setChainIndex(e.target.value)
                  setOutcome(null)
                }}
                className="max-w-32 font-mono"
              />
              <p className="text-xs text-subtle">
                This is the index into the chain, not the round number.
                {target ? (
                  <>
                    {' '}
                    Index {target.chainIndex} is{' '}
                    <span className="font-mono text-muted-foreground">
                      round {target.round}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    {' '}
                    It corresponds to{' '}
                    {verifiable
                      .map(
                        (r) =>
                          `${r.chainIndex} = round ${r.round}`,
                      )
                      .join(', ')}
                    .
                  </>
                )}
              </p>
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
                <span className="text-2xs text-muted-foreground">
                  Demo files
                </span>
                {WEIGHT_TEMPLATES.map((t) => (
                  <span key={t.url} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const text = await fetchTemplate(t.url)
                        if (typeof text !== 'string') {
                          setOutcome({ status: 'error', chainIndex: Number(chainIndex) || 0, message: text.error })
                          return
                        }
                        // Strip the _comment keys: they document the format for
                        // a human reading the file, but parseWeights rejects a
                        // 3-element array.
                        const bare = text.trim().replace(/^_\w+".*$/gm, '').replace(/,\s*([\]}])/g, '$1')
                        setWeights(bare)
                        setDroppedName(t.name)
                        setOutcome(null)
                        if (!chainIndex && verifiable.length > 0) {
                          setChainIndex(String(verifiable[0]!.chainIndex))
                        }
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
                  — shows the two shapes a coef matrix takes
                </span>
              </div>
              <Textarea
                id="weights"
                spellCheck={false}
                placeholder={'[[0.0412, -0.1188], [-0.3310, 0.4455]]'}
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
                  loaded <span className="font-mono text-muted-foreground">{droppedName}</span>
                  {' · '}
                  {parsed && !('error' in parsed)
                    ? `coef matrix ${parsed[0].length}×${parsed[0][0]?.length ?? 0} + ${parsed[1].length} intercepts`
                    : ''}
                </p>
              ) : (
                <p className="text-xs text-subtle">
                  Recompute this locally with FedAvg over the three node
                  updates. Nothing in the backend exposes the stored weights
                  yet, so it has to be dropped or pasted in.
                </p>
              )}
            </div>

            <Alert className="border-primary/40 bg-primary/5 text-foreground [&>svg]:text-primary">
              <AlertTriangle />
              <AlertTitle>Demo files will not match, and that is correct</AlertTitle>
              <AlertDescription>
                The chain stores a SHA-256 of the <em>real</em> aggregated
                weights. The demo files above are plausible but invented, so
                Compare hashes reports a mismatch — which is the honest result
                and shows verification is genuinely running.
                <span className="mt-2 block text-muted-foreground">
                  Also note the verifier hashes the serialised JSON, so{' '}
                  <span className="font-mono">0.0</span> and{' '}
                  <span className="font-mono">0</span> produce different
                  digests. A genuine match reports a mismatch if the weights
                  were normalised on the way in.
                </span>
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={run}
                disabled={
                  busy ||
                  parseError !== null ||
                  !Array.isArray(parsed) ||
                  chainIndex.trim() === ''
                }
              >
                {busy ? 'checking…' : 'Compare hashes'}
              </Button>

              {/* Demonstrates the mismatch path without hand-editing JSON. */}
              <Button
                variant="outline"
                disabled={busy || !Array.isArray(parsed) || chainIndex.trim() === ''}
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
          meta={target ? `round ${target.round}` : undefined}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-5">
          {outcome === null ? (
            <EmptyState title="no comparison run yet">
              Pick a chain index, paste the recomputed weights, and compare.
            </EmptyState>
          ) : outcome.status === 'error' ? (
            <div className="flex items-start gap-3 border border-destructive bg-destructive/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <span className="font-mono text-sm text-destructive">
                  could not verify
                </span>
                <span className="text-sm text-muted-foreground">
                  {outcome.message}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div
                className={
                  outcome.status === 'match'
                    ? 'flex items-start gap-3 border border-verified bg-verified/10 px-4 py-3'
                    : 'flex items-start gap-3 border border-destructive bg-destructive/10 px-4 py-3'
                }
              >
                {outcome.status === 'match' ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-verified" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="flex flex-col gap-1">
                  <span
                    className={
                      outcome.status === 'match'
                        ? 'font-mono text-sm text-verified'
                        : 'font-mono text-sm text-destructive'
                    }
                  >
                    {outcome.status === 'match' ? 'match' : 'mismatch'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {outcome.status === 'match'
                      ? 'The weights you pasted hash to exactly what is recorded on-chain for this round, so the logged model is the one you computed.'
                      : 'These weights do not hash to the recorded value. Either the wrong round was submitted, the weights are not the FedAvg result, or the record was altered.'}
                  </span>
                </div>
              </div>

              {/* ── side by side, the actual evidence ── */}
              <div className="grid grid-cols-2 gap-px border border-border bg-border">
                <div className="flex flex-col gap-1.5 bg-card px-3 py-3">
                  <Eyebrow>on-chain · model hash</Eyebrow>
                  <span className="font-mono text-xs break-all text-muted-foreground">
                    read from FLAuditLog at index {outcome.chainIndex}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 bg-card px-3 py-3">
                  <Eyebrow>recomputed · from pasted weights</Eyebrow>
                  <span className="font-mono text-xs break-all text-muted-foreground">
                    sha256 of the serialised weight array
                  </span>
                </div>
              </div>

              <p className="text-xs text-subtle">
                The transaction hash on{' '}
                <span className="font-mono">
                  {target ? `${target.round}` : 'this round'}
                </span>{' '}
                is a different value from the model hash and is not what
                gets compared here.
              </p>
            </>
          )}

          {verifiable.length > 0 ? (
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Eyebrow>sealed rounds</Eyebrow>
              {verifiable.map((r) => (
                <Token key={r.round} tone="accent">
                  {r.chainIndex} → round {r.round}
                </Token>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}
