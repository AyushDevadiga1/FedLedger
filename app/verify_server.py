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
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlparse, parse_qs
from pathlib import Path

# Run as `python app/verify_server.py` (as the README documents) the repo
# root is not importable and `from fl_server...` fails. The launcher already
# exports PYTHONPATH; this makes the standalone command work too.
if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# blockchain_logger prints ✅/❌ after every verify. On Windows, a redirected
# stdout defaults to cp1252, which cannot encode those characters: the print
# raises UnicodeEncodeError *inside* verify_round, and the handler turned it
# into HTTP 500 for what was actually a completed comparison.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

import numpy as np

from fl_server.blockchain_logger import BlockchainLogger, RoundIndexOutOfBounds

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

    def _error(self, message, status, code):
        """
        Every failure carries a machine-readable `code` alongside the prose.

        The dashboard used to render `HTTP 500` for everything, which threw
        away the one distinction that matters here: a request for a round
        that does not exist is a 404, not a server fault, and must never be
        shown as a possible tampering signal.
        """
        self._json({'match': False, 'error': message, 'code': code}, status)

    def do_POST(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)

        if parsed.path != '/verify':
            self._error('not found', 404, 'not_found')
            return

        try:
            round_idx = int(qs.get('round', ['0'])[0])
        except (TypeError, ValueError):
            # The dashboard only ever sends an integer, but a hand-typed
            # query string should not take the server down.
            self._error('round must be an integer', 400, 'bad_request')
            return

        if round_idx < 0:
            self._error('round index must not be negative', 400, 'bad_request')
            return

        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            weights_raw = json.loads(body).get('weights', [])
        except Exception as e:
            self._error(f'malformed request body: {e}', 400, 'bad_request')
            return

        if not isinstance(weights_raw, list) or len(weights_raw) != 2:
            self._error(
                'weights must be [coef_matrix, intercept_vector]', 400, 'bad_request'
            )
            return

        try:
            weights = [np.array(w, dtype=np.float64) for w in weights_raw]
            logger  = _get_logger()          # shared singleton, not a new instance
            detail  = logger.verify_round_detail(round_idx, weights)
            # The comparison itself is a 200 with an explicit `match: false`.
            # Only genuine failures take an error status.
            self._json(detail, 200)
        except RoundIndexOutOfBounds as e:
            # 404, not 500: the round was never written. Answering 500 here is
            # what made an out-of-range index read like a broken verifier.
            self._error(str(e), 404, 'not_found')
        except Exception as e:
            # Raised when the chain node is unreachable, which is a different
            # situation from a hash mismatch and is reported as an error so the
            # UI does not present it as tampering.
            self._error(
                f'{type(e).__name__}: {e}', 500, 'chain_unavailable'
            )


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
