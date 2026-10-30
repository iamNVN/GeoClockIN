import {
  Building2,
  Clock,
  Download,
  EllipsisVertical,
  FileSpreadsheet,
  LoaderCircle,
  PenLine,
  RotateCcw,
  Upload,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { ATTENDANCE_COLUMNS, AttendanceRow } from '../components/AttendanceTable.jsx';
import { DayKpis } from '../components/DayKpis.jsx';
import { ImportDialog } from '../components/ImportDialog.jsx';
import { Menu } from '../components/Menu.jsx';
import { Modal } from '../components/Modal.jsx';
import { paginate, Pagination } from '../components/Pagination.jsx';
import { useToast } from '../components/Toast.jsx';
import { EmptyState, PageHead, SearchField, SelectField, TableSkeleton } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, download, qs } from '../lib/api.js';
import { addDays, formatLongDate, inputTime, monthStart } from '../lib/format.js';

const PAGE_SIZE = 10;
const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'not_checked_out', label: 'Not Checked Out' },
  { value: 'pending', label: 'Not Checked In' },
];

function matchesStatus(row, status) {
  if (!status) return true;
  if (status === 'late') return row.isLate;
  return row.status === status;
}

export default function AttendancePage() {
  const { date, setDate, today } = useAuth();
  const toast = useToast();
  const attendance = useApi(`/admin/attendance${qs({ date })}`);
  const data = attendance.data?.date === date ? attendance.data : null;

  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        (!department || r.employee.department === department) &&
        matchesStatus(r, status) &&
        (!q || `${r.employee.name} ${r.employee.id} ${r.employee.department}`.toLowerCase().includes(q)),
    );
  }, [data, department, status, search]);
  const { current, rows: pageRows } = paginate(rows, page, PAGE_SIZE);

  const departments = [...new Set([...(data?.departments ?? []), ...(data?.rows.map((r) => r.employee.department) ?? [])])]
    .filter(Boolean)
    .sort();

  const resetFilters = () => {
    setDepartment('');
    setStatus('');
    setSearch('');
    setPage(1);
    setDate(today);
  };

  async function exportDay() {
    setExporting(true);
    try {
      await download(`/admin/attendance/export${qs({ date })}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHead title="Attendance" subtitle="View and manage daily attendance records">
        <button type="button" className="btn btn--primary" onClick={exportDay} disabled={exporting}>
          {exporting ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          Export
        </button>
        <Menu
          label="More attendance actions"
          trigger={(props) => (
            <button type="button" className="icon-btn icon-btn--boxed" {...props}>
              <EllipsisVertical aria-hidden="true" />
            </button>
          )}
          items={[
            { label: 'Export a date range…', Icon: FileSpreadsheet, onSelect: () => setRangeOpen(true) },
            { label: 'Import attendance…', Icon: Upload, onSelect: () => setImportOpen(true) },
          ]}
        />
      </PageHead>

      <DayKpis kpis={data?.kpis} loading={!data} />

      <section className="card filters reveal" style={{ '--i': 4 }}>
        <label className="field">
          <span className="field__label">Date</span>
          <span className="input">
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </span>
        </label>
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
          options={STATUS_OPTIONS}
        />
        <SearchField
          className="filters__search"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search employees…"
        />
        <button type="button" className="btn btn--secondary filters__reset" onClick={resetFilters}>
          <RotateCcw aria-hidden="true" /> Reset Filters
        </button>
      </section>

      <section className="card card--flush reveal" style={{ '--i': 5 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                {ATTENDANCE_COLUMNS.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
                <th scope="col" className="table__actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <TableSkeleton columns={ATTENDANCE_COLUMNS.length + 2} rows={8} />
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={ATTENDANCE_COLUMNS.length + 2}>
                    <EmptyState Icon={Clock} title="No matching records">
                      {data.rows.length ? 'Try changing or resetting the filters.' : `No employees to show for ${formatLongDate(date)}.`}
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <AttendanceRow
                    key={row.employee.id}
                    row={row}
                    index={(current - 1) * PAGE_SIZE + i + 1}
                    actions={
                      <Menu
                        label={`Actions for ${row.employee.name}`}
                        trigger={(props) => (
                          <button type="button" className="icon-btn" {...props}>
                            <EllipsisVertical aria-hidden="true" />
                          </button>
                        )}
                        items={[
                          { label: row.record ? 'Edit times' : 'Add attendance', Icon: PenLine, onSelect: () => setEditing(row) },
                          row.record
                            ? { label: 'Mark absent', Icon: UserX, tone: 'danger', onSelect: () => setEditing({ ...row, clear: true }) }
                            : false,
                        ]}
                      />
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && <Pagination page={current} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} noun="employees" />}
      </section>

      <EditAttendance
        row={editing}
        date={date}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          attendance.reload();
        }}
      />
      <ExportRange open={rangeOpen} onClose={() => setRangeOpen(false)} today={today} />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import attendance"
        intro="Add or replace attendance from an Excel sheet, e.g. a paper register. Existing records for the same employee and date are replaced."
        templatePath="/admin/attendance/template"
        importPath="/admin/attendance/import"
        describe={(r) => `${r.imported} attendance record${r.imported === 1 ? '' : 's'} imported.`}
        onImported={() => attendance.reload()}
      />
    </>
  );
}

/** Add or correct one employee's times, or clear the day (mark absent). */
function EditAttendance({ row, date, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const open = Boolean(row);
  if (open && form?.key !== `${row.employee.id}|${date}|${row.clear}`) {
    setForm({
      key: `${row.employee.id}|${date}|${row.clear}`,
      checkIn: inputTime(row.record?.checkInAt),
      checkOut: inputTime(row.record?.checkOutAt),
      note: row.record?.note ?? '',
    });
    setError(null);
  }
  if (!open && form) setForm(null);

  async function save(clear) {
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/attendance/${row.employee.id}/${date}`, {
        method: 'PUT',
        body: clear ? { checkIn: null, note: form.note } : { checkIn: form.checkIn, checkOut: form.checkOut || null, note: form.note },
      });
      toast.success(clear ? `${row.employee.name} marked absent.` : `Attendance updated for ${row.employee.name}.`);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row?.clear ? 'Mark absent' : row?.record ? 'Edit attendance' : 'Add attendance'}
      subtitle={row && `${row.employee.name} · ${formatLongDate(date)}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          {row?.clear ? (
            <button type="button" className="btn btn--danger" onClick={() => save(true)} disabled={saving}>
              {saving && <LoaderCircle className="spin" aria-hidden="true" />} Mark absent
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => save(false)} disabled={saving || !form?.checkIn}>
              {saving && <LoaderCircle className="spin" aria-hidden="true" />} Save
            </button>
          )}
        </>
      }
    >
      {open && form && (
        <div className="form-grid">
          {row.clear ? (
            <p className="form-grid__full">
              This removes the attendance record for this day, so it counts as an absence. The change is recorded in the audit log.
            </p>
          ) : (
            <>
              <label className="field">
                <span className="field__label">Check in</span>
                <span className="input">
                  <input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} required />
                </span>
              </label>
              <label className="field">
                <span className="field__label">Check out</span>
                <span className="input">
                  <input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
                </span>
                <span className="field-hint">Leave empty if they haven’t checked out.</span>
              </label>
            </>
          )}
          <label className="field form-grid__full">
            <span className="field__label">Reason / note</span>
            <textarea
              className="textarea"
              rows={2}
              maxLength={300}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Forgot phone, verified by manager"
            />
          </label>
          {error && (
            <p className="notice notice--error form-grid__full" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function ExportRange({ open, onClose, today }) {
  const toast = useToast();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const presets = [
    { label: 'This month', from: monthStart(today), to: today },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
  ];

  async function run() {
    setBusy(true);
    try {
      await download(`/admin/attendance/export${qs({ from, to })}`);
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export attendance"
      subtitle="Every employee’s attendance for each day in the range, as an Excel sheet."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={run} disabled={busy || !from || !to || from > to}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Export
          </button>
        </>
      }
    >
      <div className="chip-row">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`chip${p.from === from && p.to === to ? ' is-active' : ''}`}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">From</span>
          <span className="input">
            <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="field__label">To</span>
          <span className="input">
            <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
          </span>
        </label>
      </div>
    </Modal>
  );
}
