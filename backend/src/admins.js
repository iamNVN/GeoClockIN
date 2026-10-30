// Admin accounts for the dashboard.
import { query } from './db.js';

const toAdmin = (row) =>
  row && {
    id: String(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    passwordChangedAt: row.password_changed_at,
  };

export async function findAdminById(id) {
  if (!/^\d+$/.test(String(id ?? ''))) return null;
  const { rows } = await query('SELECT * FROM admins WHERE id = $1', [id]);
  return toAdmin(rows[0]);
}

export async function findAdminByEmail(email) {
  const { rows } = await query('SELECT * FROM admins WHERE lower(email) = lower($1)', [email.trim()]);
  return toAdmin(rows[0]);
}

export async function updateAdmin(id, { name, email, passwordHash }) {
  const { rows } = await query(
    `UPDATE admins SET name = COALESCE($2, name), email = COALESCE($3, email),
       password_hash = COALESCE($4, password_hash), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, name ?? null, email ?? null, passwordHash ?? null],
  );
  return toAdmin(rows[0]);
}

export const publicAdmin = ({ passwordHash, passwordChangedAt, ...admin }) => admin;
