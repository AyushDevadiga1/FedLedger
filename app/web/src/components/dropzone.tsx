import { useCallback, useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'

import { parseWeights } from '@/lib/ledger'
import { cn } from '@/lib/utils'

/**
 * Drop target for a weights file.
 *
 * Scoped deliberately to weights JSON rather than "a model file": the digest
 * the ledger stores is a SHA-256 over the serialised weight array, so a .pkl
 * or .onnx of the same model would not hash to anything and would report a
 * mismatch that looks like tampering but is only a wrong file type. The
 * wording says weights because that is the truth about what gets hashed.
 */
export function WeightsDropzone({
  onWeights,
  className,
}: {
  /** Receives the raw file text so the caller controls parsing and errors. */
  onWeights: (text: string, filename: string) => void
  className?: string
}) {
  const [over, setOver] = useState(false)
  const [reading, setReading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // dragleave fires when moving over child elements, so a depth counter is
  // needed or the highlight flickers on the way in.
  const depth = useRef(0)

  const read = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setReading(true)
      try {
        const text = await file.text()
        onWeights(text, file.name)
      } finally {
        setReading(false)
      }
    },
    [onWeights],
  )

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 overflow-hidden border border-dashed px-4 py-4 transition-colors',
        over
          ? 'border-primary bg-primary/5'
          : 'border-border-strong bg-card',
        reading && 'fedledger-scan',
        className,
      )}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        void read(e.dataTransfer.files[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(e) => {
          void read(e.target.files?.[0])
          // allow re-dropping the same file, which otherwise fires no change
          e.target.value = ''
        }}
      />

      {reading ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
      ) : (
        <FileUp className="size-4 shrink-0 text-subtle" aria-hidden />
      )}

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-foreground">
          {reading ? 'reading…' : 'Drop a weights file, or '}
          {!reading ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              browse
            </button>
          ) : null}
        </span>
        <span className="font-mono text-xs text-subtle">
          JSON array of [coef, intercept] pairs
        </span>
      </div>
    </div>
  )
}

/**
 * Alter one coefficient so the mismatch path can be shown without hand-editing
 * a JSON blob on stage. Returns null when there is nothing numeric to change.
 */
export function tamperWeights(text: string): string | null {
  const parsed = parseWeights(text)
  if (!Array.isArray(parsed)) return null

  const mutated = parsed.map(([coef, intercept]) => [
    // nudge by a magnitude a real substitution would plausibly have
    Number((coef + 0.0001).toFixed(6)),
    intercept,
  ]) as number[][]

  return JSON.stringify(mutated)
}
