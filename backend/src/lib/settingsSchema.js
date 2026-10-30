// Validation for the organisation settings (office, geofence, schedule, …).
// Pure: used when seeding, when loading from the database and when an admin
// saves changes.
import { HttpError } from '../errors.js';
import { isValidDate, isValidTimeZone, parseTimeOfDay } from './time.js';

class SettingsError extends HttpError {
  constructor(field, message) {
    super(400, 'INVALID_SETTINGS', message, { field });
  }
}

function text(value, field, { required = false, max = 200 } = {}) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new SettingsError(field, `${label(field)} is required.`);
  if (result.length > max) throw new SettingsError(field, `${label(field)} must be at most ${max} characters.`);
  return result;
}

function number(value, field, { min, max, integer = false }) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new SettingsError(field, `${label(field)} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  }
  return n;
}

function time(value, field) {
  const minutes = parseTimeOfDay(value);
  if (minutes == null) throw new SettingsError(field, `${label(field)} must be a time like 09:00.`);
  return minutes;
}

const LABELS = {
  'company.name': 'Company name',
  'office.name': 'Office name',
  'office.latitude': 'Latitude',
  'office.longitude': 'Longitude',
  'office.radiusMeters': 'Geofence radius',
  'location.maxAccuracyMeters': 'Location accuracy limit',
  'schedule.timezone': 'Time zone',
  'schedule.workStart': 'Work start time',
  'schedule.workEnd': 'Work end time',
  'schedule.graceMinutes': 'Grace period',
  'schedule.trackingStartDate': 'Tracking start date',
};
const label = (field) => LABELS[field] ?? field;

/**
 * Validates raw settings and returns them in canonical form plus derived
 * fields (`workStartMinutes`, `workEndMinutes`, `holidayDates`). Throws a 400
 * HttpError naming the offending field.
 */
export function normalizeSettings(raw = {}) {
  const { company = {}, office = {}, location = {}, schedule = {}, departments = [] } = raw;

  const workStartMinutes = time(schedule.workStart, 'schedule.workStart');
  const workEndMinutes = time(schedule.workEnd, 'schedule.workEnd');
  if (workEndMinutes <= workStartMinutes) {
    throw new SettingsError('schedule.workEnd', 'Work end time must be later than the start time.');
  }
  if (!isValidTimeZone(schedule.timezone)) {
    throw new SettingsError('schedule.timezone', `"${schedule.timezone}" is not a valid time zone.`);
  }

  const workdays = [...new Set(schedule.workdays ?? [])].sort();
  if (workdays.length === 0 || !workdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw new SettingsError('schedule.workdays', 'Choose at least one workday.');
  }

  const holidays = (schedule.holidays ?? [])
    .map((h) => (typeof h === 'string' ? { date: h, name: '' } : h))
    .map((h, i) => {
      if (!isValidDate(h?.date)) throw new SettingsError(`schedule.holidays.${i}`, 'Holiday dates must be valid dates.');
      return { date: h.date, name: text(h.name, `schedule.holidays.${i}.name`, { max: 80 }) };
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((h, i, all) => i === 0 || all[i - 1].date !== h.date);

  if (!isValidDate(schedule.trackingStartDate)) {
    throw new SettingsError('schedule.trackingStartDate', 'Tracking start date must be a valid date.');
  }

  const departmentList = [...new Set((departments ?? []).map((d) => text(d, 'departments', { max: 60 })).filter(Boolean))];

  return {
    company: {
      name: text(company.name, 'company.name', { required: true, max: 120 }),
      email: text(company.email, 'company.email', { max: 120 }),
      phone: text(company.phone, 'company.phone', { max: 40 }),
      address: text(company.address, 'company.address', { max: 300 }),
    },
    office: {
      name: text(office.name, 'office.name', { required: true, max: 120 }),
      address: text(office.address, 'office.address', { max: 300 }),
      latitude: number(office.latitude, 'office.latitude', { min: -90, max: 90 }),
      longitude: number(office.longitude, 'office.longitude', { min: -180, max: 180 }),
      radiusMeters: number(office.radiusMeters, 'office.radiusMeters', { min: 10, max: 5000, integer: true }),
    },
    location: {
      maxAccuracyMeters: number(location.maxAccuracyMeters, 'location.maxAccuracyMeters', { min: 5, max: 1000, integer: true }),
    },
    schedule: {
      timezone: schedule.timezone,
      workStart: schedule.workStart,
      workEnd: schedule.workEnd,
      graceMinutes: number(schedule.graceMinutes ?? 0, 'schedule.graceMinutes', { min: 0, max: 240, integer: true }),
      workdays,
      holidays,
      trackingStartDate: schedule.trackingStartDate,
      workStartMinutes,
      workEndMinutes,
      holidayDates: holidays.map((h) => h.date),
    },
    departments: departmentList,
  };
}

/** Settings as stored and edited (derived fields removed). */
export function storableSettings(settings) {
  const { workStartMinutes, workEndMinutes, holidayDates, ...schedule } = settings.schedule;
  return { ...settings, schedule };
}
