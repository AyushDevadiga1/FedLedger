import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))

/**
 * round_results.json and global_weights.json are written by
 * fl_server/server.py into app/, which is one level above the Vite root.
 * Rather than widen publicDir (that would copy verify_server.py and the
 * legacy index.html into dist/), serve just these files in dev. In
 * production the built app reads them from whatever origin the Python
 * launcher serves.
 */
function serveAppJson(): Plugin {
  const files: Record<string, string> = {
    '/round_results.json': 'round_results.json',
    '/global_weights.json': 'global_weights.json',
  }
  return {
    name: 'fedledger:serve-app-json',
    configureServer(server) {
      for (const [route, file] of Object.entries(files)) {
        server.middlewares.use(route, (_req, res) => {
          readFile(`${APP_DIR}/${file}`, 'utf8')
            .then((body) => {
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Cache-Control', 'no-store')
              res.end(body)
            })
            .catch(() => {
              // No file yet is a normal state, not a server fault — the
              // dashboard treats a non-ok response as "not reachable yet".
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(`{"error":"${file} not written yet"}`)
            })
        })
      }
    },
  }
}

/**
 * Read-only proxy to the local Hardhat node.
 *
 * Two reasons this exists rather than the browser calling :8545 directly:
 * Hardhat's HTTP JSON-RPC does not reliably answer preflighted browser
 * requests, and a dev-only proxy keeps the node's origin out of the page.
 *
 * Only these read methods are forwarded. Anything that could mutate chain
 * state is refused outright — this is a dashboard, and the thesis it argues
 * is that the log is append-only.
 */
const READ_ONLY_METHODS = new Set([
  'eth_blockNumber',
  'eth_chainId',
  'eth_call',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
])

const CONTRACT_ADDRESS_FALLBACK = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

function serveChainRead(): Plugin {
  return {
    name: 'fedledger:serve-chain-read',
    configureServer(server) {
      server.middlewares.use('/chain/rpc', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)

        let method = ''
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          method = typeof body?.method === 'string' ? body.method : ''
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end('{"error":"malformed JSON-RPC request"}')
          return
        }

        if (!READ_ONLY_METHODS.has(method)) {
          res.statusCode = 403
          res.setHeader('Content-Type', 'application/json')
          res.end(`{"error":"${method} is not a read-only method"}`)
          return
        }

        try {
          const upstream = await fetch('http://127.0.0.1:8545', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.concat(chunks).toString('utf8'),
          })
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(await upstream.text())
        } catch {
          // Node not running. Not an error the page should have to handle as
          // a failure — it degrades to "no on-chain enrichment".
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end('{"error":"no chain node on :8545"}')
        }
      })

      // Contract address comes from blockchain/contract_config.json so a
      // redeploy is picked up without editing frontend code.
      server.middlewares.use('/chain/config', (_req, res) => {
        readFile(`${APP_DIR}/../blockchain/contract_config.json`, 'utf8')
          .then((body) => {
            const parsed = JSON.parse(body) as { contract_address?: string }
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            res.end(
              JSON.stringify({
                address: parsed.contract_address ?? CONTRACT_ADDRESS_FALLBACK,
              }),
            )
          })
          .catch(() => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ address: CONTRACT_ADDRESS_FALLBACK }))
          })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveAppJson(), serveChainRead()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [APP_DIR],
    },
  },
})
