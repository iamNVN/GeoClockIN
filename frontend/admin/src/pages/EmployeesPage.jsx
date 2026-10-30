import {
  ArrowUpDown,
  Briefcase,
  Building2,
  Download,
  EllipsisVertical,
  FileSpreadsheet,
  KeyRound,
  LoaderCircle,
  PenLine,
  Plus,
  Power,
  Upload,
  UserCheck,
  UserRound,
  Users,
  UserX,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ImportDialog } from '../components/ImportDialog.jsx';
import { Menu } from '../components/Menu.jsx';
import { Modal } from '../components/Modal.jsx';
import { paginate, Pagination } from '../components/Pagination.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, EmptyState, KpiCard, PageHead, SearchField, SelectField, StatusPill, TableSkeleton } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, download } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

const PAGE_SIZE = 10;
const SORTS = {
  'name-asc': { label: 'Name (A – Z)', compare: (a, b) => a.name.localeCompare(b.name) },
  'name-desc': { label: 'Name (Z – A)', compare: (a, b) => b.name.localeCompare(a.name) },
  'id-asc': { label: 'Employee ID', compare: (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) },
  'joined-desc': { label: 'Newest joiners', compare: (a, b) => b.joinedOn.localeCompare(a.joinedOn) },
  'joined-asc': { label: 'Longest serving', compare: (a, b) => a.joinedOn.localeCompare(b.joinedOn) },
};

