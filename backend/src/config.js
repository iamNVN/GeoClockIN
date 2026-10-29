import rawConfig from '../config/geoclockin.config.js';
import { isValidDate, isValidTimeZone, maxDate, parseTimeOfDay } from './lib/time.js';

function fail(message) {
  throw new Error(`Invalid GeoClockIN config: ${message}`);
}

function requireString(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string`);
  return value.trim();
}

function requireNumber(value, path, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) fail(`${path} must be a number between ${min} and ${max}`);
  return value;
}

function requireDate(value, path) {
  if (!isValidDate(value)) fail(`${path} must be a date in YYYY-MM-DD format`);
  return value;
}

function requireTime(value, path) {
  const minutes = parseTimeOfDay(value);
  if (minutes == null) fail(`${path} must be a time in HH:MM (24-hour) format`);
  return minutes;
}

function loadConfig(raw) {
  const { company = {}, office = {}, location = {}, schedule = {}, employees } = raw;

  const workStartMinutes = requireTime(schedule.workStart, 'schedule.workStart');
  const workEndMinutes = requireTime(schedule.workEnd, 'schedule.workEnd');
  if (workEndMinutes <= workStartMinutes) fail('schedule.workEnd must be later than schedule.workStart');
  if (!isValidTimeZone(schedule.timezone)) fail(`schedule.timezone "${schedule.timezone}" is not a valid IANA time zone`);

  const workdays = schedule.workdays ?? [];
  if (!Array.isArray(workdays) || !workdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    fail('schedule.workdays must be an array of weekday numbers (0 = Sunday … 6 = Saturday)');
  }
  const holidays = schedule.holidays ?? [];
  if (!Array.isArray(holidays)) fail('schedule.holidays must be an array of dates');
  holidays.forEach((date, i) => requireDate(date, `schedule.holidays[${i}]`));

  if (!Array.isArray(employees) || employees.length === 0) fail('employees must be a non-empty array');
  const seenIds = new Set();
  const seenEmails = new Set();
  const normalizedEmployees = employees.map((employee, i) => {
    const path = `employees[${i}]`;
    const id = requireString(employee.id, `${path}.id`).toUpperCase();
    const email = requireString(employee.email, `${path}.email`).toLowerCase();
    if (seenIds.has(id)) fail(`duplicate employee id ${id}`);
    if (seenEmails.has(email)) fail(`duplicate employee email ${email}`);
    seenIds.add(id);
    seenEmails.add(email);
    return Object.freeze({
      id,
      email,
      name: requireString(employee.name, `${path}.name`),
      designation: employee.designation ?? '',
      department: employee.department ?? '',
      phone: employee.phone ?? '',
      joinedOn: requireDate(employee.joinedOn, `${path}.joinedOn`),
      active: employee.active !== false,
      passwordHash: requireString(employee.passwordHash, `${path}.passwordHash`),
    });
  });

  return Object.freeze({
    company: Object.freeze({ name: company.name ?? '' }),
    office: Object.freeze({
      name: requireString(office.name, 'office.name'),
      address: office.address ?? '',
      latitude: requireNumber(office.latitude, 'office.latitude', { min: -90, max: 90 }),
      longitude: requireNumber(office.longitude, 'office.longitude', { min: -180, max: 180 }),
      radiusMeters: requireNumber(office.radiusMeters, 'office.radiusMeters', { min: 1 }),
    }),
    location: Object.freeze({
      maxAccuracyMeters: requireNumber(location.maxAccuracyMeters, 'location.maxAccuracyMeters', { min: 1 }),
    }),
    schedule: Object.freeze({
      timezone: schedule.timezone,
      workStart: schedule.workStart,
      workEnd: schedule.workEnd,
      workStartMinutes,
      workEndMinutes,
      graceMinutes: requireNumber(schedule.graceMinutes ?? 0, 'schedule.graceMinutes', { min: 0 }),
      workdays: Object.freeze([...workdays]),
      holidays: Object.freeze([...holidays]),
      trackingStartDate: requireDate(schedule.trackingStartDate, 'schedule.trackingStartDate'),
    }),
    employees: Object.freeze(normalizedEmployees),
  });
}

export const config = loadConfig(rawConfig);

const employeesById = new Map(config.employees.map((e) => [e.id, e]));
const employeesByEmail = new Map(config.employees.map((e) => [e.email, e]));

export function findEmployeeById(id) {
  return typeof id === 'string' ? employeesById.get(id.toUpperCase()) : undefined;
}

/** Looks up an employee by ID or email (case-insensitive). */
export function findEmployeeByIdentifier(identifier) {
  const value = identifier.trim();
  return employeesById.get(value.toUpperCase()) ?? employeesByEmail.get(value.toLowerCase());
}

/** The first date absences can be counted for this employee. */
export function attendanceStartDate(employee) {
  return maxDate(employee.joinedOn, config.schedule.trackingStartDate);
}

/** Everything the employee app needs about the signed-in user and their office. */
export function sessionPayload(employee) {
  const { schedule, office, company, location } = config;
  return {
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      designation: employee.designation,
      department: employee.department,
      phone: employee.phone,
      joinedOn: employee.joinedOn,
      attendanceSince: attendanceStartDate(employee),
    },
    company: { name: company.name },
    office: {
      name: office.name,
      address: office.address,
      radiusMeters: office.radiusMeters,
      maxAccuracyMeters: location.maxAccuracyMeters,
    },
    schedule: {
      timezone: schedule.timezone,
      workStart: schedule.workStart,
      workEnd: schedule.workEnd,
      graceMinutes: schedule.graceMinutes,
      workdays: schedule.workdays,
    },
  };
}
