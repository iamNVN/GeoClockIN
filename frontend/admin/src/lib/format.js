// Display formatting. Times use the office time zone (set after sign-in);
// calendar dates ('YYYY-MM-DD') are formatted as plain dates.

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

/** "09:05 AM", or "--:--". */
export function formatTime(value) {
  if (!value) return '--:--';
  return formatter({ hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));
}

/** "09:05" (24-hour) in the office time zone, for time inputs. */
export function inputTime(value) {
  if (!value) return '';
  const p = parts({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, new Date(value));
  return `${p.hour}:${p.minute}`;
}

/** "26 Aug 2026". */
export function formatDate(date) {
  if (!date) return '—';
  const p = parts({ day: '2-digit', month: 'short', year: 'numeric' }, calendarDate(date), 'UTC');
  return `${p.day} ${p.month} ${p.year}`;
}

/** "Tue, 26 Aug 2026". */
export function formatLongDate(date) {
  const p = parts({ weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }, calendarDate(date), 'UTC');
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** "26 Aug". */
export function formatShortDate(date) {
  const p = parts({ day: 'numeric', month: 'short' }, calendarDate(date), 'UTC');
  return `${p.day} ${p.month}`;
}

/** "8h 5m", "45m", or "--". */
export function formatDuration(minutes) {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Minutes since midnight → "09:15 AM". */
export function formatMinutes(minutes) {
  if (minutes == null) return '--:--';
  const h = Math.floor(minutes / 60) % 24;
  return `${pad(((h + 11) % 12) + 1)}:${pad(minutes % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 'HH:MM' → "09:00 AM". */
export function formatClock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return formatMinutes(h * 60 + m);
}

export function formatDistance(meters) {
  if (meters == null) return null;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function addDays(date, days) {
  const d = calendarDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const monthStart = (date) => `${date.slice(0, 7)}-01`;

export function initials(name) {
  const words = (name ?? '').trim().split(/\s+/);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase();
}

export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
