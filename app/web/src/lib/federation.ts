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

/**
 * How many numbers one node ships per update: the coefficient matrix plus
 * the intercept vector.
 *
 * Multinomial logistic regression stores one coef row per class; binary
 * stores a single row, so the class count collapses to 1 either way. This is
 * the count behind the "n floats, no rows" claim, derived from the active
 * dataset instead of typed in — the old literal 15 was correct only on iris
 * and became wrong the moment the launcher was pointed at breast_cancer
 * (31 floats) or digits (650).
 */
export function parameterCount(meta: DatasetMeta | null): number {
  const features = meta?.num_features ?? 4
  const classes = meta?.num_classes ?? 3
  const coefRows = classes > 2 ? classes : 1
  return coefRows * features + coefRows
}