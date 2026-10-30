import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { endSession, requireAuth, startSession } from '../auth.js';
import { findEmployeeByIdentifier, MIN_PASSWORD_LENGTH } from '../employees.js';
import { HttpError } from '../errors.js';
import { assertResetAvailable, isValidResetToken, resetPassword, sendResetLink } from '../passwordReset.js';
import { getSettings, sessionPayload } from '../settings.js';

// Compared against when the identifier is unknown, so that response time does
// not reveal whether an employee ID or email exists.
export const DUMMY_HASH = '$2b$10$cy3AVr.FghZW/rOczN41yuCj.RLXxCAsqCDjohOXLRNMEDuln1MDe';

const router = Router();

router.post('/login', async (req, res) => {
  const { identifier, password, rememberMe } = req.body ?? {};
  if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your employee ID or email and your password.');
  }

  const employee = await findEmployeeByIdentifier(identifier);
  const passwordMatches = await bcrypt.compare(password, employee?.passwordHash ?? DUMMY_HASH);
  if (!employee || !passwordMatches) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect employee ID/email or password.');
  }
  if (!employee.active) {
    throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Your account is inactive. Please contact your administrator.');
  }

  startSession(res, 'employee', employee.id, rememberMe === true);
  res.json(sessionPayload(employee, await getSettings()));
});

router.post('/logout', (req, res) => {
  endSession(res, 'employee');
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  res.json(sessionPayload(req.employee, await getSettings()));
});

// Emails a reset link. The response is the same whether or not the account exists.
router.post('/forgot-password', async (req, res) => {
  const { identifier } = req.body ?? {};
  if (typeof identifier !== 'string' || !identifier.trim()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your employee ID or email.');
  }
  assertResetAvailable();
  const employee = await findEmployeeByIdentifier(identifier);
  if (employee?.active) await sendResetLink('employee', employee);
  res.status(204).end();
});

router.post('/reset-password/check', async (req, res) => {
  res.json({ valid: await isValidResetToken('employee', req.body?.token) });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, 'WEAK_PASSWORD', `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  await resetPassword('employee', token, password);
  res.status(204).end();
});

export default router;
