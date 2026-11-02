// Office QR displays. Any browser can open /display; it creates its own key
// pair and asks for its status here. Until an admin enters the pairing code it
// shows (Settings → Office QR), it is only "pending": it shows no QR code and
// any code made with its key is rejected.
//
// An ESP32 display never contacts the server. It shows a setup code holding its
// public key, which the admin scans; its codes are rejected until then.
import { randomInt } from 'node:crypto';
import { query } from './db.js';
import { HttpError } from './errors.js';
import { keyIdFor, publicKeyFrom, verifySetupCode } from './lib/qrToken.js';
import { getSettings, saveSettings, storableSettings } from './settings.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const PAIRING_MINUTES = 15;
// Pending requests need no sign-in, so their number is capped.
const MAX_PENDING = 200;
// This many other people using one code, shown for a second, is logged as forwarded.
const SHARED_CODE_OTHERS = 3;
// Signed codes rejected in a row because of their time before the admin is warned.
// One could be an old photo; every scan failing means the display's clock is off.
const CLOCK_WARNING_REJECTS = 3;

const SETUP_CODE_MESSAGES = {
  NOT_SETUP_CODE: 'This isn’t a display’s setup code. Scan the setup code on the ESP32 display.',
  LIVE_CODE: 'This is the display’s live code. Press its BOOT button to show the setup code, then scan that.',
  INVALID: 'This setup code isn’t valid. Scan it again from the display.',
};

/** "k7qm-9xp2" → "K7QM9XP2". */
export const normalizePairingCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const newCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/**
 * A display page's status: { status: 'approved', id, name } once an admin has
 * paired it, otherwise { status: 'pending', id, code, expiresAt } with the
 * code to show (a new one every PAIRING_MINUTES).
 */
export async function displayStatus(publicKey) {
  if (!publicKeyFrom(publicKey)) throw new HttpError(400, 'INVALID_KEY', 'This display’s key is not valid. Reload the page.');
  const id = keyIdFor(publicKey);
  const approved = (await getSettings()).qr.displays.find((d) => d.publicKey === publicKey);
  if (approved) return { status: 'approved', id, name: approved.name };

  await query('DELETE FROM display_pairings WHERE expires_at < now()');
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows: [pending] } = await query('SELECT code, expires_at FROM display_pairings WHERE public_key = $1', [publicKey]);
    if (pending) return { status: 'pending', id, code: pending.code, expiresAt: pending.expires_at };

    const { rows: [{ count }] } = await query('SELECT count(*)::int AS count FROM display_pairings');
    if (count >= MAX_PENDING) {
      throw new HttpError(429, 'TOO_MANY_PAIRINGS', 'Too many displays are waiting to be paired. Try again in a few minutes.');
    }
    // A clash (same code, or the same display asking twice at once) just tries again.
    await query(
      `INSERT INTO display_pairings (public_key, code, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3)) ON CONFLICT DO NOTHING`,
      [publicKey, newCode(), PAIRING_MINUTES],
    );
  }
  throw new HttpError(503, 'PAIRING_UNAVAILABLE', 'Couldn’t create a pairing code. Reload the page.');
}

function displayName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > 60) {
    throw new HttpError(400, 'INVALID_NAME', 'Give the display a name of up to 60 characters, such as Reception.', { field: 'name' });
  }
  return trimmed;
}

async function addDisplay(publicKey, name, actor) {
  const current = storableSettings(await getSettings());
  const settings = await saveSettings({ ...current, qr: { ...current.qr, displays: [...current.qr.displays, { name, publicKey }] } }, actor);
  return { settings, display: settings.qr.displays.at(-1) };
}

