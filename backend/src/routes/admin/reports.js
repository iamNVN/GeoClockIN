import { Router } from 'express';
import { listEmployees, publicEmployee } from '../../employees.js';
import { HttpError } from '../../errors.js';
import { buildDailyDetail, buildRangeStats, minutesLate } from '../../lib/adminStats.js';
import { addKeyValueSheet, addTable, newWorkbook, sendWorkbook } from '../../lib/excel.js';
import { addDays, monthBounds, weekdayOf } from '../../lib/time.js';
import { ATTENDANCE_COLUMNS, attendanceRow, dateParam, loadRecords, officeNow, STATUS_LABELS } from './common.js';

const router = Router();
const MAX_RANGE_DAYS = 366;
// The on-screen daily report stops here; the Excel export has every row.
const MAX_DAILY_PREVIEW_ROWS = 5000;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const REPORT_TYPES = {
  summary: 'Attendance Summary',
  department: 'Department Wise',
  employee: 'Employee Wise',
  daily: 'Employee Daily',
  late: 'Late Arrivals',
  absent: 'Absences',
  not_checked_out: 'Not Checked Out',
};

/** Parses the shared report filters and loads the matching employees and records. */
async function reportInput(req) {
  const { schedule } = req.settings;
  const { date: today, secondsOfDay } = officeNow(req.settings);
  const to = dateParam(req.query.to, today, { today, name: 'end date' });
  const from = dateParam(req.query.from, monthBounds(to.slice(0, 7)).first, { today, name: 'start date' });
  if (from > to) throw new HttpError(400, 'INVALID_RANGE', 'The start date must be before the end date.');
  if (addDays(from, MAX_RANGE_DAYS) < to) throw new HttpError(400, 'RANGE_TOO_LONG', 'Choose a range of at most one year.');

  const department = typeof req.query.department === 'string' && req.query.department ? req.query.department : null;
  const employeeId = typeof req.query.employee === 'string' && req.query.employee ? req.query.employee.toUpperCase() : null;

  const all = await listEmployees();
  const employees = all.filter(
    (e) => (!department || e.department === department) && (!employeeId || e.id === employeeId),
  );
  const records = await loadRecords(from, to);
  return { from, to, today, department, employeeId, allEmployees: all, context: { from, to, employees, records, today, secondsOfDay, schedule } };
}

/** The report filters plus the range statistics. */
async function reportFor(req) {
  const { context, ...input } = await reportInput(req);
  return { ...input, stats: buildRangeStats(context), context };
}

// One row per employee per day, for the "Employee Daily" view.
router.get('/daily', async (req, res) => {
  const { from, to, context } = await reportInput(req);
  const rows = buildDailyDetail(context);
  res.json({
    from,
    to,
    total: rows.length,
    truncated: rows.length > MAX_DAILY_PREVIEW_ROWS,
    rows: rows.slice(0, MAX_DAILY_PREVIEW_ROWS).map(({ date, employee, record, status, holiday }) => ({
      date,
      employee: { id: employee.id, name: employee.name, department: employee.department },
      record,
      status,
      holiday,
      minutesLate: minutesLate(record, context.schedule),
    })),
  });
});

router.get('/', async (req, res) => {
  const { from, to, today, department, employeeId, stats, allEmployees } = await reportFor(req);
  const late = stats.log.filter((d) => d.record?.isLate);
  const absences = stats.log.filter((d) => d.status === 'absent');
  const missing = stats.log.filter((d) => d.record && !d.record.checkOutAt && d.date < today);
  const brief = ({ date, employee, record, status }) => ({
    date,
    employee: { id: employee.id, name: employee.name, department: employee.department },
    record,
    status,
  });

  res.json({
    from,
    to,
    today,
    filters: { department, employee: employeeId },
    totals: stats.totals,
    daily: stats.daily,
    departments: stats.departments,
    employees: stats.employees.map((s) => ({ ...s, employee: publicEmployee(s.employee) })),
    late: late.map(brief),
    absences: absences.map(brief),
    notCheckedOut: missing.map(brief),
    options: {
      departments: req.settings.departments,
      employees: allEmployees.map((e) => ({ id: e.id, name: e.name, department: e.department })),
    },
  });
});

const hours = (minutes) => (minutes ? Math.round((minutes / 60) * 10) / 10 : 0);
const timeOf = (minutes) =>
  minutes == null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// The report as a workbook: a summary sheet plus one sheet per view. The
