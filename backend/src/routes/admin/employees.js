import express, { Router } from 'express';
import { audit } from '../../audit.js';
import { query, transaction } from '../../db.js';
import { findEmployeeById, listEmployees, publicEmployee, saveEmployee, validateEmployee } from '../../employees.js';
import { HttpError } from '../../errors.js';
import { addTable, cellDate, cellText, newWorkbook, readUploadedSheet, sendWorkbook } from '../../lib/excel.js';
import { saveSettings, storableSettings } from '../../settings.js';

const router = Router();
const uploadBody = express.raw({ type: () => true, limit: '5mb' });

router.get('/', async (req, res) => {
  const employees = (await listEmployees()).map(publicEmployee);
  const active = employees.filter((e) => e.active).length;
  res.json({
    employees,
    departments: req.settings.departments,
    stats: {
      total: employees.length,
      active,
      inactive: employees.length - active,
      departments: new Set([...req.settings.departments, ...employees.map((e) => e.department).filter(Boolean)]).size,
    },
  });
});

/** Adds departments that aren't in the settings list yet (e.g. typed in an import). */
async function rememberDepartments(settings, names, admin) {
  const missing = [...new Set(names.filter(Boolean))].filter((name) => !settings.departments.includes(name));
  if (missing.length === 0) return;
  const raw = storableSettings(settings);
  await saveSettings({ ...raw, departments: [...raw.departments, ...missing] }, admin.email);
}

router.post('/', async (req, res) => {
  const data = validateEmployee(req.body ?? {});
  const employee = await saveEmployee({ query }, data, { create: true });
  await rememberDepartments(req.settings, [employee.department], req.admin);
  await audit(null, req.admin, 'employee.create', 'employee', employee.id, { ...publicEmployee(employee) });
  res.status(201).json({ employee: publicEmployee(employee) });
});

router.put('/:id', async (req, res) => {
  const existing = await findEmployeeById(req.params.id);
  if (!existing) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'This employee no longer exists.');
  const { id: _ignored, ...changes } = req.body ?? {};
  const data = { ...validateEmployee(changes, { partial: true }), id: existing.id };
  const employee = await saveEmployee({ query }, data, { create: false });
  await rememberDepartments(req.settings, [employee.department], req.admin);
  const changed = Object.keys(data).filter((k) => k !== 'id' && (k === 'password' || data[k] !== existing[k]));
  await audit(null, req.admin, 'employee.update', 'employee', employee.id, {
    fields: changed.map((k) => (k === 'password' ? 'password (reset)' : k)),
  });
  res.json({ employee: publicEmployee(employee) });
});

// Activate or deactivate several employees at once.
router.post('/status', async (req, res) => {
  const { ids, active } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0 || typeof active !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Choose at least one employee.');
  }
  const updated = await transaction(async (client) => {
    const result = [];
    for (const id of ids.slice(0, 1000)) {
      const employee = await saveEmployee(client, { id: String(id).toUpperCase(), active }, { create: false });
      result.push(publicEmployee(employee));
    }
    await audit(client, req.admin, active ? 'employee.activate' : 'employee.deactivate', 'employee', null, { ids: result.map((e) => e.id) });
    return result;
  });
  res.json({ employees: updated });
});

