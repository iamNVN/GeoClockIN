import pg from 'pg';
import { HttpError } from './errors.js';

const { Pool, types } = pg;

// Keep DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
types.setTypeParser(types.builtins.DATE, (value) => value);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS attendance (
  id                    BIGSERIAL   PRIMARY KEY,
  employee_id           TEXT        NOT NULL,
  work_date             DATE        NOT NULL,
  check_in_at           TIMESTAMPTZ NOT NULL,
  check_in_distance_m   INTEGER     NOT NULL,
  check_in_accuracy_m   INTEGER     NOT NULL,
  check_out_at          TIMESTAMPTZ,
  check_out_distance_m  INTEGER,
  check_out_accuracy_m  INTEGER,
  is_late               BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_one_per_day UNIQUE (employee_id, work_date),
  CONSTRAINT attendance_checkout_after_checkin CHECK (check_out_at IS NULL OR check_out_at >= check_in_at)
);

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

let schemaReady;

/**
 * Creates tables if they don't exist. Runs once per process (i.e. per
 * serverless cold start); the advisory lock serialises concurrent cold starts.
 */
export function ensureSchema() {
  schemaReady ??= applySchema().catch((err) => {
    schemaReady = undefined;
    throw err;
  });
  return schemaReady;
}

async function applySchema() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]);
    await client.query(SCHEMA_SQL);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
  schemaReady = undefined;
}
