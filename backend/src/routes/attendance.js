import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { query } from '../db.js';
import { HttpError } from '../errors.js';
import {
  buildMonth,
  buildRange,
  buildWeek,
  isLateCheckIn,
  serializeRecord,
  summarizeMonth,
  todayState,
} from '../lib/attendance.js';
import { parseCoordinates, verifyLocation } from '../lib/geo.js';
import { addDays, minDate, monthBounds, startOfWeek, zonedClock } from '../lib/time.js';
import { attendanceStartDate, getSettings } from '../settings.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const router = Router();
router.use(requireAuth);
// Office, geofence and schedule as currently configured by the admin.
router.use(async (req, res, next) => {
  req.settings = await getSettings();
  next();
});

const now = (settings) => {
  const instant = new Date();
  return { instant, ...zonedClock(instant, settings.schedule.timezone) };
};

const verify = (coords, settings) => verifyLocation(coords, settings.office, settings.location.maxAccuracyMeters);

async function findRecord(employeeId, date) {
  const { rows } = await query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [employeeId, date]);
  return rows[0];
}

async function logAttempt(employeeId, action, outcome, verification) {
  await query(
    'INSERT INTO attendance_attempts (employee_id, action, outcome, distance_m, accuracy_m) VALUES ($1, $2, $3, $4, $5)',
    [employeeId, action, outcome, verification?.distanceM ?? null, verification?.accuracyM ?? null],
  );
}

/** Rejects with 422 when the reported location fails the geofence policy. */
async function requireVerifiedLocation(employeeId, action, coords, settings) {
  const verification = verify(coords, settings);
  if (!verification.ok) {
    await logAttempt(employeeId, action, verification.code.toLowerCase(), verification);
    throw new HttpError(422, `LOCATION_${verification.code}`, verification.message, { verification });
  }
  return verification;
}

async function rejectSequence(employeeId, action, code, message) {
  await logAttempt(employeeId, action, code.toLowerCase());
  throw new HttpError(409, code, message);
}

router.get('/today', async (req, res) => {
  const { instant, date } = now(req.settings);
  const record = serializeRecord(await findRecord(req.employee.id, date));
  res.json({ serverTime: instant.toISOString(), ...todayState(date, record, req.settings.schedule) });
});

// Everything the home screen shows, in one request: today's status, this
// week, this month's summary and the most recent attendance days.
router.get('/overview', async (req, res) => {
  const { schedule } = req.settings;
  const { instant, date: today, secondsOfDay } = now(req.settings);
  const month = today.slice(0, 7);
  const weekStart = startOfWeek(today);
  const recentStart = addDays(today, -13);
  const from = minDate(minDate(monthBounds(month).first, weekStart), recentStart);

  const { rows } = await query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3',
    [req.employee.id, from, addDays(weekStart, 6)],
  );
  const records = rows.map(serializeRecord);
  const startDate = attendanceStartDate(req.employee, req.settings);
  const context = { records, today, secondsOfDay, startDate, schedule };

  res.json({
    serverTime: instant.toISOString(),
    today: todayState(today, records.find((r) => r.date === today) ?? null, schedule),
    week: buildWeek(context),
    month: { month, summary: summarizeMonth(buildMonth({ month, ...context }), schedule.timezone) },
    recent: buildRange({ from: recentStart, to: today, ...context }).slice(0, 3),
  });
});

// Lets the app show "Location Verified" before the employee confirms.
// Nothing is stored; check-in / check-out re-verify independently.
router.post('/verify-location', (req, res) => {
  res.json({ verification: verify(parseCoordinates(req.body), req.settings) });
});

router.post('/check-in', async (req, res) => {
  const coords = parseCoordinates(req.body);
  const { instant, date, secondsOfDay } = now(req.settings);
  const employeeId = req.employee.id;

  if (await findRecord(employeeId, date)) {
    await rejectSequence(employeeId, 'check_in', 'ALREADY_CHECKED_IN', 'You have already clocked in today.');
  }
  const verification = await requireVerifiedLocation(employeeId, 'check_in', coords, req.settings);

  // The unique (employee_id, work_date) constraint makes concurrent duplicate
  // check-ins a no-op rather than a second record.
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, work_date, check_in_at, check_in_distance_m, check_in_accuracy_m, is_late)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, work_date) DO NOTHING
     RETURNING *`,
    [
      employeeId,
      date,
      instant,
      verification.distanceM,
      verification.accuracyM,
      isLateCheckIn(date, secondsOfDay, req.settings.schedule),
    ],
  );
  if (!rows[0]) {
    await rejectSequence(employeeId, 'check_in', 'ALREADY_CHECKED_IN', 'You have already clocked in today.');
  }

  await logAttempt(employeeId, 'check_in', 'accepted', verification);
  res.status(201).json({ record: serializeRecord(rows[0]), verification });
});

router.post('/check-out', async (req, res) => {
  const coords = parseCoordinates(req.body);
  const { instant, date } = now(req.settings);
  const employeeId = req.employee.id;

  const existing = await findRecord(employeeId, date);
  if (!existing) {
    await rejectSequence(employeeId, 'check_out', 'NOT_CHECKED_IN', 'You need to clock in before you can clock out.');
  }
  if (existing.check_out_at) {
    await rejectSequence(employeeId, 'check_out', 'ALREADY_CHECKED_OUT', 'You have already clocked out today.');
  }
  const verification = await requireVerifiedLocation(employeeId, 'check_out', coords, req.settings);

  const { rows } = await query(
    `UPDATE attendance
        SET check_out_at = $3, check_out_distance_m = $4, check_out_accuracy_m = $5, updated_at = now()
      WHERE employee_id = $1 AND work_date = $2 AND check_out_at IS NULL
      RETURNING *`,
    [employeeId, date, instant, verification.distanceM, verification.accuracyM],
  );
  if (!rows[0]) {
    await rejectSequence(employeeId, 'check_out', 'ALREADY_CHECKED_OUT', 'You have already clocked out today.');
  }

  await logAttempt(employeeId, 'check_out', 'accepted', verification);
  res.json({ record: serializeRecord(rows[0]), verification });
});

// Only ever returns the signed-in employee's own records.
router.get('/history', async (req, res) => {
  const { schedule } = req.settings;
  const { date: today, secondsOfDay } = now(req.settings);
  const month = req.query.month ?? today.slice(0, 7);
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    throw new HttpError(400, 'INVALID_MONTH', 'Month must be in YYYY-MM format.');
  }

  const { first, last } = monthBounds(month);
  const { rows } = await query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3',
    [req.employee.id, first, last],
  );
  const days = buildMonth({
    month,
    records: rows.map(serializeRecord),
    today,
    secondsOfDay,
    startDate: attendanceStartDate(req.employee, req.settings),
    schedule,
  });

  res.json({ month, today, days, summary: summarizeMonth(days, schedule.timezone) });
});

export default router;
