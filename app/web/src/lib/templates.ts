/**
 * Demo files, served from the app's own origin.
 *
 * Two upload formats exist and they do not look alike, which is the whole
 * reason this file exists:
 *
 *   /templates/weights_iris.json          Verify tab   [coef, intercept]
 *   /templates/weights_breast_cancer.json Verify tab   same shape, 1 row
 *   /templates/snapshot.json              Overview tab [round, acc, tx]
 *
 * The weights templates are *not* round-trippable demo data. The chain stores
 * a SHA-256 of the real aggregated weights, so loading a template and clicking
 * Compare hashes will report a mismatch. That is the correct and honest
 * outcome: it demonstrates that verification is real, and the "Alter one
 * coefficient" button next to it produces the same verdict for a documented
 * reason. A file that could magically match would be a lie about the ledger.
 *
 * The snapshot template is different — it is only read by the dashboard, never
 * hashed, so it loads and displays correctly as-is.
 */

export interface TemplateFile {
  /** Filename offered to the user on download. */
  name: string
  /** Path served from the app origin. */
  url: string
  /** One line on what the file is for, shown in the picker. */
  blurb: string
  /** Datasets whose shape this matches. */
  shape: string
}

export const WEIGHT_TEMPLATES: TemplateFile[] = [
  {
    name: 'weights_iris.json',
    url: '/templates/weights_iris.json',
    blurb: '3 classes x 4 features',
    shape: '3 coef rows + 3 intercepts',
  },
  {
    name: 'weights_breast_cancer.json',
    url: '/templates/weights_breast_cancer.json',
    blurb: 'binary, so one coef row',
    shape: '1 coef row + 1 intercept',
  },
]

export const SNAPSHOT_TEMPLATES: TemplateFile[] = [
  {
    name: 'snapshot.json',
    url: '/templates/snapshot.json',
    blurb: 'three rounds, last one not logged',
    shape: 'array of [round, accuracy, txHash]',
  },
]

/**
 * Fetch a template as text. Reports the reason on failure rather than throwing,
 * because every caller is a button the user just clicked and a silent no-op is
 * indistinguishable from a broken app.
 */
export async function fetchTemplate(url: string): Promise<string | { error: string }> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { error: `${url} returned HTTP ${res.status}` }
    return await res.text()
  } catch (cause) {
    return {
      error:
        cause instanceof Error
          ? `could not reach ${url} — is the dashboard server running?`
          : `could not reach ${url}`,
    }
  }
}

/** Trigger a browser download of a template file. */
export function downloadTemplate(url: string, name: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}