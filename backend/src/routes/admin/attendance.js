import express, { Router } from 'express';
import { audit } from '../../audit.js';
import { query, transaction } from '../../db.js';
import { findEmployeeById, listEmployees } from '../../employees.js';
import { HttpError } from '../../errors.js';
import { buildDayRows, summarizeDayRows } from '../../lib/adminStats.js';
import { holidayOn, isDayOff, isLateCheckIn, serializeRecord } from '../../lib/attendance.js';
import { addHowToSheet, addImportSheet, addTable, cellDate, cellMinutes, cellText, newWorkbook, readUploadedSheet, sendWorkbook } from '../../lib/excel.js';
import { addDays, isValidDate, parseClock, zonedClock, zonedTimeToUtc } from '../../lib/time.js';
import { ATTENDANCE_COLUMNS, attendanceRow, dateParam, loadRecords, officeNow, rowJson } from './common.js';

const router = Router();
const MAX_EXPORT_DAYS = 366;
const uploadBody = express.raw({ type: () => true, limit: '5mb' });

// All employees on one date with their attendance and status.
router.get('/', async (req, res) => {
  const { schedule } = req.settings;
  const { date: today, secondsOfDay } = officeNow(req.settings);
  const date = dateParam(req.query.date, today, { today });
  const [employees, records] = await Promise.all([listEmployees(), loadRecords(date, date)]);
  const rows = buildDayRows({ date, employees, records, today, secondsOfDay, schedule });
  res.json({
    date,
    today,
    holiday: holidayOn(date, schedule),
    kpis: summarizeDayRows(rows),
    rows: rows.map(rowJson),
    departments: req.settings.departments,
  });
});

/** Validates an admin-entered or imported day and returns the instants to store. */
function resolveTimes(date, checkInMinutes, checkOutMinutes, settings) {
  const { timezone } = settings.schedule;
  const checkInAt = zonedTimeToUtc(date, checkInMinutes, timezone);
  const checkOutAt = checkOutMinutes == null ? null : zonedTimeToUtc(date, checkOutMinutes, timezone);
  if (checkOutAt && checkOutAt <= checkInAt) throw new HttpError(400, 'INVALID_TIMES', 'Check-out must be later than check-in.');
  const isLate = isLateCheckIn(date, zonedClock(checkInAt, timezone).secondsOfDay, settings.schedule);
  return { checkInAt, checkOutAt, isLate };
}