export default function EmployeesPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const result = useApi('/admin/employees');
  const data = result.data;

  const [search, setSearch] = useState(params.get('q') ?? '');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // {} for a new employee
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // The top bar search navigates here with ?q=.
  useEffect(() => {
    const q = params.get('q');
    if (q !== null) {
      setSearch(q);
      setPage(1);
    }
  }, [params]);

  const employees = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.employees
      .filter(
        (e) =>
          (!department || e.department === department) &&
          (!status || (status === 'active') === e.active) &&
          (!q || `${e.name} ${e.id} ${e.email} ${e.department} ${e.designation}`.toLowerCase().includes(q)),
      )
      .sort(SORTS[sort].compare);
  }, [data, search, department, status, sort]);
  const { current, rows } = paginate(employees, page, PAGE_SIZE);

  const departments = [...new Set([...(data?.departments ?? []), ...(data?.employees.map((e) => e.department) ?? [])])]
    .filter(Boolean)
    .sort();
  const allOnPageSelected = rows.length > 0 && rows.every((e) => selected.has(e.id));

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setActive(ids, active) {
    setBusy(true);
    try {
      await api('/admin/employees/status', { method: 'POST', body: { ids, active } });
      toast.success(`${ids.length} employee${ids.length === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}.`);
      setSelected(new Set());
      result.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Employees" subtitle="Manage employee details, access and attendance settings">
        <Menu
          trigger={(props) => (
            <button type="button" className="btn btn--secondary" {...props}>
              <FileSpreadsheet aria-hidden="true" /> Import / Export
            </button>
          )}
          items={[
            { label: 'Import from Excel…', Icon: Upload, onSelect: () => setImportOpen(true) },
            {
              label: 'Export all to Excel',
              Icon: Download,
              onSelect: () => download('/admin/employees/export').catch((e) => toast.error(e.message)),
            },
            {
              label: 'Download import template',
              Icon: FileSpreadsheet,
              onSelect: () => download('/admin/employees/template').catch((e) => toast.error(e.message)),
            },
          ]}
        />
        <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
          <Plus aria-hidden="true" /> Add Employee
        </button>
      </PageHead>

      <div className="kpis">
        <KpiCard index={0} tone="blue" Icon={UserRound} value={data?.stats.total} label="Total Employees" loading={!data} />
        <KpiCard index={1} tone="green" Icon={Users} value={data?.stats.active} label="Active" loading={!data} />
        <KpiCard index={2} tone="red" Icon={UserX} value={data?.stats.inactive} label="Inactive" loading={!data} />
        <KpiCard index={3} tone="amber" Icon={Briefcase} value={data?.stats.departments} label="Departments" loading={!data} />
      </div>

      <section className="card filters filters--employees reveal" style={{ '--i': 4 }}>
        <SearchField
          className="filters__search"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
            if (params.has('q')) setParams({}, { replace: true });
          }}
          placeholder="Search employees…"
        />
        <SelectField
          label="Department"
          Icon={Building2}
          value={department}
          onChange={(v) => {
            setDepartment(v);
            setPage(1);
          }}
          options={[{ value: '', label: 'All Departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'All Status' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <SelectField
          label="Sort By"
          Icon={ArrowUpDown}
          value={sort}
          onChange={setSort}
          options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
        />
      </section>

      {selected.size > 0 && (
        <div className="bulk-bar pop-in" role="region" aria-label="Bulk actions">
          <span>
            <strong>{selected.size}</strong> selected
          </span>
          <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => setActive([...selected], true)}>
            <UserCheck aria-hidden="true" /> Activate
          </button>
          <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => setActive([...selected], false)}>
            <UserX aria-hidden="true" /> Deactivate
          </button>
          <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <section className="card card--flush reveal" style={{ '--i': 5 }}>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead>
              <tr>
                <th scope="col" className="table__check">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPageSelected}
                    onChange={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        rows.forEach((e) => (allOnPageSelected ? next.delete(e.id) : next.add(e.id)));
                        return next;
                      })
                    }
                  />
                </th>
                <th scope="col">#</th>
                <th scope="col">Employee</th>
                <th scope="col">Employee ID</th>
                <th scope="col">Department</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Join Date</th>
                <th scope="col" className="table__actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <TableSkeleton columns={9} rows={8} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState Icon={Users} title={data.employees.length ? 'No matching employees' : 'No employees yet'}>
                      {data.employees.length ? 'Try a different search or filter.' : 'Add your first employee or import them from Excel.'}
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                rows.map((e, i) => (
                  <tr key={e.id} className={`reveal-row${selected.has(e.id) ? ' is-selected' : ''}`} style={{ '--i': i }}>
                    <td className="table__check">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.name}`} />
                    </td>
                    <td className="table__index">{(current - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="td--primary">
                      <span className="table__employee">
                        <Avatar name={e.name} />
                        <span>
                          <strong>{e.name}</strong>
                          <span>{e.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="tabular" data-label="Employee ID">
                      {e.id}
                    </td>
                    <td data-label="Department">{e.department || '—'}</td>
                    <td data-label="Role">{e.designation || '—'}</td>
                    <td data-label="Status">
                      <StatusPill status={e.active ? 'active' : 'inactive'} />
                    </td>
                    <td className="tabular" data-label="Join Date">
                      {formatDate(e.joinedOn)}
                    </td>
                    <td className="table__actions">
                      <Menu
                        label={`Actions for ${e.name}`}
                        trigger={(props) => (
                          <button type="button" className="icon-btn" {...props}>
                            <EllipsisVertical aria-hidden="true" />
                          </button>
                        )}
                        items={[
                          { label: 'Edit details', Icon: PenLine, onSelect: () => setEditing(e) },
                          { label: 'Reset password', Icon: KeyRound, onSelect: () => setEditing({ ...e, focusPassword: true }) },
                          null,
                          e.active
                            ? { label: 'Deactivate', Icon: Power, tone: 'danger', onSelect: () => setActive([e.id], false) }
                            : { label: 'Activate', Icon: UserCheck, onSelect: () => setActive([e.id], true) },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && <Pagination page={current} pageSize={PAGE_SIZE} total={employees.length} onChange={setPage} noun="employees" />}
      </section>

      <EmployeeForm
        employee={editing}
        departments={departments}
        onClose={() => setEditing(null)}
        onSaved={(saved, created) => {
          setEditing(null);
          toast.success(created ? `${saved.name} added. They can sign in to the employee app now.` : `${saved.name} updated.`);
          result.reload();
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import employees"
        intro="Add new employees or update existing ones (matched by Employee ID) from an Excel sheet."
        templatePath="/admin/employees/template"
        importPath="/admin/employees/import"
        describe={(r) => `${r.created} added and ${r.updated} updated.`}
        onImported={() => result.reload()}
      />
    </>
  );
}

const EMPTY = { id: '', name: '', email: '', phone: '', department: '', designation: '', joinedOn: '', active: true, password: '' };

/** Add / edit employee. `employee` is {} for a new one, null when closed. */
function EmployeeForm({ employee, departments, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [formKey, setFormKey] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const isNew = employee && !employee.id;

  const key = employee ? employee.id ?? 'new' : null;
  if (key !== formKey) {
    setFormKey(key);
    setForm(employee ? { ...EMPTY, ...employee, password: '' } : EMPTY);
    setError(null);
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fieldError = (field) => (error?.field === field ? error.message : null);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      department: form.department,
      designation: form.designation,
      joinedOn: form.joinedOn,
      active: form.active,
      ...(form.password ? { password: form.password } : {}),
    };
    try {
      const { employee: saved } = isNew
        ? await api('/admin/employees', { method: 'POST', body: { ...body, id: form.id } })
        : await api(`/admin/employees/${employee.id}`, { method: 'PUT', body });
      onSaved(saved, isNew);
    } catch (e) {
      setError({ message: e.message, field: e.data?.field });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(employee)}
      onClose={onClose}
      size="lg"
      title={isNew ? 'Add employee' : `Edit ${employee?.name ?? 'employee'}`}
      subtitle={isNew ? 'They can sign in to the employee app with this email or ID and password.' : `Employee ID ${employee?.id ?? ''}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="employee-form" className="btn btn--primary" disabled={saving}>
            {saving && <LoaderCircle className="spin" aria-hidden="true" />}
            {isNew ? 'Add employee' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="employee-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Full name" error={fieldError('name')}>
          <input value={form.name} onChange={set('name')} required autoFocus={!employee?.focusPassword} />
        </Field>
        <Field label="Employee ID" error={fieldError('id')} hint={isNew ? 'e.g. EMP042. Cannot be changed later.' : null}>
          <input value={form.id} onChange={set('id')} disabled={!isNew} style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field label="Email" error={fieldError('email')}>
          <input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Phone" error={fieldError('phone')}>
          <input type="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <label className="field">
          <span className="field__label">Department</span>
          <span className="input">
            <input list="department-options" value={form.department} onChange={set('department')} placeholder="Choose or type a new one" />
          </span>
          <datalist id="department-options">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          {fieldError('department') && <span className="field-error">{fieldError('department')}</span>}
        </label>
        <Field label="Role / designation" error={fieldError('designation')}>
          <input value={form.designation} onChange={set('designation')} />
        </Field>
        <Field label="Joining date" error={fieldError('joinedOn')}>
          <input type="date" value={form.joinedOn} onChange={set('joinedOn')} required />
        </Field>
        <Field
          label={isNew ? 'Password' : 'New password'}
          error={fieldError('password')}
          hint={isNew ? 'At least 6 characters. Share it with the employee.' : 'Leave empty to keep the current password.'}
        >
          <input type="text" value={form.password} onChange={set('password')} autoComplete="new-password" autoFocus={employee?.focusPassword} />
        </Field>
        <label className="switch-row form-grid__full">
          <input type="checkbox" className="switch" checked={form.active} onChange={set('active')} />
          <span>
            <strong>Active</strong>
            <span className="muted">Inactive employees cannot sign in, and stop being counted absent.</span>
          </span>
        </label>
        {error && !error.field && (
          <p className="notice notice--error form-grid__full" role="alert">
            {error.message}
          </p>
        )}
      </form>
    </Modal>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className={`input${error ? ' is-invalid' : ''}`}>{children}</span>
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
