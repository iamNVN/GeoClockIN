// Office QR displays. Any browser can open /display; it creates its own key
// pair and asks for its status here. Until an admin enters the pairing code it
// shows (Settings → Office QR), it is only "pending": it shows no QR code and
// any code made with its key is rejected.
import { randomInt } from 'node:crypto';
import { query } from './db.js';
import { HttpError } from './errors.js';
import { keyIdFor, publicKeyFrom } from './lib/qrToken.js';
import { getSettings, saveSettings, storableSettings } from './settings.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const PAIRING_MINUTES = 15;
// Pending requests need no sign-in, so their number is capped.
const MAX_PENDING = 200;

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

/** Approves the display currently showing `code`, as `name`. Returns the saved settings and the display. */
export async function approveDisplay(code, name, actor) {
  const displayName = typeof name === 'string' ? name.trim() : '';
  if (!displayName || displayName.length > 60) {
    throw new HttpError(400, 'INVALID_NAME', 'Give the display a name of up to 60 characters, such as Reception.', { field: 'name' });
  }
  const { rows: [pairing] } = await query('SELECT public_key FROM display_pairings WHERE code = $1 AND expires_at > now()', [
    normalizePairingCode(code),
  ]);
  if (!pairing) {
    throw new HttpError(404, 'PAIRING_NOT_FOUND', 'No display is showing this code. Check it on the display: a new code appears every 15 minutes.', {
      field: 'code',
    });
  }
  const current = storableSettings(await getSettings());
  const settings = await saveSettings(
    { ...current, qr: { ...current.qr, displays: [...current.qr.displays, { name: displayName, publicKey: pairing.public_key }] } },
    actor,
  );
  await query('DELETE FROM display_pairings WHERE public_key = $1', [pairing.public_key]);
  return { settings, display: settings.qr.displays.at(-1) };
}

/** Removes a display; its codes stop working at once. Without displays the QR code can't stay required. */
export async function removeDisplay(id, actor) {
  const current = storableSettings(await getSettings());
  const display = current.qr.displays.find((d) => d.id === id);
  if (!display) throw new HttpError(404, 'DISPLAY_NOT_FOUND', 'This display was already removed.');
  const displays = current.qr.displays.filter((d) => d.id !== id);
  const settings = await saveSettings({ ...current, qr: { displays, required: current.qr.required && displays.length > 0 } }, actor);
  return { settings, display };
}
