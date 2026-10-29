import jwt from 'jsonwebtoken';
import { findEmployeeById } from './config.js';
import { HttpError } from './errors.js';

const COOKIE_NAME = 'gci_session';
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
 * Signs the employee in. "Remember me" keeps a persistent cookie for 30 days;
 * otherwise the cookie lasts for the browser session (and at most 12 hours).
 */
export function startSession(res, employeeId, rememberMe) {
  const lifetime = rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS;
  const token = jwt.sign({ sub: employeeId }, jwtSecret(), { algorithm: 'HS256', expiresIn: lifetime });
  res.cookie(COOKIE_NAME, token, rememberMe ? { ...cookieOptions, maxAge: lifetime * 1000 } : cookieOptions);
}

export function endSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

/** Attaches the signed-in, active employee to `req.employee` or responds 401. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  let employee;
  if (token) {
    try {
      const { sub } = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
      employee = findEmployeeById(sub);
    } catch (err) {
      if (err instanceof HttpError) throw err;
    }
  }
  if (!employee?.active) {
    if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    endSession(res);
    throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  req.employee = employee;
  next();
}
