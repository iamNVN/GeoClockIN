// Office display QR codes. The display page (/display) shows a new code every
// second: `GCQ1.<keyId>.<unix seconds>.<signature>`, where the signature is
// ECDSA P-256 / SHA-256 over `GCQ1.<keyId>.<unix seconds>`, made with a key
// that the display's browser created and cannot export. GeoClockIN only stores
// the public keys of displays an admin approved, so codes cannot be made
// anywhere else, and a code is only accepted for a few seconds, so a photo of
// it is useless.
import { createHash, createPublicKey, verify } from 'node:crypto';

export const QR_PREFIX = 'GCQ1';
// Accepted age of a code: the second it is shown, scanning, the request and a
// small clock difference (displays keep their clock in step with the server).
export const QR_MAX_AGE_SECONDS = 5;
export const QR_MAX_FUTURE_SECONDS = 2;

const KEY_RE = /^[A-Za-z0-9_-]{100,140}$/;

/** A display's public key (SPKI, base64url) as a KeyObject, or null unless it is a P-256 key. */
export function publicKeyFrom(raw) {
  if (typeof raw !== 'string' || !KEY_RE.test(raw)) return null;
  try {
    const key = createPublicKey({ key: Buffer.from(raw, 'base64url'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1' ? key : null;
  } catch {
    return null;
  }
}

/** Short id of a display key; every code names the key that signed it. */
export const keyIdFor = (raw) => createHash('sha256').update(Buffer.from(raw, 'base64url')).digest('base64url').slice(0, 8);

/**
 * Checks a scanned code against the approved displays ([{ id, name, publicKey }]).
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
  const signed =
    key &&
    /^\d{9,11}$/.test(seconds) &&
    sig.length === 64 &&
    verify('sha256', Buffer.from(`${QR_PREFIX}.${keyId}.${seconds}`), { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!signed) return { ok: false, code: 'INVALID' };

  const ageSeconds = nowMs / 1000 - Number(seconds);
  if (ageSeconds > QR_MAX_AGE_SECONDS) return { ok: false, code: 'EXPIRED', ageSeconds };
  if (ageSeconds < -QR_MAX_FUTURE_SECONDS) return { ok: false, code: 'AHEAD', ageSeconds };
  return { ok: true, display, ageSeconds };
}
