import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { endSession, requireAuth, startSession } from '../auth.js';
import { findEmployeeByIdentifier } from '../employees.js';
import { HttpError } from '../errors.js';
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

export default router;
