import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMonth,
  buildWeek,
  dayStatus,
  holidayOn,
  isLateCheckIn,
  isWorkday,
  summarizeMonth,
  todayState,
} from '../src/lib/attendance.js';

const TZ = 'Asia/Kolkata';
const schedule = {
  workdays: [1, 2, 3, 4, 5],
  holidayDates: ['2026-10-02'],
  holidays: [{ date: '2026-10-02', name: 'Gandhi Jayanti' }],
  workStartMinutes: 9 * 60,
  workEndMinutes: 18 * 60,
  graceMinutes: 15,
};

const hms = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;

/** A serialized record with times given in IST. */
function record(date, checkIn, checkOut = null, isLate = false) {
  const iso = (time) => new Date(`${date}T${time}:00+05:30`).toISOString();
  const workedMinutes = checkOut ? (new Date(iso(checkOut)) - new Date(iso(checkIn))) / 60_000 : null;
  return { date, checkInAt: iso(checkIn), checkOutAt: checkOut && iso(checkOut), isLate, workedMinutes };
}

describe('isWorkday', () => {
  it('follows configured weekdays and holidays', () => {
    assert.equal(isWorkday('2026-10-29', schedule), true); // Thursday
    assert.equal(isWorkday('2026-10-31', schedule), false); // Saturday
    assert.equal(isWorkday('2026-10-02', schedule), false); // holiday
  });
});

describe('holidayOn', () => {
  it('names holidays and ignores other days', () => {
    assert.equal(holidayOn('2026-10-02', schedule), 'Gandhi Jayanti');
    assert.equal(holidayOn('2026-10-05', schedule), null);
    assert.equal(holidayOn('2026-10-02', { ...schedule, holidays: [{ date: '2026-10-02', name: '' }] }), 'Holiday');
  });
});

describe('isLateCheckIn', () => {
  it('is on time up to the end of the grace period', () => {
    assert.equal(isLateCheckIn('2026-10-29', hms(9, 15, 0), schedule), false);
  });

  it('is late one second after the grace period', () => {
    assert.equal(isLateCheckIn('2026-10-29', hms(9, 15, 1), schedule), true);
  });

  it('is never late on a non-workday', () => {
    assert.equal(isLateCheckIn('2026-10-31', hms(13), schedule), false);
  });
});

describe('todayState', () => {
  it('allows only check-in before checking in', () => {
    const state = todayState('2026-10-29', null, schedule);
    assert.equal(state.status, 'not_checked_in');
    assert.equal(state.canCheckIn, true);
    assert.equal(state.canCheckOut, false);
  });

  it('allows only check-out after checking in', () => {
    const state = todayState('2026-10-29', record('2026-10-29', '09:05'), schedule);
    assert.equal(state.status, 'checked_in');
    assert.equal(state.canCheckIn, false);
    assert.equal(state.canCheckOut, true);
  });

  it('allows nothing after checking out', () => {
    const state = todayState('2026-10-29', record('2026-10-29', '09:05', '18:00'), schedule);
    assert.equal(state.status, 'checked_out');
    assert.equal(state.canCheckIn, false);
    assert.equal(state.canCheckOut, false);
  });
});

describe('buildMonth', () => {
  const records = [
    record('2026-10-01', '08:55', '18:05'),
    record('2026-10-05', '09:40', null, true),
    record('2026-10-07', '09:02'),
  ];
  const base = { month: '2026-10', records, today: '2026-10-07', startDate: '2026-10-01', schedule };

  it('lists attended days and past absences, newest first', () => {
    const days = buildMonth({ ...base, secondsOfDay: hms(10) });
    assert.deepEqual(
      days.map((d) => [d.date, d.status, d.missingCheckOut]),
      [
        ['2026-10-07', 'present', false], // today, still working
        ['2026-10-06', 'absent', false],
        ['2026-10-05', 'late', true],
        ['2026-10-01', 'present', false],
        // 10-02 holiday and 10-03/04 weekend are omitted
      ],
    );
  });

  it('does not mark today absent until the workday ends', () => {
    const noToday = { ...base, records: records.slice(0, 2) };
    assert.equal(buildMonth({ ...noToday, secondsOfDay: hms(17, 59) })[0].date, '2026-10-06');
    const afterEnd = buildMonth({ ...noToday, secondsOfDay: hms(18) })[0];
    assert.deepEqual([afterEnd.date, afterEnd.status], ['2026-10-07', 'absent']);
  });

  it('does not count absences before the start date but keeps earlier records', () => {
    const days = buildMonth({ ...base, startDate: '2026-10-07', secondsOfDay: hms(10) });
    assert.deepEqual(
      days.map((d) => d.status),
      ['present', 'late', 'present'],
    );
  });

  it('returns nothing for a future month', () => {
    assert.deepEqual(buildMonth({ ...base, month: '2026-11', secondsOfDay: hms(10) }), []);
  });
});

describe('dayStatus', () => {
  const context = { today: '2026-10-07', secondsOfDay: hms(10), startDate: '2026-10-01', schedule };

  it('classifies attended, absent, upcoming and off days', () => {
    assert.equal(dayStatus('2026-10-05', record('2026-10-05', '09:40', null, true), context), 'late');
    assert.equal(dayStatus('2026-10-06', null, context), 'absent');
    assert.equal(dayStatus('2026-10-07', null, context), 'pending'); // today, before workEnd
    assert.equal(dayStatus('2026-10-08', null, context), 'pending'); // future workday
    assert.equal(dayStatus('2026-10-10', null, context), 'off'); // Saturday
    assert.equal(dayStatus('2026-10-02', null, context), 'holiday');
    assert.equal(dayStatus('2026-09-30', null, context), 'off'); // before start date
  });
});

describe('buildWeek', () => {
  it('returns Monday to Sunday of the current week', () => {
    const week = buildWeek({
      records: [record('2026-10-05', '09:00', '18:00')],
      today: '2026-10-07',
      secondsOfDay: hms(10),
      startDate: '2026-10-01',
      schedule,
    });
    assert.deepEqual(
      week.map((d) => [d.date, d.status]),
      [
        ['2026-10-05', 'present'],
        ['2026-10-06', 'absent'],
        ['2026-10-07', 'pending'],
        ['2026-10-08', 'pending'],
        ['2026-10-09', 'pending'],
        ['2026-10-10', 'off'],
        ['2026-10-11', 'off'],
      ],
    );
  });
});

describe('summarizeMonth', () => {
  it('counts statuses, attendance rate, hours and average check-in', () => {
    const days = buildMonth({
      month: '2026-10',
      records: [record('2026-10-01', '09:00', '18:00'), record('2026-10-05', '09:30', '17:30', true)],
      today: '2026-10-06',
      secondsOfDay: hms(19),
      startDate: '2026-10-01',
      schedule,
    });
    assert.deepEqual(summarizeMonth(days, TZ), {
      present: 1,
      late: 1,
      absent: 1, // 10-06 (after workEnd)
      trackedDays: 3,
      missingCheckOuts: 0,
      attendanceRate: 67,
      totalWorkedMinutes: 17 * 60,
      averageWorkedMinutes: 8.5 * 60,
      averageCheckInMinutes: 9 * 60 + 15,
    });
  });

  it('handles an empty month', () => {
    const summary = summarizeMonth([], TZ);
    assert.equal(summary.attendanceRate, null);
    assert.equal(summary.averageCheckInMinutes, null);
  });
});