// requested report type comes first.
router.get('/export', async (req, res) => {
  const { from, to, today, department, employeeId, stats, context } = await reportFor(req);
  const type = REPORT_TYPES[req.query.type] ? req.query.type : 'summary';
  const tz = req.settings.schedule.timezone;
  const workbook = newWorkbook();

  addKeyValueSheet(workbook, 'Summary', [
    ['Report', REPORT_TYPES[type]],
    ['Organisation', req.settings.company.name],
    ['Period', `${from} to ${to}`],
    ['Department', department ?? 'All departments'],
    ['Employee', employeeId ?? 'All employees'],
    ['Generated', new Date().toISOString()],
    [],
    ['Employees', stats.totals.employees],
    ['Tracked employee-days', stats.totals.tracked],
    ['Present (on time)', stats.totals.onTime],
    ['Late', stats.totals.late],
    ['Absent', stats.totals.absent],
    ['Missing check-outs', stats.totals.missingCheckOuts],
    ['Attendance rate (%)', stats.totals.rate ?? ''],
    ['Total hours worked', hours(stats.totals.workedMinutes)],
  ]);

  const sheets = {
    employee: () =>
      addTable(
        workbook,
        'Employee Wise',
        [
          { header: 'Employee ID', key: 'id', width: 13 },
          { header: 'Name', key: 'name', width: 24 },
          { header: 'Department', key: 'department', width: 18 },
          { header: 'Tracked Days', key: 'tracked', width: 13 },
          { header: 'Present', key: 'attended', width: 10 },
          { header: 'On Time', key: 'onTime', width: 10 },
          { header: 'Late', key: 'late', width: 8 },
          { header: 'Absent', key: 'absent', width: 9 },
          { header: 'Missing Check-outs', key: 'missing', width: 18 },
          { header: 'Hours Worked', key: 'hours', width: 13 },
          { header: 'Avg Check-in', key: 'avgIn', width: 13 },
          { header: 'Attendance %', key: 'rate', width: 13 },
        ],
        stats.employees.map((s) => ({
          id: s.employee.id,
          name: s.employee.name,
          department: s.employee.department,
          tracked: s.tracked,
          attended: s.attended,
          onTime: s.onTime,
          late: s.late,
          absent: s.absent,
          missing: s.missingCheckOuts,
          hours: hours(s.workedMinutes),
          avgIn: timeOf(s.averageCheckInMinutes),
          rate: s.rate ?? '',
        })),
      ),
    department: () =>
      addTable(
        workbook,
        'Department Wise',
        [
          { header: 'Department', key: 'department', width: 22 },
          { header: 'Expected Days', key: 'expected', width: 14 },
          { header: 'Present', key: 'attended', width: 10 },
          { header: 'On Time', key: 'onTime', width: 10 },
          { header: 'Late', key: 'late', width: 8 },
          { header: 'Absent', key: 'absent', width: 9 },
          { header: 'Attendance %', key: 'rate', width: 13 },
        ],
        stats.departments,
      ),
    summary: () =>
      addTable(
        workbook,
        'Daily Trend',
        [
          { header: 'Date', key: 'date', width: 13 },
          { header: 'Present (on time)', key: 'present', width: 17 },
          { header: 'Late', key: 'late', width: 8 },
          { header: 'Absent', key: 'absent', width: 9 },
        ],
        stats.daily,
      ),
    late: () => addTable(workbook, 'Late Arrivals', ATTENDANCE_COLUMNS, stats.log.filter((d) => d.record?.isLate).map((d) => attendanceRow(d, tz))),
    absent: () => addTable(workbook, 'Absences', ATTENDANCE_COLUMNS, stats.log.filter((d) => d.status === 'absent').map((d) => attendanceRow(d, tz))),
    not_checked_out: () =>
      addTable(
        workbook,
        'Not Checked Out',
        ATTENDANCE_COLUMNS,
        stats.log.filter((d) => d.record && !d.record.checkOutAt && d.date < today).map((d) => attendanceRow(d, tz)),
      ),
  };
  // The daily sheet can be long, so it is only in the daily report.
  if (type === 'daily') addDailySheet(workbook, buildDailyDetail(context), req.settings.schedule);
  for (const key of [type, ...Object.keys(sheets).filter((k) => k !== type)]) sheets[key]?.();
  addTable(workbook, 'Attendance Log', ATTENDANCE_COLUMNS, stats.log.map((d) => attendanceRow(d, tz)));

  await sendWorkbook(res, workbook, `report-${type}-${from}-to-${to}.xlsx`);
});

/** "Employee Daily" sheet: each employee's days with times, hours, lateness and location. */
function addDailySheet(workbook, rows, schedule) {
  const tz = schedule.timezone;
  addTable(
    workbook,
    'Employee Daily',
    [
      { header: 'Employee ID', key: 'id', width: 13 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Date', key: 'date', width: 13 },
      { header: 'Day', key: 'day', width: 7 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Holiday', key: 'holiday', width: 22 },
      { header: 'Check In', key: 'checkIn', width: 11 },
      { header: 'Check Out', key: 'checkOut', width: 11 },
      { header: 'Work Hours', key: 'hours', width: 11 },
      { header: 'Late By (min)', key: 'lateBy', width: 13 },
      { header: 'Check-in Distance (m)', key: 'inDistance', width: 20 },
      { header: 'Check-out Distance (m)', key: 'outDistance', width: 21 },
      { header: 'Office QR', key: 'qr', width: 14 },
      { header: 'Source', key: 'source', width: 10 },
      { header: 'Note', key: 'note', width: 30 },
    ],
    rows.map((row) => {
      const base = attendanceRow(row, tz);
      return {
        ...base,
        day: WEEKDAY_NAMES[weekdayOf(row.date)],
        status: STATUS_LABELS[row.status] ?? row.status,
        holiday: row.holiday ?? '',
        lateBy: minutesLate(row.record, schedule) ?? '',
        inDistance: row.record?.checkInDistanceM ?? '',
        outDistance: row.record?.checkOutDistanceM ?? '',
      };
    }),
  );
}

export default router;
