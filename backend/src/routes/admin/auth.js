import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { findAdminByEmail, publicAdmin, updateAdmin } from '../../admins.js';
import { audit } from '../../audit.js';
import { endSession, requireAdmin, startSession } from '../../auth.js';
import { HttpError } from '../../errors.js';
import { getSettings } from '../../settings.js';
import { DUMMY_HASH } from '../auth.js';
import { officeNow } from './common.js';

const router = Router();

async function sessionPayload(admin) {
  const settings = await getSettings();
  const { instant, date } = officeNow(settings);
  return {
    admin: publicAdmin(admin),
    organization: {
      companyName: settings.company.name,
      officeName: settings.office.name,
      timezone: settings.schedule.timezone,
    },
    today: date,
    serverTime: instant.toISOString(),
  };
}

router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your email address and password.');
  }
  const admin = await findAdminByEmail(email);
  const passwordMatches = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !passwordMatches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');

  startSession(res, 'admin', admin.id, rememberMe === true);
  res.json(await sessionPayload(admin));
});

router.post('/logout', (req, res) => {
  endSession(res, 'admin');
  res.status(204).end();
});

router.get('/me', requireAdmin, async (req, res) => {
  res.json(await sessionPayload(req.admin));
});

// Update the signed-in admin's name, email or password.
router.put('/account', requireAdmin, async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body ?? {};
  if (!(await bcrypt.compare(String(currentPassword ?? ''), req.admin.passwordHash))) {
    throw new HttpError(403, 'WRONG_PASSWORD', 'Your current password is incorrect.', { field: 'currentPassword' });
  }
  const changes = {};
  if (typeof name === 'string' && name.trim()) changes.name = name.trim().slice(0, 100);
  if (typeof email === 'string' && email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new HttpError(400, 'INVALID_EMAIL', 'Enter a valid email address.', { field: 'email' });
    }
    changes.email = email.trim().toLowerCase();
  }
  if (newPassword) {
    if (String(newPassword).length < 8) {
      throw new HttpError(400, 'WEAK_PASSWORD', 'The new password must be at least 8 characters.', { field: 'newPassword' });
    }
    changes.passwordHash = await bcrypt.hash(String(newPassword), 10);
  }
  let admin;
  try {
    admin = await updateAdmin(req.admin.id, changes);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'Another admin already uses this email.', { field: 'email' });
    throw err;
  }
  await audit(null, req.admin, 'account.update', 'admin', admin.id, { fields: Object.keys(changes) });
  res.json({ admin: publicAdmin(admin) });
});

export default router;
