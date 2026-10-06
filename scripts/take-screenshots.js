/**
 * Takes screenshots of the FedLedger dashboard's 4 tabs
 * (Overview, Federation, Ledger, Verify) and saves them to outputs/.
 *
 * Uses Chrome's remote debugging protocol (CDP) over WebSocket.
 * No external dependencies — uses Node's built-in WebSocket and fetch.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'outputs');
const DASHBOARD_URL = 'http://127.0.0.1:5173/?v=4';

const TABS = [
  { id: 'overview', label: 'Overview',    file: '1.PNG' },
  { id: 'training', label: 'Federation',  file: '2.PNG' },
  { id: 'audit',    label: 'Ledger',      file: '3.PNG' },
  { id: 'verify',   label: 'Verify',      file: '4.PNG' },
];

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function httpGet(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Remove old (stale) screenshots
  for (const { file } of TABS) {
    const fp = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  // Start Chrome headless with remote debugging
  console.log('[screenshots] starting Chrome headless...');
  const chrome = spawn(CHROME, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9222',
    '--window-size=1920,1000',
    DASHBOARD_URL,
  ], { detached: true, stdio: 'ignore' });

  chrome.on('error', (err) => {
    console.error('[screenshots] Chrome failed to start:', err.message);
    process.exit(1);
  });

  // Wait for CDP endpoint to be ready
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await httpGet('http://127.0.0.1:9222/json');
      const page = targets.find(t => t.type === 'page');
      if (page) {
        wsUrl = page.webSocketUrl || page.webSocketDebuggerUrl;
        break;
      }
    } catch { /* not ready yet */ }
    await delay(500);
  }

  if (!wsUrl) {
    console.error('[screenshots] Could not connect to Chrome remote debugging');
    process.exit(1);
  }
  console.log('[screenshots] connected to page target');

  // WebSocket CDP client (WHATWG API)
  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(e);
  });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
    // Log console messages and exceptions from the page
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
      console.log('[page console]', text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[page exception]', msg.params.exceptionDetails.exception?.details?.text || '');
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Enable CDP domains we need
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  // Let the dashboard poll round_results.json for ~6s
  console.log('[screenshots] waiting for dashboard data to load...');
  await delay(6000);

  // Screenshot helper
  async function capture(filePath) {
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    const buffer = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log('[screenshots] saved ' + filePath + ' (' + buffer.length + ' bytes)');
  }

  // 1. Overview (default tab)
  console.log('[screenshots] capturing Overview...');
  await delay(1000);
  await capture(path.join(OUTPUT_DIR, TABS[0].file));

  // 2-4. Click each remaining tab
  for (let i = 1; i < TABS.length; i++) {
    const tab = TABS[i];
    console.log('[screenshots] switching to ' + tab.label + '...');

    await send('Runtime.evaluate', {
      expression: '(' + function(id) {
        var t = document.querySelector('[data-value="' + id + '"]') ||
                document.querySelector('[role="tab"][data-value="' + id + '"]');
        if (t) { t.scrollIntoView(); t.click(); }
        return t !== null;
      } + ')("' + tab.id + '")',
      returnByValue: true,
    });

    await delay(2500);
    await capture(path.join(OUTPUT_DIR, tab.file));
  }

  // Cleanup
  ws.close();
  chrome.kill();
  await delay(1000);

  console.log('[screenshots] done! Files:');
  for (const { file } of TABS) {
    const fp = path.join(OUTPUT_DIR, file);
    console.log('  ' + file + ': ' + (fs.existsSync(fp) ? fs.statSync(fp).size + ' bytes' : 'MISSING'));
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[screenshots] error:', err);
  process.exit(1);
});