const EXPORT_COLUMNS = [
  { header: 'Employee ID', key: 'id', width: 13 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Department', key: 'department', width: 18 },
  { header: 'Designation', key: 'designation', width: 22 },
  { header: 'Joined On', key: 'joinedOn', width: 12 },
  { header: 'Status', key: 'status', width: 10 },
];

router.get('/export', async (req, res) => {
  const employees = await listEmployees();
  const workbook = newWorkbook();
  addTable(
    workbook,
    'Employees',
    EXPORT_COLUMNS,
    employees.map((e) => ({ ...e, status: e.active ? 'Active' : 'Inactive' })),
  );
  await sendWorkbook(res, workbook, 'employees.xlsx');
});

router.get('/template', async (req, res) => {
  const workbook = newWorkbook();
  addTable(workbook, 'Employees', [...EXPORT_COLUMNS, { header: 'Password', key: 'password', width: 18 }], [
    {
      id: 'EMP100',
      name: 'Asha Menon',
      email: 'asha.menon@company.com',
      phone: '+91 90000 00000',
      department: req.settings.departments[0] ?? 'Engineering',
      designation: 'Software Engineer',
      joinedOn: '2026-11-02',
      status: 'Active',
      password: 'Welcome@123',
    },
  ]);
  const notes = workbook.addWorksheet('How to fill');
  notes.columns = [{ width: 100 }];
  [
    'One row per employee. Existing Employee IDs are updated; new IDs are added.',
    'Required: Employee ID, Name, Email, Joined On (YYYY-MM-DD). Password is required for new employees only.',
    'Leave Password blank to keep an existing employee’s password unchanged.',
    'Status: Active or Inactive. New departments are added to Settings automatically.',
  ].forEach((line) => notes.addRow([line]));
  await sendWorkbook(res, workbook, 'employees-import-template.xlsx');
});

const IMPORT_ALIASES = {
  employeeid: 'id',
  empid: 'id',
  id: 'id',
  name: 'name',
  fullname: 'name',
  employeename: 'name',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  department: 'department',
  dept: 'department',
  designation: 'designation',
  role: 'designation',
  title: 'designation',
  joinedon: 'joinedOn',
  joindate: 'joinedOn',
  joiningdate: 'joinedOn',
  dateofjoining: 'joinedOn',
  status: 'status',
  active: 'status',
  password: 'password',
};

// Bulk add or update employees. All-or-nothing: if any row is invalid,
// nothing is imported and every problem is listed.
router.post('/import', uploadBody, async (req, res) => {
  const rows = await readUploadedSheet(req.body, IMPORT_ALIASES);
  if (rows.length === 0) throw new HttpError(400, 'EMPTY_FILE', 'The file has no employee rows.');
  if (rows.length > 2000) throw new HttpError(400, 'TOO_MANY_ROWS', 'Import at most 2,000 employees at a time.');

  const existing = new Map((await listEmployees()).map((e) => [e.id, e]));
  const errors = [];
  const items = [];
  const seenIds = new Set();
  const seenEmails = new Map();

  for (const row of rows) {
    const status = cellText(row.status).toLowerCase();
    const input = {
      id: cellText(row.id),
      name: cellText(row.name),
      email: cellText(row.email),
      phone: cellText(row.phone),
      department: cellText(row.department),
      designation: cellText(row.designation),
      joinedOn: row.joinedOn == null ? '' : cellDate(row.joinedOn) ?? cellText(row.joinedOn),
      password: cellText(row.password),
      active: status === '' || ['active', 'yes', 'true', '1'].includes(status),
    };
    try {
      if (status && !['active', 'inactive', 'yes', 'no', 'true', 'false', '1', '0'].includes(status)) {
        throw new Error('Status must be Active or Inactive.');
      }
      const id = input.id.toUpperCase();
      const create = !existing.has(id);
      const data = validateEmployee(input, { partial: false });
      if (create && !data.password) throw new Error('Password is required for new employees.');
      if (seenIds.has(data.id)) throw new Error(`Employee ID ${data.id} appears more than once.`);
      const emailOwner = seenEmails.get(data.email);
      if (emailOwner && emailOwner !== data.id) throw new Error(`Email ${data.email} appears more than once.`);
      seenIds.add(data.id);
      seenEmails.set(data.email, data.id);
      items.push({ data, create });
    } catch (err) {
      errors.push({ row: row._row, message: err.message });
    }
  }
  if (errors.length) throw new HttpError(422, 'IMPORT_INVALID', `${errors.length} row(s) need fixing. Nothing was imported.`, { errors });

  let created = 0;
  try {
    await transaction(async (client) => {
      for (const { data, create } of items) {
        await saveEmployee(client, data, { create });
        if (create) created += 1;
      }
      await audit(client, req.admin, 'employee.import', 'employee', null, { created, updated: items.length - created });
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      throw new HttpError(422, 'IMPORT_INVALID', 'Nothing was imported.', { errors: [{ row: null, message: err.message }] });
    }
    throw err;
  }
  await rememberDepartments(req.settings, items.map((i) => i.data.department), req.admin);
  res.json({ created, updated: items.length - created });
});

export default router;
