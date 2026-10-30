import jwt from 'jsonwebtoken';
import { findAdminById } from './admins.js';
import { findEmployeeById } from './employees.js';
import { HttpError } from './errors.js';

// Employees and admins have separate cookies, so one browser can be signed in
// to the employee app and the admin dashboard at the same time.
const COOKIES = { employee: 'gci_session', admin: 'gci_admin' };
const SESSION_SECONDS = 12 * 60 * 60;
const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
const isProduction = process.env.NODE_ENV === 'production';

let warnedAboutSecret = false;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction) {
    throw new HttpError(503, 'AUTH_NOT_CONFIGURED', 'Sign-in is not configured yet. Please contact your administrator.');
  }
  if (!warnedAboutSecret) {
    console.warn('JWT_SECRET is not set; using an insecure development secret.');
    warnedAboutSecret = true;
  }
  return 'geoclockin-dev-secret';
}

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
};

/**
 * Signs in an employee or admin. "Remember me" keeps a persistent cookie for
 * 30 days; otherwise the cookie lasts for the browser session (at most 12 h).
 */
export function startSession(res, role, subject, rememberMe) {
  const lifetime = rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS;
  const token = jwt.sign({ sub: subject, role }, jwtSecret(), { algorithm: 'HS256', expiresIn: lifetime });
  res.cookie(COOKIES[role], token, rememberMe ? { ...cookieOptions, maxAge: lifetime * 1000 } : cookieOptions);
}

export function endSession(res, role) {
  res.clearCookie(COOKIES[role], cookieOptions);
}

/** Whether a session signed at `issuedAt` (JWT seconds) predates the account's last password reset. */
export function signedBeforePasswordChange(issuedAt, passwordChangedAt) {
  return passwordChangedAt != null && issuedAt < Math.floor(new Date(passwordChangedAt).getTime() / 1000);
}

/** The session subject for `role`, or null. Employee tokens from before roles existed have no role claim. */
function sessionSubject(req, role) {
  const token = req.cookies?.[COOKIES[role]];
  if (!token) return { token: null, subject: null };
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    const tokenRole = payload.role ?? 'employee';
    return { token, subject: tokenRole === role ? payload.sub : null, issuedAt: payload.iat };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return { token, subject: null };
  }
}

function unauthenticated(res, role, hadToken) {
  if (!hadToken) return new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  endSession(res, role);
  return new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
}

/** Attaches the signed-in, active employee to `req.employee` or responds 401. */
export async function requireAuth(req, res, next) {
  const { token, subject, issuedAt } = sessionSubject(req, 'employee');
  const employee = subject ? await findEmployeeById(subject) : null;
  if (!employee?.active || signedBeforePasswordChange(issuedAt, employee.passwordChangedAt)) {
    throw unauthenticated(res, 'employee', Boolean(token));
  }
  req.employee = employee;
  next();
}

/** Attaches the signed-in admin to `req.admin` or responds 401. */
export async function requireAdmin(req, res, next) {
  const { token, subject, issuedAt } = sessionSubject(req, 'admin');
  const admin = subject ? await findAdminById(subject) : null;
  if (!admin || signedBeforePasswordChange(issuedAt, admin.passwordChangedAt)) throw unauthenticated(res, 'admin', Boolean(token));
  req.admin = admin;
  next();
}
