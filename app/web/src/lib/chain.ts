/**
 * Read-only view of the FLAuditLog contract.
 *
 * Why this module exists: the training payload (round_results.json) is only
 * three fields — (round, accuracy, txHash) — but the contract stores six.
 * See fl_server/server.py:162 against blockchain/contracts/FLAuditLog.sol:11.
 * block number, gas used, timestamp and the logging account were never lost;
 * they were just never in the file the old dashboard read.
 *
 * What this module deliberately does NOT do: verify anything.
 *
 * The stored modelHash is `w3.keccak(text=sha256_hex)` — keccak256 over the
 * *hex text* of a SHA-256 digest, not the digest itself
 * (fl_server/blockchain_logger.py, in log_round). Reproducing that in the
 * browser would mean shipping a keccak implementation and duplicating
 * Python's float formatting, where a single differing digit silently turns a
 * real match into a mismatch. So this file reads and displays; hashing stays
 * on :8088, which runs the same code as the writer.
 *
 * Every function resolves to null instead of throwing when the node is
 * absent, because "Hardhat is not running" is a normal state for a dashboard
 * and must degrade rather than blank the page.
 */

const RPC_URL = '/chain/rpc'
const CONFIG_URL = '/chain/config'

/* Selectors, keccak256 of the signature, first 4 bytes.
   Verified against eth_utils.keccak rather than trusted by inspection. */
const SELECTOR_TOTAL_ROUNDS = '0x8a568299' // totalRounds()
const SELECTOR_ROUNDS = '0x8c65c81f' // rounds(uint256)

let contractAddress: string | null = null
let addressPromise: Promise<string | null> | null = null

async function rpc(
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  })
  if (!response.ok) return null

  const payload = (await response.json()) as { result?: unknown; error?: unknown }
  if (payload.error) return null
  return payload.result ?? null
}

async function resolveAddress(): Promise<string | null> {
  if (contractAddress) return contractAddress
  if (!addressPromise) {
    addressPromise = (async () => {
      try {
        const response = await fetch(CONFIG_URL)
        if (!response.ok) return null
        const body = (await response.json()) as { address?: string }
        contractAddress = body.address ?? null
        return contractAddress
      } catch {
        return null
      }
    })()
  }
  return addressPromise
}

/* ── word decoding ──────────────────────────────────────────────────
   The FLAuditLog struct has SIX fields:
     (roundNumber, accuracy, participants[], modelHash, timestamp, loggedBy)

   Solidity's auto-generated public getter for a struct containing a dynamic
   type (string[]) OMITS that dynamic member from the ABI-encoded response.
   So rounds(uint256) returns FIVE flat 32-byte words — no ABI coder,
   no ethers, no keccak needed in the bundle:

     rounds(uint256) -> (uint256, uint256, bytes32, uint256, address)
                         round   accuracy  hash     ts      loggedBy

   (participants is the one field dropped, being the dynamic string[]) */

function words(hex: string, count: number): string[] | null {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex
  if (body.length !== count * 64) return null
  return Array.from({ length: count }, (_, i) => body.slice(i * 64, i * 64 + 64))
}

function toBigInt(word: string): bigint {
  return BigInt(`0x${word}`)
}

export interface ChainRound {
  roundNumber: number
  /** On-chain accuracy is stored ×1000, so 74300 means 74.3%. */
  accuracyPct: number
  /** keccak256(sha256_hex) — a commitment, not the SHA-256 itself. */
  modelHash: string
  /** Unix seconds. null until the node is reachable. */
  timestamp: number | null
  /** FL server account that logged the round. */
  loggedBy: string | null
}

export interface ChainTx {
  blockNumber: number | null
  gasUsed: number | null
  /** false when the transaction was mined but reverted. */
  succeeded: boolean | null
}

export async function readTotalRounds(signal?: AbortSignal): Promise<number | null> {
  const address = await resolveAddress()
  if (!address) return null
  try {
    const result = await rpc('eth_call', [
      { to: address, data: SELECTOR_TOTAL_ROUNDS },
      'latest',
    ], signal)
    if (typeof result !== 'string') return null
    return Number(toBigInt(result))
  } catch {
    return null
  }
}

export async function readChainRound(
  index: number,
  signal?: AbortSignal,
): Promise<ChainRound | null> {
  const address = await resolveAddress()
  if (!address || !Number.isInteger(index) || index < 0) return null

  // uint256 index, left-padded to 32 bytes
  const arg = index.toString(16).padStart(64, '0')
  try {
    const result = await rpc('eth_call', [
      { to: address, data: SELECTOR_ROUNDS + arg },
      'latest',
    ], signal)
    if (typeof result !== 'string') return null

    const w = words(result, 5)
    if (!w || !w[0] || !w[1] || !w[2] || !w[3] || !w[4]) return null

    return {
      roundNumber: Number(toBigInt(w[0])),
      accuracyPct: Number(toBigInt(w[1])) / 1000,
      modelHash: `0x${w[2]}`,
      timestamp: Number(toBigInt(w[3])),
      loggedBy: `0x${w[4].slice(24)}`,
    }
  } catch {
    return null
  }
}

/**
 * Block number and gas for the transaction that logged a round. Straight JSON
 * from the node — no decoding, and it works even if the contract is not
 * deployed at the configured address.
 */
export async function readChainTx(
  txHash: string,
  signal?: AbortSignal,
): Promise<ChainTx | null> {
  if (!txHash || txHash === '0x0') return null
  try {
    const result = await rpc('eth_getTransactionByHash', [txHash], signal)
    if (typeof result !== 'object' || result === null) return null
    const tx = result as { blockNumber?: string; gas?: string }
    if (!tx.blockNumber) return null

    let gasUsed: number | null = null
    let succeeded: boolean | null = null
    const receipt = await rpc('eth_getTransactionReceipt', [txHash], signal)
    if (typeof receipt === 'object' && receipt !== null) {
      const r = receipt as { gasUsed?: string; status?: string }
      gasUsed = r.gasUsed ? Number(toBigInt(r.gasUsed)) : null
      succeeded = r.status ? toBigInt(r.status) === 1n : null
    }

    return { blockNumber: Number(toBigInt(tx.blockNumber)), gasUsed, succeeded }
  } catch {
    return null
  }
}

/* ── presentation ─────────────────────────────────────────────────── */

export function formatTimestamp(seconds: number | null): string {
  if (!seconds) return '—'
  const d = new Date(seconds * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

export function formatGas(gas: number | null): string {
  if (gas === null) return '—'
  return gas.toLocaleString('en-US')
}

export function shortAddress(address: string | null): string {
  if (!address) return '—'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
