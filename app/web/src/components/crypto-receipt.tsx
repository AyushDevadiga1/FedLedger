import { Blocks, Copy, Check, Fuel, Loader2, Radio } from 'lucide-react'
import { useState } from 'react'

import {
  formatGas,
  formatTimestamp,
  shortAddress,
} from '@/lib/chain'
import type { RoundReceipt } from '@/hooks/use-round-receipt'
import { Eyebrow, Token } from '@/components/primitives'

/**
 * The blockchain receipt for one round.
 *
 * Every value below is read from the node, never derived from the payload and
 * never invented. Fields the contract cannot supply render as an explicit
 * "not recorded" rather than a plausible-looking placeholder — an auditor
 * checking this screen must be able to trust that a blank means absent, not
 * unstyled.
 */
export function CryptoReceipt({
  receipt,
  txHash,
  roundNumber,
}: {
  receipt: RoundReceipt
  txHash: string
  roundNumber: number
}) {
  const { chain, tx, state } = receipt

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Blocks className="size-3.5 text-subtle" aria-hidden />
          <Eyebrow>Chain receipt</Eyebrow>
        </div>
        <ChainStatus state={state} />
      </div>

      <div className="flex min-h-0 flex-col gap-px overflow-y-auto">
        {state === 'loading' ? (
          <div className="flex items-center gap-2 px-5 py-6 font-mono text-xs text-subtle">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            querying node
          </div>
        ) : null}

        {state === 'offline' ? (
          <p className="px-5 py-6 text-sm text-subtle">
            No chain node answering on{' '}
            <code className="font-mono text-muted-foreground">127.0.0.1:8545</code>.
            Start it with <code className="font-mono text-muted-foreground">npx hardhat node</code>{' '}
            to read block numbers, gas and timestamps. The training data below is
            unaffected.
          </p>
        ) : null}

        {state === 'missing' ? (
          <p className="px-5 py-6 text-sm text-subtle">
            The node is up but holds no round at chain index for round {roundNumber}.
          </p>
        ) : null}

        {state === 'ready' && chain ? (
          <>
            <Row label="Block number" value={tx?.blockNumber ?? null} mono />
            <Row
              label="Gas used"
              value={tx?.gasUsed !== null && tx?.gasUsed !== undefined ? formatGas(tx.gasUsed) : null}
              mono
              icon={tx?.gasUsed ? <Fuel className="size-3" aria-hidden /> : undefined}
            />
            <Row label="Logged at" value={formatTimestamp(chain.timestamp)} mono />
            <Row label="Logging account" value={shortAddress(chain.loggedBy)} mono />
            <Row
              label="Participants"
              value={null}
              absent="excluded from the public getter (string[])"
            />
            <Row label="Round" value={chain.roundNumber} mono />
            <Row
              label="Accuracy on chain"
              value={`${chain.accuracyPct.toFixed(1)}%`}
              mono
              hint="stored ×1000 by the logger"
            />
            <div className="flex flex-col gap-1.5 px-5 py-3">
              <span className="text-xs text-muted-foreground">Model hash</span>
              <HashBlock value={chain.modelHash} />
              <p className="text-xs text-subtle">
                keccak256 over the hex text of the model&apos;s SHA-256 — a commitment,
                so the digest itself is never published on chain.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 px-5 py-3">
              <span className="text-xs text-muted-foreground">Transaction</span>
              <HashBlock value={txHash} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ChainStatus({ state }: { state: RoundReceipt['state'] }) {
  if (state === 'ready') {
    return (
      <Token tone="verified">
        <Radio className="mr-1 size-3" aria-hidden />
        confirmed
      </Token>
    )
  }
  if (state === 'loading') {
    return <Token tone="neutral">reading</Token>
  }
  return <Token tone="neutral">{state}</Token>
}

function Row({
  label,
  value,
  mono = false,
  hint,
  icon,
  absent,
}: {
  label: string
  value: string | number | null
  mono?: boolean
  hint?: string
  icon?: React.ReactNode
  /** Explanation shown when the value cannot exist, rather than a dash. */
  absent?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right">
        {icon}
        {value === null ? (
          <span
            className="font-mono text-xs text-subtle"
            title={absent}
          >
            {absent ? 'not recorded' : '—'}
          </span>
        ) : (
          <span className={mono ? 'font-mono text-xs text-foreground' : 'text-sm text-foreground'}>
            {value}
          </span>
        )}
      </span>
      {hint && value !== null ? (
        <span className="shrink-0 text-xs text-subtle">{hint}</span>
      ) : null}
    </div>
  )
}

function HashBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked; the value is selectable text */
    }
  }

  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 break-all border border-border bg-muted px-2 py-1.5 font-mono text-xs break-all text-muted-foreground">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'copied' : 'copy hash'}
        className="shrink-0 border border-border p-1.5 text-subtle transition-colors hover:border-border-strong hover:text-foreground"
      >
        {copied ? <Check className="size-3 text-verified" /> : <Copy className="size-3" />}
      </button>
    </div>
  )
}
