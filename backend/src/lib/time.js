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

/** First and last date of a 'YYYY-MM' month. */
export function monthBounds(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last };
}

export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);
