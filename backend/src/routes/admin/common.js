// Helpers shared by the admin routes.
import { query } from '../../db.js';
import { HttpError } from '../../errors.js';
import { serializeRecord } from '../../lib/attendance.js';
import { isValidDate, zonedClock } from '../../lib/time.js';

/** Current date and time of day at the office. */
export function officeNow(settings) {
  const instant = new Date();
  return { instant, ...zonedClock(instant, settings.schedule.timezone) };
}

/** A 'YYYY-MM-DD' query parameter, `fallback` when absent. Rejects invalid or future dates. */
export function dateParam(value, fallback, { today, name = 'date' } = {}) {
  if (value == null || value === '') return fallback;
  if (!isValidDate(value)) throw new HttpError(400, 'INVALID_DATE', `The ${name} must be a valid date.`);
  if (today && value > today) throw new HttpError(400, 'FUTURE_DATE', `The ${name} cannot be in the future.`);
  return value;
}

/** All attendance records (serialized) between two dates. */
export async function loadRecords(from, to) {
  const { rows } = await query('SELECT * FROM attendance WHERE work_date BETWEEN $1 AND $2', [from, to]);
  return rows.map(serializeRecord);
}

/** A day row as sent to the dashboard. */
export const rowJson = ({ employee, record, status, isLate }) => ({
  employee: {
    id: employee.id,
    name: employee.name,
    department: employee.department,
    designation: employee.designation,
    active: employee.active,
  },
  record,
  status,
  isLate,
});

export const ATTENDANCE_COLUMNS = [
  { header: 'Date', key: 'date', width: 13 },
  { header: 'Employee ID', key: 'id', width: 13 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Department', key: 'department', width: 18 },
  { header: 'Check In', key: 'checkIn', width: 11 },
  { header: 'Check Out', key: 'checkOut', width: 11 },
  { header: 'Work Hours', key: 'hours', width: 11 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Late', key: 'late', width: 8 },
  { header: 'Check-in Distance (m)', key: 'distance', width: 20 },
  { header: 'Source', key: 'source', width: 10 },
  { header: 'Note', key: 'note', width: 30 },
];

export const STATUS_LABELS = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  not_checked_out: 'Not Checked Out',
  pending: 'Not Checked In',
  off: 'Day Off',
  holiday: 'Holiday',
};

/** Spreadsheet row for one employee-day. */
export function attendanceRow({ date, employee, record, status }, timezone) {
  const time = (iso) => {
    if (!iso) return '';
    const minutes = Math.floor(zonedClock(new Date(iso), timezone).secondsOfDay / 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };
  const worked = record?.workedMinutes;
  return {
    date,
    id: employee.id,
    name: employee.name,
    department: employee.department,
    checkIn: time(record?.checkInAt),
    checkOut: time(record?.checkOutAt),
    hours: worked == null ? '' : `${Math.floor(worked / 60)}h ${worked % 60}m`,
    status: STATUS_LABELS[status] ?? status,
    late: record?.isLate ? 'Yes' : '',
    distance: record?.checkInDistanceM ?? '',
    source: record?.source ?? '',
    note: record?.note ?? '',
  };
}
