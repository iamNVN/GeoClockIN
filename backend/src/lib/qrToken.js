// Office display QR codes. The display app (qr-display/) shows a new code every
// second: `GCQ1.<keyId>.<unix seconds>.<signature>`, where the signature is
// Ed25519 over `GCQ1.<keyId>.<unix seconds>` made with the display's private
// key. GeoClockIN only stores the public key, so codes cannot be forged from
// the server side either, and a code is only accepted for a few seconds, so a
// photo of it is useless.
import { createHash, createPublicKey, verify } from 'node:crypto';

export const QR_PREFIX = 'GCQ1';
// Accepted age of a code: covers scanning, the request and small clock
// differences between the display and the server.
export const QR_MAX_AGE_SECONDS = 10;
export const QR_MAX_FUTURE_SECONDS = 5;

// DER header of an Ed25519 SubjectPublicKeyInfo; the 32 raw key bytes follow.
const ED25519_SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

/** The display's raw public key (base64url, 43 chars) as a KeyObject, or null if invalid. */
export function publicKeyFrom(raw) {
  if (typeof raw !== 'string' || !KEY_RE.test(raw)) return null;
  try {
    return createPublicKey({ key: Buffer.concat([ED25519_SPKI_HEADER, Buffer.from(raw, 'base64url')]), format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

/** Short id of a display key; every code names the key that signed it. */
export const keyIdFor = (raw) => createHash('sha256').update(Buffer.from(raw, 'base64url')).digest('base64url').slice(0, 8);

/**
 * Checks a scanned code against the registered displays ([{ id, name, publicKey }]).
 * Returns { ok: true, display, ageSeconds } or { ok: false, code } where code is
 * NOT_OFFICE_QR | UNKNOWN_DISPLAY | INVALID | EXPIRED | AHEAD.
 */
export function verifyQrToken(token, displays, nowMs = Date.now()) {
  const parts = typeof token === 'string' ? token.trim().split('.') : [];
  if (parts[0] !== QR_PREFIX || parts.length !== 4) return { ok: false, code: 'NOT_OFFICE_QR' };

  const [, keyId, seconds, signature] = parts;
  const display = displays.find((d) => d.id === keyId);
  if (!display) return { ok: false, code: 'UNKNOWN_DISPLAY' };

  const key = publicKeyFrom(display.publicKey);
  const sig = Buffer.from(signature, 'base64url');
  const signed = key && /^\d{9,11}$/.test(seconds) && sig.length === 64 && verify(null, Buffer.from(`${QR_PREFIX}.${keyId}.${seconds}`), key, sig);
  if (!signed) return { ok: false, code: 'INVALID' };

  const ageSeconds = nowMs / 1000 - Number(seconds);
  if (ageSeconds > QR_MAX_AGE_SECONDS) return { ok: false, code: 'EXPIRED', ageSeconds };
  if (ageSeconds < -QR_MAX_FUTURE_SECONDS) return { ok: false, code: 'AHEAD', ageSeconds };
  return { ok: true, display, ageSeconds };
}
