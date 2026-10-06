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

/**
 * Genesis block hash — the chain's identity.
 *
 * This is how Ethereum decides whether two nodes are talking about the same
 * chain, and the dashboard needs the same guarantee for a narrower reason: a
 * chain index is only meaningful relative to one specific chain. Restart
 * Hardhat or redeploy FLAuditLog and `rounds[0]` is a different record wearing
 * the same index, so a verdict fetched before the restart would be silently
 * compared against the wrong record afterwards. Storing the genesis hash
 * makes that detectable instead of invisible.
 */
export interface ChainIdentity {
  /** null when the node is unreachable. */
  genesis: string | null
  /** BigInt hex string, e.g. '0x7a69'. */
  chainId: string | null
  /** Current head block number. */
  headBlock: number | null
  /** Rounds the contract currently holds. */
  totalRounds: number | null
  /** Null when the contract is not deployed at the configured address. */
  contractAddress: string | null
}

/* ── genesis / chain identity ──────────────────────────────────────── */

let genesisHash: string | null = null
let genesisRequested = false

/**
 * Fetch the genesis hash once and remember it.
 *
 * Block 0 never changes, so this is cached for the session the same way the
 * contract address is. It is fetched opportunistically rather than awaited,
 * because identity is context for a verdict rather than part of it — a
 * verdict is still correct without it, just less well qualified.
 */
function requestGenesis(signal?: AbortSignal): void {
  if (genesisRequested) return
  genesisRequested = true
  void rpc('eth_getBlockByNumber', ['0x0', false], signal)
    .then((result) => {
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const hash = (result as { hash?: unknown }).hash
        if (typeof hash === 'string') genesisHash = hash
      }
    })
    .catch(() => {
      /* identity is advisory; leave it null */
    })
}

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

/**
 * Decode a 32-byte word or an RPC hex quantity.
 *
 * Both shapes arrive here and they are NOT interchangeable: `words()` yields
 * bare 64-character slices with no prefix, while eth_call/eth_blockNumber
 * return values that already start with "0x". Prepending unconditionally made
 * `BigInt('0x0x86')`, which throws -- and since every caller wrapped this in
 * a try/catch that returned null, readTotalRounds silently answered "unknown"
 * for every chain instead of reporting a bug.
 */
function toBigInt(word: string): bigint {
  return BigInt(word.startsWith('0x') ? word : `0x${word}`)
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
  requestGenesis(signal)
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

/**
 * Read the chain's identity and head in one call.
 *
 * `resolveAddress` returning null means the contract was never deployed at
 * the configured address, which is a different situation from the node being
 * down -- the first means there is nothing to verify against, the second
 * means the answer is temporarily unavailable. They are reported separately so
 * the UI never says "not found" when it means "not running".
 */
export async function readChainIdentity(signal?: AbortSignal): Promise<ChainIdentity> {
  requestGenesis(signal)
  const address = await resolveAddress()
  const [head, chainId, total] = await Promise.all([
    rpc('eth_blockNumber', [], signal),
    rpc('eth_chainId', [], signal),
    address
      ? rpc('eth_call', [{ to: address, data: SELECTOR_TOTAL_ROUNDS }, 'latest'], signal)
      : Promise.resolve(null),
  ])

  const toNum = (v: unknown): number | null => {
    if (typeof v !== 'string') return null
    try {
      return Number(toBigInt(v))
    } catch {
      return null
    }
  }

  return {
    genesis: genesisHash,
    chainId: typeof chainId === 'string' ? chainId : null,
    headBlock: toNum(head),
    totalRounds: toNum(total),
    contractAddress: address,
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

/** `0x2f28949a…1533` — enough to compare by eye, short enough to fit. */
export function shortDigest(value: string | null): string {
  if (!value) return '—'
  return `${value.slice(0, 10)}…${value.slice(-6)}`
}

/**
 * Confirmations between a transaction's block and the head.
 *
 * Ethereum refuses to call a result final until it sits under enough blocks,
 * because a longer competing chain can still replace it. Hardhat auto-mines
 * into a single-node chain, so there is no competing chain here and the
 * number is honest but not load-bearing — the UI says so rather than implying
 * mainnet guarantees.
 */
export function confirmations(blockNumber: number | null, headBlock: number | null): number | null {
  if (blockNumber === null || headBlock === null) return null
  return Math.max(0, headBlock - blockNumber + 1)
}
