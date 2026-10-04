"""
run_fedledger.py
One command to start the entire FedLedger system.

Usage:
  python run_fedledger.py            # full run (10 rounds)
  python run_fedledger.py --rounds 5 # shorter run
  python run_fedledger.py --no-ui    # skip opening browser
  python run_fedledger.py --skip-build  # reuse the existing app/web/dist

What it starts (in order):
  [1/8] Frontend production build          (app/web/dist)
  [2/8] Hardhat local Ethereum node        (port 8545)
  [3/8] Smart contract deployment
  [4/8] Dashboard HTTP server              (port 5173)
  [5/8] FL Server — Flower                (port 8080)
  [6/8] OrgA / OrgB / OrgC nodes          (3 nodes, staggered 0.5 s apart)
  [7/8] Verify API server                  (port 8088)
  [8/8] Opens dashboard in browser         (http://127.0.0.1:5173)

The dashboard is served over HTTP rather than opened as a file:// path because
the page fetches round_results.json, and a file:// origin cannot fetch.

Ctrl+C cleanly shuts everything down.
"""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent   # FedLedger/
APP  = ROOT / 'app'
BC   = ROOT / 'blockchain'
WEB  = APP / 'web'

IS_WIN = sys.platform == 'win32'
NPX    = 'npx.cmd' if IS_WIN else 'npx'
NPM    = 'npm.cmd' if IS_WIN else 'npm'
PY     = sys.executable

DASHBOARD_PORT = int(os.environ.get('FEDLEDGER_DASHBOARD_PORT', 5173))
DASHBOARD_URL  = f'http://127.0.0.1:{DASHBOARD_PORT}'


