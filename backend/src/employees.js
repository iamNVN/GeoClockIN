// Employee accounts, managed from the admin dashboard.
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { HttpError } from './errors.js';
import { isValidDate } from './lib/time.js';

const ID_RE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 6;

function toEmployee(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    department: row.department,
    designation: row.designation,
    joinedOn: row.joined_on,
    active: row.active,
    deactivatedOn: row.deactivated_on,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Employee without credentials, for API responses. */
export function publicEmployee({ passwordHash, ...employee }) {
  return employee;
}

export async function findEmployeeById(id) {
  if (typeof id !== 'string') return null;
  const { rows } = await query('SELECT * FROM employees WHERE id = $1', [id.trim().toUpperCase()]);
  return toEmployee(rows[0]);
}

/** Looks up an employee by ID or email (case-insensitive). */
export async function findEmployeeByIdentifier(identifier) {
  const value = identifier.trim();
  const { rows } = await query('SELECT * FROM employees WHERE id = upper($1) OR lower(email) = lower($1) LIMIT 1', [value]);
  return toEmployee(rows[0]);
}

export async function listEmployees() {
  const { rows } = await query('SELECT * FROM employees ORDER BY name');
  return rows.map(toEmployee);
}

class EmployeeError extends HttpError {
  constructor(field, message) {
    super(400, 'INVALID_EMPLOYEE', message, { field });
  }
}

/**
 * Validates employee fields. With `partial`, missing fields are left out
 * (for updates); otherwise name, email and joining date are required.
 */
export function validateEmployee(input, { partial = false } = {}) {
  const out = {};
  const str = (key) => (typeof input[key] === 'string' ? input[key].trim() : input[key] == null ? undefined : String(input[key]).trim());
  const has = (key) => str(key) !== undefined;

  if (!partial || has('id')) {
    const id = (str('id') ?? '').toUpperCase();
    if (!ID_RE.test(id)) throw new EmployeeError('id', 'Employee ID must be 2–20 letters, numbers, - or _ (e.g. EMP042).');
    out.id = id;
  }
  if (!partial || has('name')) {
    const name = str('name') ?? '';
    if (!name || name.length > 100) throw new EmployeeError('name', 'Enter the employee’s full name.');
    out.name = name;
  }
  if (!partial || has('email')) {
    const email = (str('email') ?? '').toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 120) throw new EmployeeError('email', 'Enter a valid email address.');
    out.email = email;
  }
  if (!partial || has('joinedOn')) {
    const joinedOn = str('joinedOn') ?? '';
    if (!isValidDate(joinedOn)) throw new EmployeeError('joinedOn', 'Joining date must be a valid date.');
    out.joinedOn = joinedOn;
  }
  for (const [key, max] of [['phone', 40], ['department', 60], ['designation', 80]]) {
    if (!partial || has(key)) {
      const value = str(key) ?? '';
      if (value.length > max) throw new EmployeeError(key, `${key[0].toUpperCase()}${key.slice(1)} is too long.`);
      out[key] = value;
    }
  }
  if (has('active') || !partial) out.active = input.active === undefined ? true : input.active === true || input.active === 'true';
  if (has('password') && str('password') !== '') {
    if (str('password').length < MIN_PASSWORD_LENGTH) {
      throw new EmployeeError('password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    out.password = str('password');
  }
  return out;
}

function translateUniqueViolation(err) {
  if (err.code !== '23505') return err;
  if (err.constraint === 'employees_pkey') return new HttpError(409, 'EMPLOYEE_EXISTS', 'An employee with this ID already exists.', { field: 'id' });
  if (err.constraint === 'employees_email_key') return new HttpError(409, 'EMAIL_TAKEN', 'Another employee already uses this email.', { field: 'email' });
  return err;
}

/** Inserts or updates one employee using `db` (the pool or a transaction client). */
export async function saveEmployee(db, data, { create }) {
  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;
  try {
    if (create) {
      if (!passwordHash) throw new EmployeeError('password', `Set a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      const { rows } = await db.query(
        `INSERT INTO employees (id, name, email, phone, department, designation, joined_on, active, deactivated_on, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 THEN NULL ELSE current_date END, $9) RETURNING *`,
        [data.id, data.name, data.email, data.phone, data.department, data.designation, data.joinedOn, data.active, passwordHash],
      );
      return toEmployee(rows[0]);
    }
    const { rows } = await db.query(
      `UPDATE employees SET
         name = COALESCE($2, name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         department = COALESCE($5, department),
         designation = COALESCE($6, designation),
         joined_on = COALESCE($7, joined_on),
         deactivated_on = CASE
           WHEN $8::boolean IS NULL THEN deactivated_on
           WHEN $8 THEN NULL
           WHEN active THEN current_date
           ELSE deactivated_on END,
         active = COALESCE($8, active),
         password_hash = COALESCE($9, password_hash),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [data.id, data.name, data.email, data.phone, data.department, data.designation, data.joinedOn, data.active ?? null, passwordHash],
    );
    if (!rows[0]) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'This employee no longer exists.');
    return toEmployee(rows[0]);
  } catch (err) {
    throw translateUniqueViolation(err);
  }
}
