// Proof that an employee passed the location check moments ago (and, when the
// office requires it, then scanned the office QR code). The server signs it,
// so the app cannot change the check time or distance. Clock-in and clock-out
// record the time of the location check, not the time of the request.
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { jwtSecret } from './auth.js';
import { HttpError } from './errors.js';

export const PRESENCE_TTL_SECONDS = 180;
export const PRESENCE_ACTIONS = ['check_in', 'check_out'];

// A key of its own, so a presence proof can never pass as a session cookie.
const secret = () => createHash('sha256').update(`presence:${jwtSecret()}`).digest();

/** Signs a proof for `action` at `at`; `expiresAt` (unix seconds) keeps an upgraded proof's original expiry. */
export function issuePresence({ employeeId, action, at, verification, qrDisplay = null, expiresAt }) {
  const exp = expiresAt ?? Math.floor(Date.now() / 1000) + PRESENCE_TTL_SECONDS;
  return jwt.sign({ act: action, at: at.toISOString(), d: verification.distanceM, a: verification.accuracyM, qr: qrDisplay, exp }, secret(), {
    algorithm: 'HS256',
    subject: employeeId,
  });
}

export const presenceExpired = () =>
  new HttpError(400, 'PRESENCE_EXPIRED', 'Your location check has expired. Check your location again.');

/** The proof's contents, or a 400 PRESENCE_EXPIRED when it is invalid, expired or for another action. */
export function readPresence(token, employeeId, action) {
  try {
    const p = jwt.verify(String(token ?? ''), secret(), { algorithms: ['HS256'], subject: employeeId });
    if (p.act !== action) throw new Error('wrong action');
    return { at: new Date(p.at), distanceM: p.d, accuracyM: p.a, qrDisplay: p.qr ?? null, expiresAt: p.exp };
  } catch {
    throw presenceExpired();
  }
}
