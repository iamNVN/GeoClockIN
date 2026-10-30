import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import seed from '../config/geoclockin.config.js';
import { adminDayStatus, buildDayRows, buildRangeStats, departmentBreakdown, summarizeDayRows } from '../src/lib/adminStats.js';
import { cellDate, cellMinutes } from '../src/lib/excel.js';
import { normalizeSettings } from '../src/lib/settingsSchema.js';
import { parseClock, zonedTimeToUtc } from '../src/lib/time.js';

const schedule = normalizeSettings(seed).schedule;
const hms = (h, m = 0) => h * 3600 + m * 60;

function employee(id, overrides = {}) {
  return { id, name: id, department: 'Engineering', joinedOn: '2020-01-01', active: true, deactivatedOn: null, ...overrides };
}

function record(employeeId, date, checkIn, checkOut = null, isLate = false) {
  const iso = (t) => new Date(`${date}T${t}:00+05:30`).toISOString();
  const workedMinutes = checkOut ? (new Date(iso(checkOut)) - new Date(iso(checkIn))) / 60_000 : null;
  return { employeeId, date, checkInAt: iso(checkIn), checkOutAt: checkOut && iso(checkOut), isLate, workedMinutes };
}

describe('normalizeSettings', () => {
  it('accepts the seed configuration and derives schedule minutes', () => {
    const s = normalizeSettings(seed);
    assert.equal(s.schedule.workStartMinutes, 540);
    assert.equal(s.schedule.workEndMinutes, 1080);
    assert.deepEqual(s.schedule.holidayDates, []);
  });

  it('rejects an end time before the start time', () => {
    const bad = { ...seed, schedule: { ...seed.schedule, workEnd: '08:00' } };
    assert.throws(() => normalizeSettings(bad), (err) => err.status === 400 && err.details.field === 'schedule.workEnd');
  });

  it('rejects an out-of-range radius', () => {
    const bad = { ...seed, office: { ...seed.office, radiusMeters: 1 } };
    assert.throws(() => normalizeSettings(bad), (err) => err.details.field === 'office.radiusMeters');
  });

  it('sorts and de-duplicates holidays', () => {
    const s = normalizeSettings({
      ...seed,
      schedule: {
        ...seed.schedule,
        holidays: [{ date: '2026-12-25', name: 'Christmas' }, '2026-11-08', { date: '2026-12-25', name: 'Dup' }],
      },
    });
    assert.deepEqual(s.schedule.holidayDates, ['2026-11-08', '2026-12-25']);
  });
});

describe('time helpers for admin edits', () => {
  it('converts office wall-clock time to UTC', () => {
    assert.equal(zonedTimeToUtc('2026-10-29', 9 * 60 + 5, 'Asia/Kolkata').toISOString(), '2026-10-29T03:35:00.000Z');
    assert.equal(zonedTimeToUtc('2026-07-01', 9 * 60, 'Europe/London').toISOString(), '2026-07-01T08:00:00.000Z');
  });

  it('parses typed clock times', () => {
    assert.equal(parseClock('09:05'), 545);
    assert.equal(parseClock('9:05'), 545);
    assert.equal(parseClock('6:00 PM'), 1080);
    assert.equal(parseClock('12:30 am'), 30);
    assert.equal(parseClock('25:00'), null);
    assert.equal(parseClock('banana'), null);
  });

  it('reads Excel date and time cells in any common form', () => {
    assert.equal(cellDate(new Date('2026-10-05T00:00:00Z')), '2026-10-05');
    assert.equal(cellDate(46300), '2026-10-05');
    assert.equal(cellDate('05/10/2026'), '2026-10-05');
    assert.equal(cellDate('2026-13-01'), null);
    assert.equal(cellMinutes(new Date('1899-12-30T09:05:00Z')), 545);
    assert.equal(cellMinutes(0.75), 1080);
    assert.equal(cellMinutes('6:00 PM'), 1080);
  });
});

describe('adminDayStatus', () => {
  const ctx = { today: '2026-10-07', secondsOfDay: hms(10), schedule };

  it('classifies records, absences, pending and off days', () => {
    const e = employee('E1');
    assert.equal(adminDayStatus(e, '2026-10-06', record('E1', '2026-10-06', '09:00', '18:00'), ctx), 'present');
    assert.equal(adminDayStatus(e, '2026-10-06', record('E1', '2026-10-06', '09:40', '18:00', true), ctx), 'late');
    assert.equal(adminDayStatus(e, '2026-10-07', record('E1', '2026-10-07', '09:00'), ctx), 'not_checked_out');
    assert.equal(adminDayStatus(e, '2026-10-06', null, ctx), 'absent');
    assert.equal(adminDayStatus(e, '2026-10-07', null, ctx), 'pending');
    assert.equal(adminDayStatus(e, '2026-10-04', null, ctx), 'off'); // Sunday
  });

  it('does not count new joiners, or inactive employees after deactivation', () => {
    assert.equal(adminDayStatus(employee('E2', { joinedOn: '2026-10-07' }), '2026-10-06', null, ctx), 'untracked');
    const left = employee('E3', { active: false, deactivatedOn: '2026-10-06' });
    assert.equal(adminDayStatus(left, '2026-10-05', null, ctx), 'absent');
    assert.equal(adminDayStatus(left, '2026-10-06', null, ctx), 'untracked');
  });
});

describe('day summaries and ranges', () => {
  const employees = [employee('A'), employee('B', { department: 'Design' }), employee('C')];
  const records = [
    record('A', '2026-10-06', '09:00', '18:00'),
    record('B', '2026-10-06', '09:30', '18:00', true),
    record('A', '2026-10-07', '09:05'),
  ];
  const base = { employees, records, today: '2026-10-07', secondsOfDay: hms(10), schedule };

  it('summarizes one day', () => {
    const s = summarizeDayRows(buildDayRows({ date: '2026-10-06', ...base }));
    assert.deepEqual(
      { expected: s.expected, attended: s.attended, onTime: s.onTime, late: s.late, absent: s.absent, rate: s.attendanceRate },
      { expected: 3, attended: 2, onTime: 1, late: 1, absent: 1, rate: 67 },
    );
    const today = summarizeDayRows(buildDayRows({ date: '2026-10-07', ...base }));
    assert.equal(today.pending, 2);
    assert.equal(today.notCheckedOut, 1);
  });

  it('breaks a day down by department', () => {
    const depts = departmentBreakdown(buildDayRows({ date: '2026-10-06', ...base }));
    assert.deepEqual(
      depts.map((d) => [d.department, d.attended, d.expected]),
      [
        ['Engineering', 1, 2],
        ['Design', 1, 1],
      ],
    );
  });

  it('totals a range without counting today’s pending employees as absent', () => {
    const stats = buildRangeStats({ from: '2026-10-05', to: '2026-10-07', ...base });
    assert.equal(stats.totals.absent, 3 + 1); // all three on 10-05, C on 10-06
    assert.equal(stats.totals.attended, 3);
    assert.equal(stats.totals.late, 1);
    assert.deepEqual(stats.daily.map((d) => d.date), ['2026-10-05', '2026-10-06', '2026-10-07']);
    const a = stats.employees.find((s) => s.employee.id === 'A');
    assert.equal(a.tracked, 3);
    assert.equal(a.workedMinutes, 540);
  });
});
