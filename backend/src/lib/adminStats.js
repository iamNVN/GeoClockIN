// Organisation-wide attendance figures for the admin dashboard and reports.
// Pure functions over employees, serialized records and settings.
import { dayStatus, holidayOn, isDayOff } from './attendance.js';
import { addDays, maxDate, minDate, zonedClock } from './time.js';

/** Whether absences can be counted for `employee` on `date`. */
function tracked(employee, date, schedule) {
  if (date < maxDate(employee.joinedOn, schedule.trackingStartDate)) return false;
  if (!employee.active) return Boolean(employee.deactivatedOn) && date < employee.deactivatedOn;
  return true;
}

/**
 * One employee on one date, as the admin sees it:
 * present | late | not_checked_out | absent | pending (today, not in yet) |
 * off (weekend) | holiday | untracked (not employed / not tracked yet).
 */
export function adminDayStatus(employee, date, record, { today, secondsOfDay, schedule }) {
  if (record) return record.checkOutAt ? (record.isLate ? 'late' : 'present') : 'not_checked_out';
  if (!tracked(employee, date, schedule)) return 'untracked';
  return dayStatus(date, null, { today, secondsOfDay, startDate: '0000-00-00', schedule });
}

const byEmployeeDate = (records) => new Map(records.map((r) => [`${r.employeeId}|${r.date}`, r]));

/** Every relevant employee on `date` with their record and status. */
export function buildDayRows({ date, employees, records, today, secondsOfDay, schedule }) {
  const lookup = byEmployeeDate(records);
  const rows = [];
  for (const employee of employees) {
    const record = lookup.get(`${employee.id}|${date}`) ?? null;
    const status = adminDayStatus(employee, date, record, { today, secondsOfDay, schedule });
    if (status === 'untracked') continue;
    rows.push({ employee, record, status, isLate: Boolean(record?.isLate) });
  }
  return rows;
}

export function summarizeDayRows(rows) {
  const s = { expected: 0, attended: 0, onTime: 0, late: 0, absent: 0, pending: 0, notCheckedOut: 0 };
  for (const row of rows) {
    if (isDayOff(row.status)) continue;
    s.expected += 1;
    if (row.record) {
      s.attended += 1;
      if (row.isLate) s.late += 1;
      else s.onTime += 1;
      if (!row.record.checkOutAt) s.notCheckedOut += 1;
    } else if (row.status === 'pending') {
      s.pending += 1;
    } else {
      s.absent += 1;
    }
  }
  s.attendanceRate = s.expected ? Math.round((s.attended / s.expected) * 100) : null;
  return s;
}

/** Attendance per department for a set of day rows. */
export function departmentBreakdown(rows) {
  const map = new Map();
  for (const row of rows) {
    if (isDayOff(row.status)) continue;
    const name = row.employee.department || 'Unassigned';
    const d = map.get(name) ?? { department: name, expected: 0, attended: 0, late: 0, absent: 0 };
    d.expected += 1;
    if (row.record) d.attended += 1;
    if (row.isLate) d.late += 1;
    if (row.status === 'absent') d.absent += 1;
    map.set(name, d);
  }
  return [...map.values()]
    .map((d) => ({ ...d, rate: d.expected ? Math.round((d.attended / d.expected) * 100) : null }))
    .sort((a, b) => b.expected - a.expected || a.department.localeCompare(b.department));
}

const latestEvent = (record) => record.checkOutAt ?? record.checkInAt;

/** Most recent check-ins / check-outs among day rows. */
export function recentActivity(rows, limit = 6) {
  return rows
    .filter((r) => r.record)
    .sort((a, b) => latestEvent(b.record).localeCompare(latestEvent(a.record)))
    .slice(0, limit);
}

/**
 * Totals over a date range (capped at today): per employee, per day, per
 * department, plus a log of every counted employee-day. Pending days (today,
 * before work ends) are not counted as absences.
 */
