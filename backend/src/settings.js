// Organisation settings (company, office geofence, schedule, departments),
// stored in the database and edited from the admin dashboard.
import { query } from './db.js';
import { normalizeSettings, storableSettings } from './lib/settingsSchema.js';
import { maxDate } from './lib/time.js';

// Serverless instances each keep a copy for a few seconds; a save refreshes
// the saving instance at once and the others within CACHE_MS.
const CACHE_MS = 10_000;
let cached;
let cachedAt = 0;

export async function getSettings() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'organization'`);
  cached = normalizeSettings(rows[0].value);
  cachedAt = Date.now();
  return cached;
}

/** Validates and saves settings. Returns the normalized result. */
export async function saveSettings(raw, actor) {
  const settings = normalizeSettings(raw);
  await query(
    `UPDATE settings SET value = $1, updated_at = now(), updated_by = $2 WHERE key = 'organization'`,
    [JSON.stringify(storableSettings(settings)), actor],
  );
  cached = settings;
  cachedAt = Date.now();
  return settings;
}

/** The first date absences can be counted for this employee. */
export function attendanceStartDate(employee, settings) {
  return maxDate(employee.joinedOn, settings.schedule.trackingStartDate);
}

/** Everything the employee app needs about the signed-in user and their office. */
export function sessionPayload(employee, settings) {
  const { schedule, office, company, location } = settings;
  return {
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      designation: employee.designation,
      department: employee.department,
      phone: employee.phone,
      joinedOn: employee.joinedOn,
      attendanceSince: attendanceStartDate(employee, settings),
    },
    company: { name: company.name },
    office: {
      name: office.name,
      address: office.address,
      radiusMeters: office.radiusMeters,
      maxAccuracyMeters: location.maxAccuracyMeters,
    },
    schedule: {
      timezone: schedule.timezone,
      workStart: schedule.workStart,
      workEnd: schedule.workEnd,
      graceMinutes: schedule.graceMinutes,
      workdays: schedule.workdays,
    },
  };
}

export { storableSettings };
