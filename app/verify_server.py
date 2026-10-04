"""
verify_server.py
Tiny HTTP server on port 8088.
The dashboard JS POSTs weights here when a user clicks "verify hash".

Run: python app/verify_server.py

Imports are package-absolute like the rest of the project. The previous
sys.path.insert of fl_server/ was papering over a bare `from
blockchain_logger import ...`, which then had to coexist with the
`fl_server.fedavg` import inside that module.

Fixes applied
-------------
* BlockchainLogger is now created once per server lifetime (in start()),
  not once per request.  Every request was opening two JSON files and a
  new Web3 HTTP connection, making concurrent verify clicks slow.
* Switched to ThreadingHTTPServer so concurrent POSTs no longer stall
  each other while waiting for the Ethereum node.
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlparse, parse_qs

import numpy as np

from fl_server.blockchain_logger import BlockchainLogger

# ── module-level singleton ─────────────────────────────────────────────
# Initialised once inside start() and then shared across all request threads.
# The Lock guards the initial construction only; after that it is read-only.
_logger: BlockchainLogger | None = None
_logger_lock = Lock()


def _get_logger() -> BlockchainLogger:
    global _logger
    with _logger_lock:
        if _logger is None:
            _logger = BlockchainLogger()
        return _logger


class VerifyHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # silence default access log

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, payload, status):
        body_out = json.dumps(payload).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body_out))
        self.end_headers()
        self.wfile.write(body_out)

    def do_POST(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)

        if parsed.path != '/verify':
            self._json({'match': False, 'error': 'not found'}, 404)
            return

        try:
            round_idx = int(qs.get('round', ['0'])[0])
        except (TypeError, ValueError):
            # The dashboard only ever sends an integer, but a hand-typed
            # query string should not take the server down.
            self._json({'match': False, 'error': 'round must be an integer'}, 400)
            return

        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            weights_raw = json.loads(body).get('weights', [])
        except Exception as e:
            self._json({'match': False, 'error': f'malformed request body: {e}'}, 400)
            return

        try:
            weights = [np.array(w) for w in weights_raw]
            logger  = _get_logger()          # shared singleton, not a new instance
            match   = logger.verify_round(round_idx, weights)
            self._json({'match': match}, 200)
        except Exception as e:
            # verify_round raises when the chain node is unreachable, which is
            # a different situation from a hash mismatch and is reported as an
            # error so the UI does not present it as tampering.
            self._json({'match': False, 'error': str(e)}, 500)


def start(port=8088):
    # Warm up the singleton before accepting connections so the first request
    # doesn't bear the file-open + Web3 handshake latency.
    try:
        _get_logger()
        print('[verify_server] blockchain logger ready')
    except Exception as e:
        print(f'[verify_server] WARNING: could not connect to blockchain: {e}')
        print('[verify_server] verify requests will return errors until the node is up')

    server = ThreadingHTTPServer(('127.0.0.1', port), VerifyHandler)
    print(f'[verify_server] listening on http://127.0.0.1:{port}')
    server.serve_forever()


if __name__ == '__main__':
    start()
