// GeoClockIN office display: a full-screen QR code that changes every second.
//
// Each code is `GCQ1.<key id>.<unix seconds>.<signature>`, signed with this
// display's own Ed25519 private key. The key is created on first run, stays in
// display-key.pem on this computer and is never sent anywhere; GeoClockIN only
// gets the public key (Settings → Office QR), so nobody can make valid codes
// without this computer. Codes are accepted for a few seconds only.
//
// Settings (environment or .env): PORT (4100), HOST (127.0.0.1; 0.0.0.0 to
// show the page on a tablet on the office network) and GEOCLOCKIN_URL (keeps
// the codes' time in step with GeoClockIN's clock).
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || '127.0.0.1';
const SERVER_URL = process.env.GEOCLOCKIN_URL?.replace(/\/+$/, '');
const KEY_FILE = fileURLToPath(new URL('./display-key.pem', import.meta.url));
const CLOCK_SYNC_MS = 10 * 60_000;

/* ------------------------------------------------------------------ Key */

if (!existsSync(KEY_FILE)) {
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(KEY_FILE, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
}
const privateKey = createPrivateKey(readFileSync(KEY_FILE));
const publicKey = createPublicKey(privateKey).export({ format: 'jwk' }).x;
const keyId = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url').slice(0, 8);

/* ---------------------------------------------------------------- Clock */

// Difference between GeoClockIN's clock and this computer's, so codes are
// accepted even when this computer's clock drifts.
let offsetMs = 0;

async function syncClock() {
  if (!SERVER_URL) return;
  try {
    const sent = Date.now();
    const response = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    const { time } = await response.json();
    if (!time) throw new Error('no time in the reply');
    offsetMs = Date.parse(time) - (sent + Date.now()) / 2;
    if (Math.abs(offsetMs) >= 1000) console.log(`This computer's clock is ${(offsetMs / 1000).toFixed(1)} s off; using GeoClockIN's time.`);
  } catch (err) {
    console.warn(`Couldn't check the time with GeoClockIN (${err.message}); using this computer's clock.`);
  }
}

const now = () => Date.now() + offsetMs;

/* ---------------------------------------------------------------- Codes */

function currentCode() {
  const message = `GCQ1.${keyId}.${Math.floor(now() / 1000)}`;
  return `${message}.${sign(null, Buffer.from(message), privateKey).toString('base64url')}`;
}

// Open pages receive each new code as a server-sent event.
const pages = new Set();
let latestEvent = null;

async function showNextCode() {
  const svg = await QRCode.toString(currentCode(), { type: 'svg', errorCorrectionLevel: 'M', margin: 0 });
  latestEvent = `data: ${JSON.stringify({ svg })}\n\n`;
  for (const page of pages) page.write(latestEvent);
}

// Change on every second boundary, in step with the codes' timestamps.
function scheduleNextCode() {
  setTimeout(async () => {
    await showNextCode().catch((err) => console.error(err));
    scheduleNextCode();
  }, 1000 - (now() % 1000) + 5);
}

/* ---------------------------------------------------------------- Page */

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeoClockIN · Office QR</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; overflow: hidden; background: #fff; color: #64748b;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; cursor: none; }
  main { display: grid; justify-items: center; gap: 2vmin; }
  #qr { width: min(82vmin, 90vw); aspect-ratio: 1; padding: 4vmin; box-sizing: border-box; transition: opacity 0.2s; }
  #qr svg { display: block; width: 100%; height: 100%; }
  p { margin: 0; font-size: max(14px, 2.4vmin); }
  #offline { display: none; position: fixed; inset: 0; place-items: center; color: #c42f2f; font-size: max(16px, 3vmin); }
  body.offline #qr { opacity: 0.06; }
  body.offline #offline { display: grid; }
</style>
</head>
<body class="offline">
<main>
  <div id="qr" role="img" aria-label="Office QR code"></div>
  <p>Scan in GeoClockIN to clock in or out</p>
</main>
<div id="offline">Reconnecting…</div>
<script>
  const qr = document.getElementById('qr');
  let shownAt = 0;
  new EventSource('/events').onmessage = (event) => {
    qr.innerHTML = JSON.parse(event.data).svg;
    shownAt = Date.now();
    document.body.classList.remove('offline');
  };
  // A frozen code would only fail when scanned, so hide it.
  setInterval(() => document.body.classList.toggle('offline', Date.now() - shownAt > 2500), 500);
  // Keep the screen on; click or tap for full screen.
  const keepAwake = () => navigator.wakeLock?.request('screen').catch(() => {});
  keepAwake();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());
  document.addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));
</script>
</body>
</html>`;

/* --------------------------------------------------------------- Server */

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://display');
  if (pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    if (latestEvent) res.write(latestEvent);
    pages.add(res);
    req.on('close', () => pages.delete(res));
  } else if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
    res.end(PAGE);
  } else if (pathname === '/key') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`${publicKey}\n`);
  } else {
    res.writeHead(404).end();
  }
});

await syncClock();
setInterval(syncClock, CLOCK_SYNC_MS).unref();
await showNextCode();
scheduleNextCode();

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`
GeoClockIN office display
  Page (open full screen):  http://${shown}:${PORT}
  Display key:              ${publicKey}

Add this display in GeoClockIN: Settings → Office QR → Add Display, then paste the key.
The private key is in ${KEY_FILE}; keep it on this computer only.
`);
});
