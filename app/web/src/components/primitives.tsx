import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { shortHash } from '@/lib/ledger'

/* ── Panel ────────────────────────────────────────────────────────────
   One surface primitive for every region. Hairline border, no shadow —
   the palette has no shadow token and adding one is how this look turns
   generic fast. */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col border border-border bg-card',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  )
}

export function PanelHead({
  title,
  meta,
  actions,
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="flex items-center gap-3">
        {meta ? (
          <span className="font-mono text-xs text-subtle">{meta}</span>
        ) : null}
        {actions}
      </div>
    </header>
  )
}

/* ── Stat tile ────────────────────────────────────────────────────────
   Value leads, label follows. The label sits above in the old dashboard
   which made every tile read as a caption; putting the number first makes
   the row scannable as a single figure. The tone also paints a 2px top
   bar plus a faint wash (fedledger-tone-*), so a row of tiles reads as
   colour and number together rather than number alone. */
export function StatTile({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'accent' | 'verified' | 'destructive'
  hint?: string
}) {
  return (
    <div
      className={cn(
        'fedledger-tone flex min-w-0 flex-col gap-1 bg-card px-4 py-3',
        tone === 'accent' && 'fedledger-tone-accent',
        tone === 'verified' && 'fedledger-tone-verified',
        tone === 'destructive' && 'fedledger-tone-destructive',
        tone === 'default' && 'fedledger-tone-neutral',
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono text-2xl leading-none font-semibold',
          tone === 'accent' && 'text-primary',
          tone === 'verified' && 'text-verified',
          tone === 'destructive' && 'text-destructive',
          tone === 'default' && 'text-foreground',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </div>
  )
}

/* ── Status pill ───────────────────────────────────────────────────────
   `tone` is explicit and never inferred. A pill only goes green when
   something was actually checked — the previous dashboard shipped a
   `.live` class driven by a fetch that could not fail. */
export function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: 'ok' | 'off' | 'idle'
}) {
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          tone === 'ok' && 'bg-verified',
          tone === 'off' && 'bg-destructive',
          tone === 'idle' && 'bg-border-strong',
        )}
      />
      {label}
    </span>
  )
}

/* ── Hash ──────────────────────────────────────────────────────────────
   Full value on hover, truncated by default, copy affordance on focus as
   well as hover so it is reachable by keyboard. */
export function Hash({
  value,
  onChain,
  lead = 6,
  tail = 4,
}: {
  value: string
  onChain: boolean
  lead?: number
  tail?: number
}) {
  const [copied, setCopied] = useState(false)

  if (!onChain) {
    return (
      <span className="font-mono text-xs text-subtle" title="not logged on-chain">
        —
      </span>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked — the hash is still selectable and shown on hover */
    }
  }

  return (
    <span className="group/hash inline-flex items-center gap-1">
      <span
        className="font-mono text-xs text-muted-foreground transition-colors group-hover/hash:text-foreground"
        title={value}
      >
        {shortHash(value, lead, tail)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'copied' : 'copy hash'}
        className="rounded p-1 text-subtle opacity-0 transition-opacity group-hover/hash:opacity-100 focus-visible:opacity-100 hover:text-foreground data-[copied=true]:opacity-100"
        data-copied={copied}
      >
        {copied ? (
          <Check className="size-3 text-verified" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </span>
  )
}

/* ── Badge ────────────────────────────────────────────────────────────
   Local, not the shadcn Badge: this one is a status token and must never
   accept a decorative variant. */
export function Token({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'verified' | 'destructive'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap',
        tone === 'neutral' && 'border-border-strong text-subtle',
        tone === 'accent' && 'border-primary/40 bg-primary/10 text-primary',
        tone === 'verified' &&
          'border-verified/40 bg-verified/10 text-verified',
        tone === 'destructive' &&
          'border-destructive/40 bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </span>
  )
}

/* ── Empty state ───────────────────────────────────────────────────────
   Always says what to do next, and distinguishes "nothing yet" from
   "cannot reach the source" — those need different actions. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="font-mono text-sm text-muted-foreground">{title}</p>
      {children ? (
        <div className="max-w-sm text-sm text-subtle">{children}</div>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}

/* ── Figure label ───────────────────────────────────────────────────────
   Section eyebrow. Used sparingly — a label above every block is one of
   the documented tells of a generated page. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-xs tracking-[0.14em] text-subtle uppercase">
      {children}
    </span>
  )
}
