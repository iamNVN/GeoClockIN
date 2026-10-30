// Calendar helpers. Work dates are plain 'YYYY-MM-DD' strings in the office
// time zone, so they compare and sort correctly as strings.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatters = new Map();

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar date and seconds since local midnight of `instant` in `timeZone`. */
export function zonedClock(instant, timeZone) {
  const parts = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(instant)) parts[type] = value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    secondsOfDay: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** 'HH:MM' → minutes since midnight. Returns null for malformed input. */
export function parseTimeOfDay(value) {
  const match = TIME_RE.exec(value ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const CLOCK_RE = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i;

/** Lenient clock parser for typed or imported times: '9:05', '09:05', '6:00 PM'. Minutes, or null. */
export function parseClock(value) {
  const match = CLOCK_RE.exec(String(value ?? '').trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.[0].toLowerCase();
  if (period) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (period === 'p' ? 12 : 0);
  }
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** The instant when the office clock in `timeZone` shows `minutes` past midnight on `date`. */
export function zonedTimeToUtc(date, minutes, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const offsetAt = (instant) => {
    const local = zonedClock(new Date(instant), timeZone);
    const [y, m, d] = local.date.split('-').map(Number);
    return Date.UTC(y, m - 1, d) + local.secondsOfDay * 1000 - instant;
  };
  // Two passes settle the offset even next to a daylight-saving change.
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  return new Date(instant);
}

function toUtcDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isValidDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) && addDays(value, 0) === value;
}

export function addDays(date, days) {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date) {
  return toUtcDate(date).getUTCDay();
}

/** The Monday of the week containing `date`. */
export function startOfWeek(date) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** First and last date of a 'YYYY-MM' month. */
export function monthBounds(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last };
}

export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);
