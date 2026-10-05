import { useEffect, useState } from 'react'

import { fetchDatasetMeta, type DatasetMeta } from '@/lib/ledger'

/**
 * The active dataset's metadata, shared by every tab that states a number
 * derived from it — row counts on the federation graph, the local-row hint on
 * Overview, the parameter count in a claim.
 *
 * Lives here rather than in each tab because the previous copy of this hook
 * sat inside Overview, so the Federation graph fell back to the hardcoded 50
 * rows per organisation and told the user "50 rows · local" while the run was
 * actually on breast_cancer or digits. One fetch, one authority.
 */
export function useDatasetMeta(): DatasetMeta | null {
  const [meta, setMeta] = useState<DatasetMeta | null>(null)

  useEffect(() => {
    let alive = true
    void fetchDatasetMeta().then((data) => {
      if (alive) setMeta(data)
    })
    return () => {
      alive = false
    }
  }, [])

  return meta
}