export function buildRangeStats({ from, to, employees, records, today, secondsOfDay, schedule }) {
  const lookup = byEmployeeDate(records);
  const last = minDate(to, today);
  const perEmployee = new Map(
    employees.map((e) => [e.id, { employee: e, tracked: 0, attended: 0, onTime: 0, late: 0, absent: 0, missingCheckOuts: 0, workedMinutes: 0, checkInMinutes: 0 }]),
  );
  const daily = [];
  const departments = new Map();
  const log = [];

  for (let date = from; date <= last; date = addDays(date, 1)) {
    const day = { date, present: 0, late: 0, absent: 0 };
    for (const employee of employees) {
      const record = lookup.get(`${employee.id}|${date}`) ?? null;
      const status = adminDayStatus(employee, date, record, { today, secondsOfDay, schedule });
      if (status === 'untracked' || isDayOff(status) || status === 'pending') continue;

      const stats = perEmployee.get(employee.id);
      const deptName = employee.department || 'Unassigned';
      const dept = departments.get(deptName) ?? { department: deptName, expected: 0, attended: 0, onTime: 0, late: 0, absent: 0 };
      stats.tracked += 1;
      dept.expected += 1;

      if (record) {
        stats.attended += 1;
        dept.attended += 1;
        stats.checkInMinutes += Math.round(zonedClock(new Date(record.checkInAt), schedule.timezone).secondsOfDay / 60);
        if (record.isLate) {
          stats.late += 1;
          dept.late += 1;
          day.late += 1;
        } else {
          stats.onTime += 1;
          dept.onTime += 1;
          day.present += 1;
        }
        if (record.workedMinutes != null) stats.workedMinutes += record.workedMinutes;
        if (!record.checkOutAt && date < today) stats.missingCheckOuts += 1;
      } else {
        stats.absent += 1;
        dept.absent += 1;
        day.absent += 1;
      }
      departments.set(deptName, dept);
      log.push({ date, employee, record, status });
    }
    daily.push(day);
  }

  const employeeRows = [...perEmployee.values()]
    .filter((s) => s.tracked > 0)
    .map(({ checkInMinutes, ...s }) => ({
      ...s,
      rate: s.tracked ? Math.round((s.attended / s.tracked) * 100) : null,
      averageCheckInMinutes: s.attended ? Math.round(checkInMinutes / s.attended) : null,
    }))
    .sort((a, b) => a.employee.name.localeCompare(b.employee.name));

  const totals = employeeRows.reduce(
    (t, s) => ({
      tracked: t.tracked + s.tracked,
      attended: t.attended + s.attended,
      onTime: t.onTime + s.onTime,
      late: t.late + s.late,
      absent: t.absent + s.absent,
      missingCheckOuts: t.missingCheckOuts + s.missingCheckOuts,
      workedMinutes: t.workedMinutes + s.workedMinutes,
    }),
    { tracked: 0, attended: 0, onTime: 0, late: 0, absent: 0, missingCheckOuts: 0, workedMinutes: 0 },
  );
  totals.employees = employeeRows.length;
  totals.rate = totals.tracked ? Math.round((totals.attended / totals.tracked) * 1000) / 10 : null;

  return {
    totals,
    employees: employeeRows,
    daily,
    departments: [...departments.values()]
      .map((d) => ({ ...d, rate: d.expected ? Math.round((d.attended / d.expected) * 100) : null }))
      .sort((a, b) => b.expected - a.expected),
    log,
  };
}

/**
 * The employee daily report: every day from `from` to `to` (capped at today)
 * for each employee, ordered by employee and then date. Weekends and holidays
 * are included so each employee's days read like a register; days before an
 * employee joined, or after they left, are not.
 */
export function buildDailyDetail({ from, to, employees, records, today, secondsOfDay, schedule }) {
  const lookup = byEmployeeDate(records);
  const last = minDate(to, today);
  const rows = [];
  const ordered = [...employees].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const employee of ordered) {
    for (let date = from; date <= last; date = addDays(date, 1)) {
      const record = lookup.get(`${employee.id}|${date}`) ?? null;
      const status = adminDayStatus(employee, date, record, { today, secondsOfDay, schedule });
      if (status === 'untracked') continue;
      rows.push({ date, employee, record, status, holiday: holidayOn(date, schedule) });
    }
  }
  return rows;
}

/** Minutes after the start of work a late check-in happened, else null. */
export function minutesLate(record, schedule) {
  if (!record?.isLate) return null;
  const minutes = Math.floor(zonedClock(new Date(record.checkInAt), schedule.timezone).secondsOfDay / 60);
  return Math.max(0, minutes - schedule.workStartMinutes);
}
