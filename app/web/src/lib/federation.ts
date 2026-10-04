/**
 * The federation as it is configured.
 *
 * Three organisations, matching the three-way partition the launcher makes
 * (fl_client holds a 40/50/60 split of the 150-row dataset). Sourced from
 * the code rather than hardcoded per component so the ribbon and the graph
 * cannot disagree about how many nodes there are.
 */
export interface Organisation {
  id: string
  name: string
  /** Rows held locally and never transmitted. */
  rows: number
}

export const ORGANISATIONS: Organisation[] = [
  { id: 'org-a', name: 'OrgA', rows: 40 },
  { id: 'org-b', name: 'OrgB', rows: 50 },
  { id: 'org-c', name: 'OrgC', rows: 60 },
]

export const TOTAL_LOCAL_ROWS = ORGANISATIONS.reduce((sum, o) => sum + o.rows, 0)
