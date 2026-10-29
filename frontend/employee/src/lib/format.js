// Display formatting. Times are shown in the office time zone (set after
// sign-in), and calendar dates ('YYYY-MM-DD') are formatted as plain dates.

let officeTimeZone;
const formatters = new Map();

export function setOfficeTimeZone(timeZone) {
  officeTimeZone = timeZone;
  formatters.clear();
}

function formatter(options, timeZone = officeTimeZone) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
    formatters.set(key, f);
  }
  return f;
}

function parts(options, value, timeZone) {
  const result = {};
  for (const { type, value: v } of formatter(options, timeZone).formatToParts(value)) result[type] = v;
  return result;
}

const pad = (n) => String(n).padStart(2, '0');
const calendarDate = (date) => new Date(`${date}T00:00:00Z`);

/** "09:05 AM", or "--:--" when there is no time. */
export function formatTime(value) {
  if (!value) return '--:--';
  return formatter({ hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));
}

/** "Mon, 26 Aug 2026" for an instant, in the office time zone. */
export function formatToday(value) {
  const p = parts({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, value);
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** { day: '26', month: 'Aug', weekday: 'Mon' } for a calendar date. */
export function dayParts(date) {
  const p = parts({ weekday: 'short', day: 'numeric', month: 'short' }, calendarDate(date), 'UTC');
  return { day: p.day, month: p.month, weekday: p.weekday };
}

/** "Monday, 26 August 2026" for a calendar date. */
export function formatFullDate(date) {
  const p = parts({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, calendarDate(date), 'UTC');
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** "26 Aug 2026" for a calendar date. */
export function formatShortDate(date) {
  const p = parts({ day: 'numeric', month: 'short', year: 'numeric' }, calendarDate(date), 'UTC');
  return `${p.day} ${p.month} ${p.year}`;
}

/** 'YYYY-MM' → "October 2026". */
export function formatMonth(month) {
  return formatter({ month: 'long', year: 'numeric' }, 'UTC').format(calendarDate(`${month}-01`));
}

/** The current 'YYYY-MM' in the office time zone. */
export function monthOf(instant) {
  const p = parts({ year: 'numeric', month: '2-digit' }, instant);
  return `${p.year}-${p.month}`;
}

/** Months from `to` back to `from` (inclusive), newest first. */
export function monthsBetween(from, to) {
  const months = [];
  let [year, month] = to.split('-').map(Number);
  for (let guard = 0; guard < 240; guard++) {
    const key = `${year}-${pad(month)}`;
    if (key < from) break;
    months.push(key);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months.length ? months : [to];
}

/** Minutes since midnight → "09:15 AM". */
export function formatMinutesOfDay(minutes) {
  if (minutes == null) return '--:--';
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${pad(((h + 11) % 12) + 1)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 'HH:MM' → "09:00 AM". */
export function formatTimeOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return formatMinutesOfDay(h * 60 + m);
}

/** 535 → "8h 55m". */
export function formatDuration(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 18 → "18 meters", 1234 → "1.2 km". */
export function formatDistance(meters) {
  if (meters == null) return '—';
  if (meters < 1000) return `${Math.round(meters)} ${Math.round(meters) === 1 ? 'meter' : 'meters'}`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** [1,2,3,4,5] → "Mon – Fri"; non-contiguous days are listed. */
export function formatWorkdays(days) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return '—';
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${WEEKDAYS[sorted[0]]} – ${WEEKDAYS[sorted.at(-1)]}`;
  return sorted.map((d) => WEEKDAYS[d]).join(', ');
}

export function initials(name) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase();
}