def spawn(cmd, cwd=None, env=None):
    """Start a background subprocess, suppress its output."""
    return subprocess.Popen(
        cmd,
        cwd=str(cwd or ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def run_blocking(cmd, cwd=None):
    """Run a command synchronously and return (returncode, stderr)."""
    result = subprocess.run(
        cmd, cwd=str(cwd or ROOT),
        capture_output=True, text=True
    )
    return result.returncode, result.stderr


def wait_for_file(path, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        p = Path(path)
        if p.exists() and p.stat().st_size > 10:
            return True
        time.sleep(0.5)
    return False


def port_open(port, host='127.0.0.1', timeout=0.5):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0


def wait_for_port(port, timeout=20, host='127.0.0.1'):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(port, host):
            return True
        time.sleep(0.4)
    return False


def build_frontend(skip=False):
    """Build app/web if needed. Returns True when a usable dist/ exists."""
    if (WEB / 'dist' / 'index.html').exists() and skip:
        print('  ✓ reusing existing build (--skip-build)')
        return True

    if not (WEB / 'node_modules').exists():
        print('  · installing frontend dependencies (first run only)…')
        rc, err = run_blocking([NPM, 'install'], cwd=WEB)
        if rc != 0:
            print(f'  ✗ npm install failed:\n{err[-800:]}')
            return False

    print('  · building dashboard…')
    rc, err = run_blocking([NPM, 'run', 'build'], cwd=WEB)
    if rc != 0:
        print(f'  ✗ frontend build failed:\n{err[-800:]}')
        return False

    if not (WEB / 'dist' / 'index.html').exists():
        print('  ✗ build reported success but dist/index.html is missing')
        return False
    return True


def _force_utf8_output():
    """
    Windows consoles default to cp1252, which cannot encode the box-drawing
    characters this launcher prints. Redirected output hit it immediately as a
    UnicodeEncodeError on the first banner. Forcing UTF-8 with a replace
    fallback keeps the banner readable instead of crashing the launcher.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass


def main():
    _force_utf8_output()

    parser = argparse.ArgumentParser(description='Start FedLedger')
    parser.add_argument('--rounds', type=int, default=10)
    parser.add_argument('--no-ui', action='store_true')
    parser.add_argument('--skip-build', action='store_true',
                        help='reuse the existing app/web/dist instead of rebuilding')
    parser.add_argument(
        '--dataset',
        choices=['iris', 'wine', 'breast_cancer', 'digits'],
        default=None,
        help=(
            'Re-partition a new dataset before training. '
            'iris=150 samples (default/fast), wine=178, '
            'breast_cancer=569, digits=1797 (largest). '
            'Omit to keep whatever is already in data/node*/'
        ),
    )
    args = parser.parse_args()

    procs = []

    def shutdown(sig=None, frame=None):
        print('\n\nShutting down FedLedger…')
        for p in reversed(procs):
            try: p.terminate()
            except Exception: pass
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print('\n━━━ FedLedger Launcher ━━━\n')

    if port_open(DASHBOARD_PORT):
        print(f'✗ Port {DASHBOARD_PORT} is already in use — stop the other dashboard first.')
        print('  Set FEDLEDGER_DASHBOARD_PORT to use a different port.')
        sys.exit(1)

    # 0. Re-partition if a dataset was requested
    if args.dataset:
        print(f'[0/8] Partitioning dataset: {args.dataset}…')
        rc, err = run_blocking(
            [PY, str(ROOT / 'data' / 'generate_partitions.py'), '--dataset', args.dataset]
        )
        if rc != 0:
            print(f'  ✗ Partition failed:\n{err}')
            shutdown()
        print(f'  ✓ Data partitioned ({args.dataset})')

    # 1. Frontend build — must exist before the server can start
    print('[1/8] Building dashboard…')
    if not build_frontend(skip=args.skip_build):
        shutdown()

    # 2. Hardhat node
    print('[2/8] Starting Hardhat local Ethereum node…')
    procs.append(spawn([NPX, 'hardhat', 'node'], cwd=BC))
    if not wait_for_port(8545, timeout=30):
        print('  ✗ Hardhat node did not open :8545')
        shutdown()
    print('  ✓ node up')

    # 3. Deploy contract (blocking — must finish before Python starts)
    print('[3/8] Deploying FLAuditLog contract…')
    rc, err = run_blocking([NPX, 'hardhat', 'run', 'scripts/deploy.js', '--network', 'localhost'], cwd=BC)
    if rc != 0:
        print(f'  ✗ Deploy failed:\n{err}')
        shutdown()
    if not wait_for_file(BC / 'contract_config.json', timeout=20):
        print('  ✗ contract_config.json not written — check deploy.js')
        shutdown()
    print('  ✓ Contract deployed')

    # Shared environment: the repo root must be importable so that
    # `fl_server.*` package imports resolve from every Python process.
    py_env = os.environ.copy()
    py_env['PYTHONPATH'] = str(ROOT)
    py_env['FEDLEDGER_DASHBOARD_PORT'] = str(DASHBOARD_PORT)

    # 4. Dashboard HTTP server
    print(f'[4/8] Starting dashboard server on {DASHBOARD_URL}…')
    procs.append(spawn([PY, str(APP / 'dashboard_server.py')], cwd=ROOT, env=py_env))
    if not wait_for_port(DASHBOARD_PORT, timeout=15):
        print(f'  ✗ dashboard server did not open :{DASHBOARD_PORT}')
        shutdown()
    print('  ✓ dashboard serving')

    # 5. FL Server — run as a module from the root so `fl_server.*` imports work
    print('[5/8] Starting FL Server…')
    procs.append(spawn([PY, '-m', 'fl_server.server', '--rounds', str(args.rounds)],
                       cwd=ROOT, env=py_env))

    # 6-8. FL Nodes
    print(f'[6/8] Starting 3 FL nodes (OrgA, OrgB, OrgC), {args.rounds} rounds…')
    for node_id in [1, 2, 3]:
        procs.append(spawn([PY, str(ROOT / 'fl_nodes' / 'node.py'),
                            '--node', str(node_id)], cwd=ROOT, env=py_env))
        time.sleep(0.5)

    # 9. Verify server
    print('[7/8] Starting verify API server…')
    procs.append(spawn([PY, str(APP / 'verify_server.py')], cwd=ROOT, env=py_env))
    wait_for_port(8088, timeout=10)

    # 10. Open dashboard
    if not args.no_ui:
        time.sleep(1)
        print(f'[8/8] Opening dashboard → {DASHBOARD_URL}')
        webbrowser.open(DASHBOARD_URL)
    else:
        print('[8/8] --no-ui set, not opening a browser')

    print(f'\n━━━ All systems running. {args.rounds} rounds. Ctrl+C to stop. ━━━\n')
    print(f'    dashboard  {DASHBOARD_URL}')
    print(f'    chain      http://127.0.0.1:8545')
    print(f'    verify     http://127.0.0.1:8088/verify')
    print()

    # Keep process alive
    try:
        while True:
            time.sleep(5)
    except KeyboardInterrupt:
        shutdown()


if __name__ == '__main__':
    main()
