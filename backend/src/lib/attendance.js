// Attendance business rules. Pure functions: no I/O, so they are easy to test.
import { addDays, minDate, monthBounds, startOfWeek, weekdayOf, zonedClock } from './time.js';

export function isWorkday(date, schedule) {
  return schedule.workdays.includes(weekdayOf(date)) && !schedule.holidayDates.includes(date);
}

/** Late = checked in on a workday after workStart + grace period (to the second). */
export function isLateCheckIn(date, secondsOfDay, schedule) {
  return isWorkday(date, schedule) && secondsOfDay > (schedule.workStartMinutes + schedule.graceMinutes) * 60;
}

/** Database row → API shape. */
export function serializeRecord(row) {
  if (!row) return null;
  const checkIn = row.check_in_at;
  const checkOut = row.check_out_at;
  return {
    date: row.work_date,
    checkInAt: checkIn.toISOString(),
    checkOutAt: checkOut ? checkOut.toISOString() : null,
    isLate: row.is_late,
    workedMinutes: checkOut ? Math.round((checkOut - checkIn) / 60_000) : null,
    checkInDistanceM: row.check_in_distance_m,
    checkInAccuracyM: row.check_in_accuracy_m,
    checkOutDistanceM: row.check_out_distance_m,
    checkOutAccuracyM: row.check_out_accuracy_m,
    employeeId: row.employee_id,
    source: row.source ?? 'app',
    note: row.note ?? null,
  };
}

/** Today's attendance state and which action is allowed next. */
export function todayState(date, record, schedule) {
  const status = !record ? 'not_checked_in' : record.checkOutAt ? 'checked_out' : 'checked_in';
  return {
    date,
    isWorkday: isWorkday(date, schedule),
    status,
    canCheckIn: status === 'not_checked_in',
    canCheckOut: status === 'checked_in',
    record,
  };
}

/**
 * Attendance status of a single date:
 * - `present` / `late`: checked in (on time / after the grace period).
 * - `absent`: a workday on or after `startDate` with no check-in, once it has
 *   passed (today counts as passed after workEnd).
 * - `pending`: a workday still to come, or today before workEnd.
 * - `off`: weekend, holiday, or before `startDate`.
 */
export function dayStatus(date, record, { today, secondsOfDay, startDate, schedule }) {
  if (record) return record.isLate ? 'late' : 'present';
  if (date < startDate || !isWorkday(date, schedule)) return 'off';
  if (date > today || (date === today && secondsOfDay < schedule.workEndMinutes * 60)) return 'pending';
  return 'absent';
}

/**
 * Attended and absent days between `from` and `to` (capped at today), newest
 * first. `missingCheckOut` is set when a past day was never checked out.
 */
export function buildRange({ from, to, records, ...context }) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const days = [];

  for (let date = from; date <= minDate(to, context.today); date = addDays(date, 1)) {
    const record = byDate.get(date) ?? null;
    const status = dayStatus(date, record, context);
    if (status === 'off' || status === 'pending') continue;
    days.push({ date, status, missingCheckOut: Boolean(record && !record.checkOutAt && date < context.today), record });
  }

  return days.reverse();
}

/** Day-by-day attendance for one 'YYYY-MM' month, newest first. */
export function buildMonth({ month, ...rest }) {
  const { first, last } = monthBounds(month);
  return buildRange({ from: first, to: last, ...rest });
}

/** Monday–Sunday of the current week, each with its status. */
export function buildWeek({ records, ...context }) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const monday = startOfWeek(context.today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, status: dayStatus(date, byDate.get(date) ?? null, context) };
  });
}

export function summarizeMonth(days, timeZone) {
  const counts = { present: 0, late: 0, absent: 0 };
  let attendedDays = 0;
  let checkInSeconds = 0;
  let completedDays = 0;
  let workedMinutes = 0;
  let missingCheckOuts = 0;

  for (const day of days) {
    counts[day.status] += 1;
    if (!day.record) continue;
    attendedDays += 1;
    checkInSeconds += zonedClock(new Date(day.record.checkInAt), timeZone).secondsOfDay;
    if (day.record.workedMinutes != null) {
      completedDays += 1;
      workedMinutes += day.record.workedMinutes;
    }
    if (day.missingCheckOut) missingCheckOuts += 1;
  }

  const trackedDays = counts.present + counts.late + counts.absent;
  return {
    ...counts,
    trackedDays,
    missingCheckOuts,
    attendanceRate: trackedDays ? Math.round((attendedDays / trackedDays) * 100) : null,
    totalWorkedMinutes: workedMinutes,
    averageWorkedMinutes: completedDays ? Math.round(workedMinutes / completedDays) : null,
    averageCheckInMinutes: attendedDays ? Math.round(checkInSeconds / attendedDays / 60) : null,
  };
}
