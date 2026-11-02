// Office display QR codes. A display shows a new code every second, signed with
// a private key that only it holds: a browser at /display or an ESP32 display.
// A code is JSON:
//
//   {"v":2,"d":"<display id>","n":"<nonce>","iat":<created>,"exp":<expires>,"p":"att","sig":"<signature>"}
//
// The signature is ECDSA P-256 / SHA-256 (64 bytes, r||s, base64url) over the
// text `GCQ2|<d>|<n>|<iat>|<exp>|<p>`, so the JSON's spacing and key order don't
// matter. GeoClockIN only stores the public keys of displays an admin added, so
// codes cannot be made anywhere else, and a code is only accepted for a few
// seconds, so a photo of it is useless. Displays need no connection to us.
//
// An ESP32 display is added by scanning its setup code, which carries its public
// key and proves it holds the private key:
//
//   {"v":2,"p":"setup","pk":"<SPKI, base64url>","sig":"<signature of GCQ2|setup|<pk>>"}
//
// `GCQ1.<id>.<seconds>.<signature>` is the earlier format of the /display page,
// accepted so display pages opened before the change keep working until reloaded.
import { createHash, createPublicKey, verify } from 'node:crypto';

export const QR_PREFIX = 'GCQ1';
export const QR_VERSION = 2;
export const QR_PURPOSE_ATTENDANCE = 'att';
export const QR_PURPOSE_SETUP = 'setup';
// Accepted age of a code: the second it is shown, scanning, the request and a
// small clock difference.
export const QR_MAX_AGE_SECONDS = 5;
export const QR_MAX_FUTURE_SECONDS = 2;

const KEY_RE = /^[A-Za-z0-9_-]{100,140}$/;
const KEY_ID_RE = /^[A-Za-z0-9_-]{8}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{12}$/;
const SIGNATURE_RE = /^[A-Za-z0-9_-]{86}$/;
const MAX_CODE_LENGTH = 400;
const CODE_FIELDS = ['d', 'exp', 'iat', 'n', 'p', 'sig', 'v'].join();
const SETUP_FIELDS = ['p', 'pk', 'sig', 'v'].join();

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

/** The text a display signs for a code. */
export const qrSignedText = ({ d, n, iat, exp, p }) => `GCQ2|${d}|${n}|${iat}|${exp}|${p}`;

/** The text a display signs for its setup code. */
export const setupSignedText = (publicKey) => `GCQ2|${QR_PURPOSE_SETUP}|${publicKey}`;

const signedBy = (key, text, signature) =>
  Boolean(key) && verify('sha256', Buffer.from(text), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));

/** A scanned text as an object in the v2 format, or null if it isn't one. */
function parseV2(text) {
  if (typeof text !== 'string' || text.length > MAX_CODE_LENGTH) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) && value.v === QR_VERSION ? value : null;
  } catch {
    return null;
  }
}

const hasFields = (object, fields) => Object.keys(object).sort().join() === fields;

/** The time checks. `display` is included so a clock problem can be traced to its display. */
function checkAge(display, ageSeconds, nonce) {
  if (ageSeconds > QR_MAX_AGE_SECONDS) return { ok: false, code: 'EXPIRED', display, ageSeconds };
  if (ageSeconds < -QR_MAX_FUTURE_SECONDS) return { ok: false, code: 'AHEAD', display, ageSeconds };
  return { ok: true, display, ageSeconds, nonce };
}

function verifyLegacyCode(text, displays, nowMs) {
  const parts = text.split('.');
  if (parts.length !== 4) return { ok: false, code: 'NOT_OFFICE_QR' };

  const [, keyId, seconds, signature] = parts;
  const display = displays.find((d) => d.id === keyId);
  if (!display) return { ok: false, code: 'UNKNOWN_DISPLAY' };

  const valid = /^\d{9,11}$/.test(seconds) && SIGNATURE_RE.test(signature) && signedBy(publicKeyFrom(display.publicKey), `${QR_PREFIX}.${keyId}.${seconds}`, signature);
  if (!valid) return { ok: false, code: 'INVALID' };
  return checkAge(display, nowMs / 1000 - Number(seconds), null);
}

/**
 * Checks a scanned code against the approved displays ([{ id, name, publicKey }]).
 * Returns { ok: true, display, ageSeconds, nonce } (nonce is null for earlier-format
 * codes), or { ok: false, code } where code is NOT_OFFICE_QR | SETUP_CODE |
 * UNKNOWN_DISPLAY | INVALID | EXPIRED | AHEAD. EXPIRED and AHEAD codes are genuinely
 * signed, so they also carry display and ageSeconds.
 */
export function verifyQrToken(token, displays, nowMs = Date.now()) {
  const text = typeof token === 'string' ? token.trim() : '';
  if (text.startsWith(`${QR_PREFIX}.`)) return verifyLegacyCode(text, displays, nowMs);

  const code = parseV2(text);
  if (!code) return { ok: false, code: 'NOT_OFFICE_QR' };
  if (code.p === QR_PURPOSE_SETUP) return { ok: false, code: 'SETUP_CODE' };

  const { d, n, iat, exp, p, sig } = code;
  const wellFormed =
    hasFields(code, CODE_FIELDS) &&
    p === QR_PURPOSE_ATTENDANCE &&
    typeof d === 'string' &&
    KEY_ID_RE.test(d) &&
    typeof n === 'string' &&
    NONCE_RE.test(n) &&
    Number.isSafeInteger(iat) &&
    Number.isSafeInteger(exp) &&
    typeof sig === 'string' &&
    SIGNATURE_RE.test(sig);
  if (!wellFormed) return { ok: false, code: 'INVALID' };

  const display = displays.find((candidate) => candidate.id === d);
  if (!display) return { ok: false, code: 'UNKNOWN_DISPLAY' };
  if (!signedBy(publicKeyFrom(display.publicKey), qrSignedText(code), sig)) return { ok: false, code: 'INVALID' };

  // Even a signed code can't outlive our own limit.
  const lifetime = exp - iat;
  if (lifetime <= 0 || lifetime > QR_MAX_AGE_SECONDS) return { ok: false, code: 'INVALID' };
  return checkAge(display, nowMs / 1000 - iat, n);
}

/**
 * Reads a display's setup code. Returns { ok: true, publicKey } when it is signed by
 * the key it carries, or { ok: false, code } where code is NOT_SETUP_CODE | LIVE_CODE | INVALID.
 */
export function verifySetupCode(token) {
  const code = parseV2(typeof token === 'string' ? token.trim() : '');
  if (!code) return { ok: false, code: 'NOT_SETUP_CODE' };
  if (code.p === QR_PURPOSE_ATTENDANCE) return { ok: false, code: 'LIVE_CODE' };
  if (code.p !== QR_PURPOSE_SETUP || !hasFields(code, SETUP_FIELDS)) return { ok: false, code: 'NOT_SETUP_CODE' };

  const { pk, sig } = code;
  const valid = typeof sig === 'string' && SIGNATURE_RE.test(sig) && signedBy(publicKeyFrom(pk), setupSignedText(pk), sig);
  return valid ? { ok: true, publicKey: pk } : { ok: false, code: 'INVALID' };
}
