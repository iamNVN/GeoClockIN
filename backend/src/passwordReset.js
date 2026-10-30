// Self-service password reset: a one-time link, valid for RESET_LINK_MINUTES,
// is emailed to the account's address. Only a SHA-256 hash of each token is stored.
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { audit } from './audit.js';
import { query, transaction } from './db.js';
import { HttpError } from './errors.js';
import { resetEmail, resetLink } from './lib/resetEmail.js';
import { canSendMail, sendMail } from './mail.js';
import { getSettings } from './settings.js';

export const RESET_LINK_MINUTES = 30;
// Per account: one email a minute and at most five an hour.
const RESEND_SECONDS = 60;
const MAX_PER_HOUR = 5;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TABLES = { employee: 'employees', admin: 'admins' };

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

const invalidLink = () =>
  new HttpError(400, 'INVALID_RESET_LINK', 'This reset link has expired or has already been used. Please request a new one.');

/** Checked before any account lookup, so the answer never depends on whether the account exists. */
export function assertResetAvailable() {
  if (!canSendMail()) {
    throw new HttpError(503, 'MAIL_NOT_CONFIGURED', 'Password reset by email isn’t set up yet. Please contact your administrator.');
  }
}

/** Emails a reset link to `account` ({ id, name, email }), unless one was sent too recently. */
export async function sendResetLink(role, account) {
  const {
    rows: [recent],
  } = await query(
    `SELECT count(*)::int AS sent, coalesce(max(created_at) > now() - make_interval(secs => $3), false) AS too_soon
       FROM password_resets
      WHERE role = $1 AND subject_id = $2 AND created_at > now() - interval '1 hour'`,
    [role, account.id, RESEND_SECONDS],
  );
  if (recent.too_soon || recent.sent >= MAX_PER_HOUR) return;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await query(
    'INSERT INTO password_resets (token_hash, role, subject_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))',
    [tokenHash, role, account.id, RESET_LINK_MINUTES],
  );

  const { company } = await getSettings();
  const email = resetEmail({ companyName: company.name, name: account.name, link: resetLink(role, token), minutes: RESET_LINK_MINUTES });
  try {
    await sendMail({ to: account.email, ...email }, company.name);
  } catch (err) {
    console.error('Password reset email failed:', err.message);
    await query('DELETE FROM password_resets WHERE token_hash = $1', [tokenHash]);
    throw new HttpError(502, 'MAIL_FAILED', 'We couldn’t send the email right now. Please try again in a few minutes.');
  }

  // Only the newest link works; old rows are cleared out after a week.
  await query(
    `UPDATE password_resets SET used_at = now()
      WHERE role = $1 AND subject_id = $2 AND used_at IS NULL AND token_hash <> $3`,
    [role, account.id, tokenHash],
  );
  await query("DELETE FROM password_resets WHERE created_at < now() - interval '7 days'");
}

/** Whether `token` is an unused, unexpired reset link for `role`. */
export async function isValidResetToken(role, token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return false;
  const { rows } = await query(
    'SELECT 1 FROM password_resets WHERE token_hash = $1 AND role = $2 AND used_at IS NULL AND expires_at > now()',
    [hashToken(token), role],
  );
  return rows.length > 0;
}

/** Sets the new password and uses up the link. Every existing session of the account ends. */
export async function resetPassword(role, token, password) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw invalidLink();
  const passwordHash = await bcrypt.hash(password, 10);
  await transaction(async (db) => {
    const {
      rows: [link],
    } = await db.query(
      `UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND role = $2 AND used_at IS NULL AND expires_at > now()
        RETURNING subject_id`,
      [hashToken(token), role],
    );
    if (!link) throw invalidLink();
    const {
      rows: [account],
    } = await db.query(
      `UPDATE ${TABLES[role]} SET password_hash = $2, password_changed_at = now(), updated_at = now()
        WHERE id = $1${role === 'employee' ? ' AND active' : ''}
        RETURNING email`,
      [link.subject_id, passwordHash],
    );
    if (!account) throw invalidLink();
    await audit(db, account, 'password.reset', role, link.subject_id);
  });
}
