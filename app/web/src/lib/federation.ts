/**
 * The federation as it is configured.
 *
 * Three organisations, matching the three-way partition
 * `data/generate_partitions.py` makes. That script folds rows evenly across
 * the nodes, so the per-node row count is derived from the active dataset
 * rather than hardcoded — the previous literal 40/50/60 never matched what
 * the script produced (an even 50/50/50 on iris, and a different split again
 * on breast_cancer or digits).
 *
 * ORGANISATIONS is the fallback used before `dataset_meta.json` arrives, and
 * by tests. `organisationRows` is the authority once metadata has loaded.
 */
import type { DatasetMeta } from './ledger'

export interface Organisation {
  id: string
  name: string
  /** Rows held locally and never transmitted. */
  rows: number
}

/** Node identity is fixed: the launcher always starts three. */
export const ORGANISATIONS: Organisation[] = [
  { id: 'org-a', name: 'OrgA', rows: 50 },
  { id: 'org-b', name: 'OrgB', rows: 50 },
  { id: 'org-c', name: 'OrgC', rows: 50 },
]

/**
 * Per-node row counts for the given dataset.
 *
 * Uses the same even fold as generate_partitions.py: the first
 * `total % n` nodes take one extra row. This is the allocation the numbers
 * are read from, not an independent claim about it.
 */
export function organisationRows(meta: DatasetMeta | null): number[] {
  const total = meta?.total_samples ?? 150
  const n = ORGANISATIONS.length
  const base = Math.floor(total / n)
  const remainder = total - base * n
  return ORGANISATIONS.map((_, i) => base + (i < remainder ? 1 : 0))
}

export function TOTAL_LOCAL_ROWS(rows: number[] = organisationRows(null)): number {
  return rows.reduce((sum, n) => sum + n, 0)
}