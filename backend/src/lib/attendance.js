// Attendance business rules. Pure functions: no I/O, so they are easy to test.
import { addDays, minDate, monthBounds, weekdayOf, zonedClock } from './time.js';

export function isWorkday(date, schedule) {
  return schedule.workdays.includes(weekdayOf(date)) && !schedule.holidays.includes(date);
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
 * Day-by-day attendance for one month, newest first.
 *
 * - A day with a check-in is `present` or `late`; `missingCheckOut` is set when a
 *   past day was never checked out.
 * - A workday without a check-in is `absent` once it has passed (today counts
 *   as passed after workEnd). Days before `startDate` are never absent.
 * - Non-workdays without attendance, and today before workEnd, are omitted.
 */
export function buildMonth({ month, records, today, secondsOfDay, startDate, schedule }) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const { first, last } = monthBounds(month);
  const days = [];

  for (let date = first; date <= minDate(last, today); date = addDays(date, 1)) {
    const record = byDate.get(date);
    if (record) {
      days.push({
        date,
        status: record.isLate ? 'late' : 'present',
        missingCheckOut: !record.checkOutAt && date < today,
        record,
      });
      continue;
    }
    if (date < startDate || !isWorkday(date, schedule)) continue;
    const dayOver = date < today || secondsOfDay >= schedule.workEndMinutes * 60;
    if (dayOver) days.push({ date, status: 'absent', missingCheckOut: false, record: null });
  }

  return days.reverse();
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
