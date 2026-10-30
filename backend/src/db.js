import bcrypt from 'bcryptjs';
import pg from 'pg';
import seed from '../config/geoclockin.config.js';
import { HttpError } from './errors.js';
import { normalizeSettings, storableSettings } from './lib/settingsSchema.js';

const { Pool, types } = pg;

// Keep DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
types.setTypeParser(types.builtins.DATE, (value) => value);

// Idempotent: safe to run on every cold start and on existing databases.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  phone           TEXT        NOT NULL DEFAULT '',
  department      TEXT        NOT NULL DEFAULT '',
  designation     TEXT        NOT NULL DEFAULT '',
  joined_on       DATE        NOT NULL,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  deactivated_on  DATE,
  password_hash   TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_key ON employees (lower(email));

CREATE TABLE IF NOT EXISTS admins (
  id             BIGSERIAL   PRIMARY KEY,
  name           TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  password_hash  TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_key ON admins (lower(email));

-- Sessions signed before an account's last password reset are rejected.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS attendance (
  id                    BIGSERIAL   PRIMARY KEY,
  employee_id           TEXT        NOT NULL,
  work_date             DATE        NOT NULL,
  check_in_at           TIMESTAMPTZ NOT NULL,
  check_in_distance_m   INTEGER,
  check_in_accuracy_m   INTEGER,
  check_out_at          TIMESTAMPTZ,
  check_out_distance_m  INTEGER,
  check_out_accuracy_m  INTEGER,
  is_late               BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_one_per_day UNIQUE (employee_id, work_date),
  CONSTRAINT attendance_checkout_after_checkin CHECK (check_out_at IS NULL OR check_out_at >= check_in_at)
);
-- Records added or corrected by an admin (or imported) have no location reading.
ALTER TABLE attendance ALTER COLUMN check_in_distance_m DROP NOT NULL;
ALTER TABLE attendance ALTER COLUMN check_in_accuracy_m DROP NOT NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_by TEXT;
CREATE INDEX IF NOT EXISTS attendance_work_date_idx ON attendance (work_date);

-- Every check-in / check-out attempt, accepted or rejected, for auditing.
-- Only the distance from the office and the reading's accuracy are kept,
-- never the raw coordinates.
CREATE TABLE IF NOT EXISTS attendance_attempts (
  id           BIGSERIAL   PRIMARY KEY,
  employee_id  TEXT        NOT NULL,
  action       TEXT        NOT NULL CHECK (action IN ('check_in', 'check_out')),
  outcome      TEXT        NOT NULL,
  distance_m   INTEGER,
  accuracy_m   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_attempts_employee_idx
  ON attendance_attempts (employee_id, created_at DESC);

-- Company logo uploaded from the dashboard; replaces the default logo in both apps.
CREATE TABLE IF NOT EXISTS branding_assets (
  name          TEXT        PRIMARY KEY,
  content_type  TEXT        NOT NULL,
  data          BYTEA       NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Administrative changes: employees, settings and attendance corrections.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  actor       TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  entity      TEXT        NOT NULL,
  entity_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time password reset links sent by email; only a hash of each token is kept.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  TEXT        PRIMARY KEY,
  role        TEXT        NOT NULL CHECK (role IN ('employee', 'admin')),
  subject_id  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_subject_idx
  ON password_resets (role, subject_id, created_at DESC);
`;

// Arbitrary constant identifying the schema-migration advisory lock.
const SCHEMA_LOCK_ID = 7_245_010;

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new HttpError(503, 'DATABASE_NOT_CONFIGURED', 'The attendance service is not configured yet. Please contact your administrator.');
    }
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.error('Idle database client error:', err.message));
  }
  return pool;
}

/** First run only: organisation settings, employees and admins from config/geoclockin.config.js. */
async function seedIfEmpty(client) {
  await client.query(
    `INSERT INTO settings (key, value, updated_by) VALUES ('organization', $1, 'seed') ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(storableSettings(normalizeSettings(seed)))],
  );

  const { rows: [{ count: employeeCount }] } = await client.query('SELECT count(*)::int AS count FROM employees');
  if (employeeCount === 0) {
    for (const e of seed.employees ?? []) {
      await client.query(
        `INSERT INTO employees (id, name, email, phone, department, designation, joined_on, active, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [e.id.toUpperCase(), e.name, e.email.toLowerCase(), e.phone ?? '', e.department ?? '', e.designation ?? '', e.joinedOn, e.active !== false, e.passwordHash],
      );
    }
  }

  const { rows: [{ count: adminCount }] } = await client.query('SELECT count(*)::int AS count FROM admins');
  if (adminCount === 0) {
    // ADMIN_EMAIL / ADMIN_PASSWORD (if set) replace the demo admin. Vercel
    // deployments are public, so they never get the published demo password:
    // without ADMIN_PASSWORD they start with no admin until it is set.
    const deployed = ['production', 'preview'].includes(process.env.VERCEL_ENV);
    const admins = process.env.ADMIN_PASSWORD
      ? [{ name: 'Admin', email: process.env.ADMIN_EMAIL ?? seed.admins[0].email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10) }]
      : deployed ? [] : seed.admins ?? [];
    if (admins.length === 0) console.warn('No admin account created: set ADMIN_PASSWORD and redeploy.');
    for (const a of admins) {
      await client.query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)', [a.name, a.email.toLowerCase(), a.passwordHash]);
    }
  }
}

let schemaReady;

/**
 * Creates or migrates tables and seeds an empty database. Runs once per
 * process (i.e. per serverless cold start); the advisory lock serialises
 * concurrent cold starts.
 */
export function ensureSchema() {
  schemaReady ??= transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]);
    await client.query(SCHEMA_SQL);
    await seedIfEmpty(client);
  }, { skipSchema: true }).catch((err) => {
    schemaReady = undefined;
    throw err;
  });
  return schemaReady;
}

export async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

/** Runs `fn(client)` inside a transaction. */
export async function transaction(fn, { skipSchema = false } = {}) {
  if (!skipSchema) await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
  schemaReady = undefined;
}