/** Approves the display currently showing `code`, as `name`. Returns the saved settings and the display. */
export async function approveDisplay(code, name, actor) {
  const validName = displayName(name);
  const { rows: [pairing] } = await query('SELECT public_key FROM display_pairings WHERE code = $1 AND expires_at > now()', [
    normalizePairingCode(code),
  ]);
  if (!pairing) {
    throw new HttpError(404, 'PAIRING_NOT_FOUND', 'No display is showing this code. Check it on the display: a new code appears every 15 minutes.', {
      field: 'code',
    });
  }
  const added = await addDisplay(pairing.public_key, validName, actor);
  await query('DELETE FROM display_pairings WHERE public_key = $1', [pairing.public_key]);
  return added;
}

/** Adds the ESP32 display whose setup code was scanned, as `name`. Returns the saved settings and the display. */
export async function registerDevice(setupCode, name, actor) {
  const validName = displayName(name);
  const setup = verifySetupCode(setupCode);
  if (!setup.ok) throw new HttpError(422, `SETUP_${setup.code}`, SETUP_CODE_MESSAGES[setup.code], { field: 'setup' });
  return addDisplay(setup.publicKey, validName, actor);
}

/** Removes a display; its codes stop working at once. Without displays the QR code can't stay required. */
export async function removeDisplay(id, actor) {
  const current = storableSettings(await getSettings());
  const display = current.qr.displays.find((d) => d.id === id);
  if (!display) throw new HttpError(404, 'DISPLAY_NOT_FOUND', 'This display was already removed.');
  const displays = current.qr.displays.filter((d) => d.id !== id);
  const settings = await saveSettings({ ...current, qr: { displays, required: current.qr.required && displays.length > 0 } }, actor);
  await query('DELETE FROM qr_display_activity WHERE display_id = $1', [id]);
  return { settings, display };
}

/**
 * Records that an employee used a code. Returns { reused: true } if they already
 * used it, otherwise { reused: false, shared } where shared means so many others
 * used it too that it was probably forwarded.
 */
export async function claimCode(nonce, employeeId, displayId) {
  const { rows: [use] } = await query(
    `WITH old AS (DELETE FROM qr_code_uses WHERE used_at < now() - interval '1 minute'),
          added AS (
            INSERT INTO qr_code_uses (nonce, employee_id, display_id) VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING RETURNING 1
          )
     SELECT (SELECT count(*) FROM added)::int AS added,
            (SELECT count(*) FROM qr_code_uses WHERE nonce = $1)::int AS others`,
    [nonce, employeeId, displayId],
  );
  return use.added === 0 ? { reused: true } : { reused: false, shared: use.others >= SHARED_CODE_OTHERS };
}

/** A display's code was accepted: it was used now, and its clock is fine. */
export async function noteCodeAccepted(displayId, ageSeconds) {
  await query(
    `INSERT INTO qr_display_activity (display_id, last_used_at, clock_rejects, clock_offset_seconds)
     VALUES ($1, now(), 0, $2)
     ON CONFLICT (display_id) DO UPDATE SET last_used_at = now(), clock_rejects = 0, clock_offset_seconds = $2`,
    [displayId, Math.round(ageSeconds)],
  );
}

/** A genuinely signed code from this display was rejected because of its time. */
export async function noteClockReject(displayId, ageSeconds) {
  await query(
    `INSERT INTO qr_display_activity (display_id, clock_rejects, clock_offset_seconds)
     VALUES ($1, 1, $2)
     ON CONFLICT (display_id) DO UPDATE
       SET clock_rejects = qr_display_activity.clock_rejects + 1, clock_offset_seconds = $2`,
    [displayId, Math.round(ageSeconds)],
  );
}

/** What scans say about each display, by id: { lastUsedAt, clockBehindSeconds } (null when its clock looks fine). */
export async function displayActivity() {
  const { rows } = await query('SELECT * FROM qr_display_activity');
  return Object.fromEntries(
    rows.map((row) => [
      row.display_id,
      {
        lastUsedAt: row.last_used_at,
        clockBehindSeconds: row.clock_rejects >= CLOCK_WARNING_REJECTS ? row.clock_offset_seconds : null,
      },
    ]),
  );
}
