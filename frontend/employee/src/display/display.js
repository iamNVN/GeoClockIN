// Office display (/display): a full-screen QR code that changes every second,
// for employees to scan after the location check when clocking in or out.
//
// The first time a browser opens this page it creates an ECDSA P-256 key pair
// and keeps it in IndexedDB; the private key is created non-extractable, so it
// can sign here but can never be copied out. The page shows a pairing code
// until an admin enters it in Settings → Office QR. Only then does it show
// codes, and GeoClockIN only accepts codes signed by approved displays.
import '@fontsource-variable/inter';
import QRCode from 'qrcode';
import './display.css';

const STATUS_PENDING_MS = 3000;
const STATUS_APPROVED_MS = 60_000;
const CLOCK_SYNC_MS = 5 * 60_000;

const root = document.querySelector('.display');
const el = (name) => root.querySelector(`[data-${name}]`);

const show = (state) => {
  root.dataset.state = state;
};

function fail(message) {
  el('error').textContent = message;
  show('failed');
}

const base64url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/* ------------------------------------------------------------------ Key */

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('geoclockin-display', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeRequest(db, mode, run) {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction('keys', mode).objectStore('keys'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** This browser's display key: { privateKey, publicKey (SPKI, base64url), keyId }. */
async function loadKey() {
  const db = await openStore();
  let pair = await storeRequest(db, 'readonly', (store) => store.get('display'));
  if (!pair) {
    pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await storeRequest(db, 'readwrite', (store) => store.put(pair, 'display'));
  }
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const keyId = base64url(await crypto.subtle.digest('SHA-256', spki)).slice(0, 8);
  return { privateKey: pair.privateKey, publicKey: base64url(spki), keyId };
}

/* ---------------------------------------------------------------- Clock */

// Difference from GeoClockIN's clock, so codes are on server time even when
// this device's clock is off.
let offsetMs = 0;

async function syncClock() {
  try {
    const sent = Date.now();
    const { time } = await (await fetch('/api/health', { cache: 'no-store' })).json();
    if (time) offsetMs = Date.parse(time) - (sent + Date.now()) / 2;
  } catch {
    // Keep the last offset; codes still work while this device's clock is right.
  }
}

const now = () => Date.now() + offsetMs;

/* ---------------------------------------------------------------- Codes */

let key;
let approved = false;
let codeTimer;

async function showCode() {
  const message = `GCQ1.${key.keyId}.${Math.floor(now() / 1000)}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(message));
  el('qr').innerHTML = await QRCode.toString(`${message}.${base64url(signature)}`, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 });
}

// A new code on every second boundary, in step with the codes' timestamps.
function runCodes() {
  clearTimeout(codeTimer);
  if (!approved) return;
  showCode().catch(() => {});
  codeTimer = setTimeout(runCodes, 1000 - (now() % 1000) + 5);
}

/* --------------------------------------------------------------- Status */

async function checkStatus() {
  let next = approved ? STATUS_APPROVED_MS : STATUS_PENDING_MS;
  try {
    const response = await fetch('/api/displays/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: key.publicKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? 'Unexpected reply');
    el('offline').hidden = true;

    if (data.status === 'approved') {
      el('name').textContent = data.name;
      if (!approved) {
        approved = true;
        show('live');
        runCodes();
      }
      next = STATUS_APPROVED_MS;
    } else {
      // Pending, or removed by an admin: no codes until paired (again).
      approved = false;
      clearTimeout(codeTimer);
      el('qr').innerHTML = '';
      el('code').textContent = `${data.code.slice(0, 4)}-${data.code.slice(4)}`;
      show('pairing');
      next = STATUS_PENDING_MS;
    }
  } catch {
    // An approved display keeps showing codes while offline: they are signed here.
    el('offline').hidden = approved;
    if (root.dataset.state === 'starting') show('pairing');
  }
  setTimeout(checkStatus, next);
}

/* ---------------------------------------------------------------- Start */

async function start() {
  if (!window.isSecureContext || !crypto?.subtle || !window.indexedDB) {
    fail('This page needs a secure (https) address and a recent browser. Open it from the GeoClockIN website.');
    return;
  }
  try {
    key = await loadKey();
  } catch {
    fail('This browser can’t keep the display’s key. Turn off private browsing and allow site data, then reload.');
    return;
  }
  await syncClock();
  setInterval(syncClock, CLOCK_SYNC_MS);
  await checkStatus();
}

// Keep the screen on, and click or tap for full screen.
const keepAwake = () => navigator.wakeLock?.request('screen').catch(() => {});
keepAwake();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());
document.addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));

start();
