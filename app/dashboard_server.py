"""
dashboard_server.py
Serves the built FedLedger dashboard over HTTP on port 5173.

Run: python app/dashboard_server.py

Why this exists
---------------
The launcher used to open app/index.html with file://. A file:// page cannot
fetch(), so the dashboard had no data. The Vite dev server papered over this
with two dev-only middlewares, and this module is their production equivalent:

  GET  /                    -> app/web/dist/index.html
  GET  /assets/*            -> built JS/CSS bundles
  GET  /round_results.json  -> the file fl_server/server.py writes
  POST /chain/rpc           -> read-only proxy to the Hardhat node on :8545
  GET  /chain/config        -> contract address from contract_config.json

The proxy allowlists read methods only. A dashboard that argues the log is
append-only should not ship a path that can write to the chain.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
APP    = ROOT / 'app'
DIST   = APP / 'web' / 'dist'
CHAIN  = ROOT / 'blockchain'
RPC_URL = 'http://127.0.0.1:8545'

RESULTS_PATH = APP / 'round_results.json'
CONTRACT_CONFIG = CHAIN / 'contract_config.json'
DATASET_META = ROOT / 'data' / 'dataset_meta.json'

# eth_call is included because every getter used here is a `view` function.
# Nothing that can change state is forwarded.
#
# eth_getBlockByNumber is here for the genesis hash only. A chain index is
# meaningless without knowing WHICH chain it belongs to: restart the Hardhat
# node or redeploy the contract and index 0 is a different record with the
# same index. Genesis hash is how Ethereum itself identifies a chain, so
# reading it is what lets the dashboard refuse to compare across two of them.
# Block bodies cannot be mutated by a caller, so this stays read-only.
READ_ONLY_METHODS = frozenset({
    'eth_blockNumber',
    'eth_chainId',
    'eth_call',
    'eth_getBlockByNumber',
    'eth_getTransactionByHash',
    'eth_getTransactionReceipt',
})

CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
}

# A build is required. Failing loudly beats serving a blank page in a viva.
if not (DIST / 'index.html').exists():
    raise SystemExit(
        f'No build found at {DIST}.\n'
        'Run:  cd app/web && npm install && npm run build'
    )


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = 'FedLedger'

    def log_message(self, format, *args):
        pass  # the launcher's console is the useful log, not per-request lines

    # ── helpers ──

    def _cors(self):
        # The verify API lives on :8088, so the page is cross-origin from it.
        self.send_header('Access-Control-Allow-Origin', '*')

    def _send(self, body: bytes, content_type: str, status: int = 200, cache: str = 'no-store'):
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', len(body))
        self.send_header('Cache-Control', cache)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _json(self, payload, status: int = 200):
        self._send(json.dumps(payload).encode(), 'application/json', status)

    # ── routes ──

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split('?', 1)[0].split('#', 1)[0]

        if path == '/round_results.json':
            return self._serve_results()
        if path == '/chain/config':
            return self._serve_contract_config()
        if path == '/dataset_meta.json':
            return self._serve_dataset_meta()
        return self._serve_static(path)

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path != '/chain/rpc':
            return self._json({'error': 'not found'}, 404)
        return self._proxy_rpc()

    # ── handlers ──

    def _serve_results(self):
        # Absent until the first round completes. A 404 here is a normal
        # state, and the dashboard distinguishes it from an unreachable feed.
        try:
            body = RESULTS_PATH.read_bytes()
        except FileNotFoundError:
            return self._json({'error': 'round_results.json not written yet'}, 404)
        self._send(body, 'application/json')

    def _serve_contract_config(self):
        try:
            config = json.loads(CONTRACT_CONFIG.read_text(encoding='utf-8'))
            address = config.get('contract_address')
        except Exception:
            address = None
        if not address:
            return self._json({'error': 'contract_config.json not written yet — deploy the contract'}, 404)
        self._json({'address': address})

    def _serve_dataset_meta(self):
        try:
            body = DATASET_META.read_bytes()
        except FileNotFoundError:
            # Return a sensible default so the UI always has something to show
            # even on the very first run before generate_partitions.py is called.
            body = json.dumps({
                'name': 'iris',
                'description': '150 samples, 4 features, 3 classes',
                'total_samples': 150,
                'num_features': 4,
                'num_classes': 3,
            }).encode()
        self._send(body, 'application/json')

    def _proxy_rpc(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length) if length else b''

        try:
            payload = json.loads(raw or b'{}')
        except Exception:
            return self._json({'error': 'malformed JSON-RPC request'}, 400)

        method = payload.get('method', '')
        if method not in READ_ONLY_METHODS:
            return self._json({'error': f'{method} is not a read-only method'}, 403)

        request = urllib.request.Request(
            RPC_URL,
            data=raw,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=6) as upstream:
                self._send(upstream.read(), 'application/json')
        except urllib.error.HTTPError as e:
            self._json({'error': f'node returned {e.code}'}, 502)
        except Exception:
            # Node not running. The page degrades to the training feed alone
            # rather than treating this as a fault.
            self._json({'error': 'no chain node on :8545'}, 503)

    def _serve_static(self, path: str):
        if path in ('/', ''):
            target = DIST / 'index.html'
        else:
            # Resolve then confirm containment: without this, a crafted path
            # like /../../verify_server.py escapes the build directory.
            candidate = (DIST / path.lstrip('/')).resolve()
            try:
                candidate.relative_to(DIST.resolve())
            except ValueError:
                return self._json({'error': 'forbidden'}, 403)
            target = candidate

        if not target.is_file():
            # Single-page app: unknown paths fall back to the shell so client
            # routing works on a hard refresh.
            target = DIST / 'index.html'
            if not target.is_file():
                return self._json({'error': 'not found'}, 404)

        content_type = CONTENT_TYPES.get(target.suffix.lower(), 'application/octet-stream')
        # Hashed asset filenames are safe to cache; the shell is not.
        cache = 'public, max-age=31536000, immutable' if '/assets/' in path.replace('\\', '/') else 'no-store'
        self._send(target.read_bytes(), content_type, cache=cache)


def start(port: int = 5173):
    server = ThreadingHTTPServer(('127.0.0.1', port), DashboardHandler)
    print(f'[dashboard] serving {DIST} on http://127.0.0.1:{port}')
    server.serve_forever()


if __name__ == '__main__':
    # Importable as `from app.dashboard_server import start` too; app/ has no
    # __init__.py, so this is run as a plain script with the repo root as cwd.
    start(port=int(os.environ.get('FEDLEDGER_DASHBOARD_PORT', 5173)))