async function upsertRecord(db, { employeeId, date, checkInAt, checkOutAt, isLate, source, note, actor }) {
  const { rows } = await db.query(
    `INSERT INTO attendance (employee_id, work_date, check_in_at, check_out_at, is_late, source, note, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       check_in_at = EXCLUDED.check_in_at,
       check_out_at = EXCLUDED.check_out_at,
       is_late = EXCLUDED.is_late,
       source = EXCLUDED.source,
       note = EXCLUDED.note,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [employeeId, date, checkInAt, checkOutAt, isLate, source, note || null, actor],
  );
  return serializeRecord(rows[0]);
}

// Correct one employee's day. checkIn: null clears the record (marks absent).
router.put('/:employeeId/:date', async (req, res) => {
  const { date: today } = officeNow(req.settings);
  const { date } = req.params;
  if (!isValidDate(date) || date > today) throw new HttpError(400, 'INVALID_DATE', 'Choose a valid date that is not in the future.');
  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'This employee no longer exists.');

  const { checkIn, checkOut, note } = req.body ?? {};
  const before = (await query('SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2', [employee.id, date])).rows[0];

  if (checkIn == null || checkIn === '') {
    await query('DELETE FROM attendance WHERE employee_id = $1 AND work_date = $2', [employee.id, date]);
    await audit(null, req.admin, 'attendance.clear', 'attendance', `${employee.id}/${date}`, { before: before && serializeRecord(before), note });
    return res.json({ record: null });
  }

  const inMinutes = parseClock(checkIn);
  const outMinutes = checkOut ? parseClock(checkOut) : null;
  if (inMinutes == null || (checkOut && outMinutes == null)) {
    throw new HttpError(400, 'INVALID_TIMES', 'Enter times like 09:05 or 6:00 PM.');
  }
  const times = resolveTimes(date, inMinutes, outMinutes, req.settings);
  const record = await upsertRecord({ query }, {
    employeeId: employee.id,
    date,
    ...times,
    source: 'admin',
    note: typeof note === 'string' ? note.trim().slice(0, 300) : null,
    actor: req.admin.email,
  });
  await audit(null, req.admin, before ? 'attendance.update' : 'attendance.create', 'attendance', `${employee.id}/${date}`, {
    before: before && serializeRecord(before),
    after: record,
  });
  res.json({ record });
});

// Attendance log for one date or a range, as .xlsx.
router.get('/export', async (req, res) => {
  const { schedule } = req.settings;
  const { date: today, secondsOfDay } = officeNow(req.settings);
  const to = dateParam(req.query.to ?? req.query.date, today, { today, name: 'end date' });
  const from = dateParam(req.query.from ?? req.query.date, to, { today, name: 'start date' });
  if (from > to) throw new HttpError(400, 'INVALID_RANGE', 'The start date must be before the end date.');
  if (addDays(from, MAX_EXPORT_DAYS) < to) throw new HttpError(400, 'RANGE_TOO_LONG', 'Export at most one year at a time.');

  const [employees, records] = await Promise.all([listEmployees(), loadRecords(from, to)]);
  const rows = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const row of buildDayRows({ date, employees, records, today, secondsOfDay, schedule })) {
      if (!isDayOff(row.status) || row.record) rows.push(attendanceRow({ date, ...row }, schedule.timezone));
    }
  }
  const workbook = newWorkbook();
  addTable(workbook, 'Attendance', ATTENDANCE_COLUMNS, rows);
  await sendWorkbook(res, workbook, from === to ? `attendance-${from}.xlsx` : `attendance-${from}-to-${to}.xlsx`);
});

const IMPORT_COLUMNS = [
  { header: 'Employee ID', key: 'id', width: 14 },
  { header: 'Date', key: 'date', width: 13 },
  { header: 'Check In', key: 'checkIn', width: 11 },
  { header: 'Check Out', key: 'checkOut', width: 11 },
  { header: 'Note', key: 'note', width: 30 },
];

// An empty sheet to fill in; the example lives on the "How to fill" sheet.
router.get('/template', async (req, res) => {
  const employees = (await listEmployees()).filter((e) => e.active);
  const workbook = newWorkbook();
  addImportSheet(workbook, 'Attendance', IMPORT_COLUMNS, { id: employees.map((e) => e.id) });
  addHowToSheet(
    workbook,
    [
      'One row per employee per day. A row replaces any existing record for that employee and date.',
      'Required: Employee ID, Date (YYYY-MM-DD or DD/MM/YYYY) and Check In. Check Out and Note are optional.',
      'Times are office time, as 09:05 or 9:05 AM. Dates cannot be in the future.',
      'If any row has a problem, nothing is imported and every problem is listed.',
    ],
    IMPORT_COLUMNS,
    [{ id: employees[0]?.id ?? 'EMP001', date: '2026-10-01', checkIn: '09:02', checkOut: '18:05', note: 'Paper register' }],
  );
  await sendWorkbook(res, workbook, 'attendance-import-template.xlsx');
});

const IMPORT_ALIASES = {
  employeeid: 'id',
  empid: 'id',
  id: 'id',
  date: 'date',
  workdate: 'date',
  checkin: 'checkIn',
  checkintime: 'checkIn',
  in: 'checkIn',
  checkout: 'checkOut',
  checkouttime: 'checkOut',
  out: 'checkOut',
  note: 'note',
  notes: 'note',
  remarks: 'note',
};

// Bulk add or replace attendance (e.g. from paper registers). All-or-nothing:
// if any row is invalid, nothing is imported and every problem is listed.
router.post('/import', uploadBody, async (req, res) => {
  const { date: today } = officeNow(req.settings);
  const rows = await readUploadedSheet(req.body, IMPORT_ALIASES);
  if (rows.length === 0) throw new HttpError(400, 'EMPTY_FILE', 'The file has no attendance rows.');
  if (rows.length > 5000) throw new HttpError(400, 'TOO_MANY_ROWS', 'Import at most 5,000 rows at a time.');

  const employeeIds = new Set((await listEmployees()).map((e) => e.id));
  const errors = [];
  const seen = new Set();
  const valid = [];
  for (const row of rows) {
    const id = cellText(row.id).toUpperCase();
    const date = cellDate(row.date);
    const inMinutes = cellMinutes(row.checkIn);
    const outMinutes = cellText(row.checkOut) === '' ? null : cellMinutes(row.checkOut);
    const fail = (message) => errors.push({ row: row._row, message });
    if (!employeeIds.has(id)) fail(id ? `Unknown employee ID "${id}".` : 'Employee ID is missing.');
    else if (!date) fail('Date is missing or not a valid date.');
    else if (date > today) fail('Date is in the future.');
    else if (inMinutes == null) fail('Check-in time is missing or invalid.');
    else if (cellText(row.checkOut) !== '' && outMinutes == null) fail('Check-out time is invalid.');
    else if (seen.has(`${id}|${date}`)) fail(`Duplicate row for ${id} on ${date}.`);
    else {
      try {
        valid.push({ employeeId: id, date, ...resolveTimes(date, inMinutes, outMinutes, req.settings), note: cellText(row.note).slice(0, 300) });
        seen.add(`${id}|${date}`);
      } catch (err) {
        fail(err.message);
      }
    }
  }
  if (errors.length) throw new HttpError(422, 'IMPORT_INVALID', `${errors.length} row(s) need fixing. Nothing was imported.`, { errors });

  await transaction(async (client) => {
    for (const item of valid) {
      await upsertRecord(client, { ...item, source: 'import', actor: req.admin.email });
    }
    await audit(client, req.admin, 'attendance.import', 'attendance', null, { rows: valid.length });
  });
  res.json({ imported: valid.length });
});

export default router;
