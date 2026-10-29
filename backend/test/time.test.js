import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  isValidDate,
  isValidTimeZone,
  monthBounds,
  parseTimeOfDay,
  startOfWeek,
  weekdayOf,
  zonedClock,
} from '../src/lib/time.js';

describe('zonedClock', () => {
  it('returns the local date and time of day in the office time zone', () => {
    const { date, secondsOfDay } = zonedClock(new Date('2026-10-29T03:35:20Z'), 'Asia/Kolkata');
    assert.equal(date, '2026-10-29');
    assert.equal(secondsOfDay, 9 * 3600 + 5 * 60 + 20);
  });

  it('rolls over to the next local date after midnight', () => {
    const { date, secondsOfDay } = zonedClock(new Date('2026-10-29T19:00:00Z'), 'Asia/Kolkata');
    assert.equal(date, '2026-10-30');
    assert.equal(secondsOfDay, 30 * 60);
  });

  it('reports midnight as hour 0, not 24', () => {
    assert.equal(zonedClock(new Date('2026-10-29T18:30:00Z'), 'Asia/Kolkata').secondsOfDay, 0);
  });
});

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  it('finds weekdays', () => {
    assert.equal(weekdayOf('2026-10-29'), 4); // Thursday
    assert.equal(weekdayOf('2026-11-01'), 0); // Sunday
  });

  it('finds the Monday of a week', () => {
    assert.equal(startOfWeek('2026-10-29'), '2026-10-26');
    assert.equal(startOfWeek('2026-10-26'), '2026-10-26');
    assert.equal(startOfWeek('2026-11-01'), '2026-10-26'); // Sunday belongs to the week before
  });

  it('computes month bounds including leap years', () => {
    assert.deepEqual(monthBounds('2026-10'), { first: '2026-10-01', last: '2026-10-31' });
    assert.deepEqual(monthBounds('2028-02'), { first: '2028-02-01', last: '2028-02-29' });
  });

  it('validates dates, times and time zones', () => {
    assert.equal(isValidDate('2026-02-28'), true);
    assert.equal(isValidDate('2026-02-30'), false);
    assert.equal(isValidDate('2026-2-3'), false);
    assert.equal(parseTimeOfDay('09:15'), 555);
    assert.equal(parseTimeOfDay('24:00'), null);
    assert.equal(parseTimeOfDay('9:15'), null);
    assert.equal(isValidTimeZone('Asia/Kolkata'), true);
    assert.equal(isValidTimeZone('Mars/Olympus'), false);
  });
});
