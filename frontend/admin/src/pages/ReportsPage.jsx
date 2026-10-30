import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronRight,
  Clock,
  Download,
  FileText,
  LoaderCircle,
  LogOut,
  UserRound,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { DepartmentBars, Legend, OverviewChart } from '../components/Charts.jsx';
import { EmployeeCell } from '../components/AttendanceTable.jsx';
import { paginate, Pagination } from '../components/Pagination.jsx';
import { useToast } from '../components/Toast.jsx';
import { EmptyState, KpiCard, PageHead, SearchField, SelectField, Skeleton, StatusPill, TableSkeleton } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { download, qs } from '../lib/api.js';
import { addDays, formatDate, formatDistance, formatDuration, formatLongDate, formatTime, monthStart } from '../lib/format.js';

const PAGE_SIZE = 10;
const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

const REPORTS = [
  { type: 'summary', title: 'Attendance Summary', text: 'Overall attendance statistics', Icon: ChartNoAxesColumn, tone: 'green' },
  { type: 'department', title: 'Department Wise Report', text: 'Attendance by department', Icon: Building2, tone: 'blue' },
  { type: 'employee', title: 'Employee Wise Report', text: 'Detailed employee attendance', Icon: Users, tone: 'blue' },
  { type: 'daily', title: 'Employee Daily Report', text: 'Each employee’s attendance day by day', Icon: CalendarDays, tone: 'green' },
  { type: 'late', title: 'Late Arrivals Report', text: 'Employees with late check-ins', Icon: Clock, tone: 'amber' },
  { type: 'absent', title: 'Absent Report', text: 'Employees who were absent', Icon: UserRound, tone: 'red' },
  { type: 'not_checked_out', title: 'Not Checked Out', text: 'Employees who didn’t check out', Icon: LogOut, tone: 'blue' },
];

export default function ReportsPage() {
  const { today } = useAuth();
  const toast = useToast();
  const initial = { from: monthStart(today), to: today, department: '', employee: '' };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [type, setType] = useState('summary');
  const [exporting, setExporting] = useState(false);
  const report = useApi(`/admin/reports${qs(applied)}`);
  const data = report.data && report.data.from === applied.from && report.data.to === applied.to ? report.data : null;
  // Day-by-day rows are only fetched for the daily report.
  const dailyReport = useApi(type === 'daily' ? `/admin/reports/daily${qs(applied)}` : null);
  const daily = dailyReport.data && dailyReport.data.from === applied.from && dailyReport.data.to === applied.to ? dailyReport.data : null;
  const totals = data?.totals;

  const presets = [
    { label: 'This month', from: monthStart(today), to: today },
    { label: 'Last month', from: monthStart(addDays(monthStart(today), -1)), to: addDays(monthStart(today), -1) },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
  ];
  const valid = draft.from && draft.to && draft.from <= draft.to;

  async function exportReport() {
    setExporting(true);
    try {
      await download(`/admin/reports/export${qs({ ...applied, type })}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHead title="Reports" subtitle="View and analyze attendance reports">
        <button type="button" className="btn btn--primary" onClick={exportReport} disabled={exporting || !data}>
          {exporting ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          Export Report
        </button>
      </PageHead>

      <section className="card filters filters--reports reveal">
        <div className="field filters__range">
          <span className="field__label">Date Range</span>
          <div className="range">
            <span className="input">
              <input type="date" value={draft.from} max={draft.to || today} onChange={(e) => setDraft({ ...draft, from: e.target.value })} aria-label="From" />
            </span>
            <span className="range__sep">–</span>
            <span className="input">
              <input type="date" value={draft.to} min={draft.from} max={today} onChange={(e) => setDraft({ ...draft, to: e.target.value })} aria-label="To" />
            </span>
          </div>
        </div>
        <SelectField
          label="Department"
          Icon={Building2}
          value={draft.department}
          onChange={(v) => setDraft({ ...draft, department: v, employee: '' })}
          options={[{ value: '', label: 'All Departments' }, ...(data?.options.departments ?? []).map((d) => ({ value: d, label: d }))]}
        />
        <SelectField
          label="Report Type"
          Icon={FileText}
          value={type}
          onChange={setType}
          options={REPORTS.map((r) => ({ value: r.type, label: r.title }))}
        />
        <SelectField
          label="Employee"
          Icon={UserRound}
          value={draft.employee}
          onChange={(v) => setDraft({ ...draft, employee: v })}
          options={[
            { value: '', label: 'All Employees' },
            ...(data?.options.employees ?? [])
              .filter((e) => !draft.department || e.department === draft.department)
              .map((e) => ({ value: e.id, label: `${e.name} (${e.id})` })),
          ]}
        />
        <button type="button" className="btn btn--primary filters__generate" disabled={!valid} onClick={() => setApplied({ ...draft })}>
          {report.loading ? <LoaderCircle className="spin" aria-hidden="true" /> : null} Generate
        </button>
        <div className="chip-row filters__presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip${applied.from === p.from && applied.to === p.to ? ' is-active' : ''}`}
              onClick={() => {
                const next = { ...draft, from: p.from, to: p.to };
                setDraft(next);
                setApplied(next);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <div className="kpis">
        <KpiCard index={1} tone="blue" Icon={Users} value={totals?.employees} label="Employees" loading={!data} />
        <KpiCard
          index={2}
          tone="green"
          Icon={CalendarCheck}
          value={totals?.attended}
          label="Present"
          percent={totals ? share(totals.attended, totals.tracked) : undefined}
          loading={!data}
        />
        <KpiCard
          index={3}
          tone="red"
          Icon={UserRound}
          value={totals?.absent}
          label="Absent"
          percent={totals ? share(totals.absent, totals.tracked) : undefined}
          loading={!data}
        />
        <KpiCard
          index={4}
          tone="amber"
          Icon={Clock}
          value={totals?.late}
          label="Late"
          percent={totals ? share(totals.late, totals.tracked) : undefined}
          loading={!data}
        />
      </div>

      {report.error && !data ? (
        <section className="card">
          <EmptyState title="Couldn’t generate the report">{report.error.message}</EmptyState>
        </section>
      ) : (
        <>
          <div className="grid-2">
            <section className="card reveal" style={{ '--i': 5 }}>
              <header className="card__head">
                <h2 className="card__title">Attendance Overview</h2>
                <Legend />
              </header>
              {data ? (
                // Weekends and holidays have nothing to plot; skipping them keeps the trend readable.
                <OverviewChart data={data.daily.filter((d) => d.present + d.late + d.absent > 0)} />
              ) : (
                <Skeleton height={260} radius={12} />
              )}
            </section>
            <section className="card reveal" style={{ '--i': 6 }}>
              <header className="card__head">
                <h2 className="card__title">Department Wise Attendance</h2>
                <Legend />
              </header>
              {data ? (
                <DepartmentBars departments={data.departments} stacked />
              ) : (
                <div className="stack">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={14} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid-report">
            <DetailedReport type={type} data={data} daily={daily} />
            <section className="card report-options reveal" style={{ '--i': 8 }}>
              <h2 className="card__title">Report Options</h2>
              <ul>
                {REPORTS.map((r) => (
                  <li key={r.type}>
                    <button
                      type="button"
                      className={`report-option${type === r.type ? ' is-active' : ''}`}
                      onClick={() => setType(r.type)}
                      aria-pressed={type === r.type}
                    >
                      <span className={`report-option__icon report-option__icon--${r.tone}`}>
                        <r.Icon aria-hidden="true" />
                      </span>
                      <span className="report-option__text">
                        <strong>{r.title}</strong>
                        <span>{r.text}</span>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function RateBar({ value }) {
  return (
    <span className="rate">
      <span className="rate__value">{value == null ? '—' : `${value}%`}</span>
      <span className="rate__bar">
        <span style={{ width: `${value ?? 0}%` }} />
      </span>
    </span>
  );
}

/** Where a check-in came from: the distance for app check-ins. */
function locationText(record) {
  if (!record) return '—';
  if (record.source === 'import') return 'Imported';
  if (record.source !== 'app') return 'Added by admin';
  return formatDistance(record.checkInDistanceM) ?? '—';
}

/** Columns and rows of the detailed table for each report type. */
function tableFor(type, data, daily) {
  if (type === 'daily') {
    return {
      columns: ['Date', 'Employee', 'Status', 'Check In', 'Check Out', 'Hours', 'Location'],
      primary: 1,
      rows: daily.rows.map((d) => ({
        key: `${d.employee.id}|${d.date}`,
        search: `${d.employee.name} ${d.employee.id} ${d.employee.department} ${d.holiday ?? ''}`,
        cells: [
          // A holiday someone worked on is tagged next to the date.
          d.holiday && d.status !== 'holiday' ? (
            <span key="d" className="report-date">
              {formatLongDate(d.date)} <span className="tag tag--holiday">{d.holiday}</span>
            </span>
          ) : (
            formatLongDate(d.date)
          ),
          <EmployeeCell key="e" employee={d.employee} />,
          <StatusPill key="s" status={d.status}>
            {d.status === 'holiday' ? d.holiday : d.minutesLate != null ? `Late · ${d.minutesLate}m` : undefined}
          </StatusPill>,
          formatTime(d.record?.checkInAt),
          formatTime(d.record?.checkOutAt),
          formatDuration(d.record?.workedMinutes),
          locationText(d.record),
        ],
      })),
    };
  }
  if (type === 'department') {
    return {
      columns: ['Department', 'Expected Days', 'Present', 'On Time', 'Late', 'Absent', 'Attendance %'],
      primary: 0,
      rows: data.departments.map((d) => ({
        key: d.department,
        search: d.department,
        cells: [<strong key="d">{d.department}</strong>, d.expected, d.attended, d.onTime, d.late, d.absent, <RateBar key="r" value={d.rate} />],
      })),
    };
  }
  if (type === 'late' || type === 'absent' || type === 'not_checked_out') {
    const list = { late: data.late, absent: data.absences, not_checked_out: data.notCheckedOut }[type];
    return {
      columns: ['Date', 'Employee', 'Department', 'Check In', 'Check Out', 'Status'],
      primary: 1,
      rows: [...list].reverse().map((d) => ({
        key: `${d.employee.id}|${d.date}`,
        search: `${d.employee.name} ${d.employee.id} ${d.employee.department}`,
        cells: [
          formatDate(d.date),
          <EmployeeCell key="e" employee={d.employee} />,
          d.employee.department || '—',
          formatTime(d.record?.checkInAt),
          formatTime(d.record?.checkOutAt),
          <StatusPill key="s" status={type === 'late' ? 'late' : d.status} />,
        ],
      })),
    };
  }
  return {
    columns: ['Employee', 'Department', 'Total Days', 'Present', 'Absent', 'Late', ...(type === 'employee' ? ['Hours', 'Missed Check-outs'] : []), 'Attendance %'],
    primary: 0,
    rows: data.employees.map((s) => ({
      key: s.employee.id,
      search: `${s.employee.name} ${s.employee.id} ${s.employee.department}`,
      cells: [
        <EmployeeCell key="e" employee={s.employee} />,
        s.employee.department || '—',
        s.tracked,
        s.attended,
        s.absent,
        s.late,
        ...(type === 'employee' ? [formatDuration(s.workedMinutes), s.missingCheckOuts] : []),
        <RateBar key="r" value={s.rate} />,
      ],
    })),
  };
}

function DetailedReport({ type, data, daily }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const table = useMemo(() => (data && (type !== 'daily' || daily) ? tableFor(type, data, daily) : null), [type, data, daily]);
  const filtered = table ? table.rows.filter((r) => !search || r.search.toLowerCase().includes(search.toLowerCase())) : [];
  const { current, rows } = paginate(filtered, page, PAGE_SIZE);
  const title = REPORTS.find((r) => r.type === type).title;
  const columnCount = table?.columns.length ?? 7;

  return (
    <section className="card card--flush reveal" style={{ '--i': 7 }}>
      <header className="card__head card__head--padded">
        <h2 className="card__title">Detailed Report · {title}</h2>
        <SearchField
          className="card__search"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search employees…"
        />
      </header>
      <div className="table-wrap">
        <table className="table table--stack">
          <thead>
            <tr>
              <th scope="col">#</th>
              {(table?.columns ?? []).map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!table ? (
              <TableSkeleton columns={columnCount + 1} rows={6} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount + 1}>
                  <EmptyState Icon={FileText} title="Nothing to report">
                    {search ? 'No rows match your search.' : 'There are no records of this kind in the selected period.'}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.key} className="reveal-row" style={{ '--i': i }}>
                  <td className="table__index">{(current - 1) * PAGE_SIZE + i + 1}</td>
                  {r.cells.map((cell, c) =>
                    c === table.primary ? (
                      <td key={c} className="td--primary">
                        {cell}
                      </td>
                    ) : (
                      <td key={c} className={typeof cell === 'number' ? 'tabular' : undefined} data-label={table.columns[c]}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {type === 'daily' && daily?.truncated && (
        <p className="muted report-note">
          Showing the first {daily.rows.length.toLocaleString()} of {daily.total.toLocaleString()} rows. Export the report for all of them.
        </p>
      )}
      {table && <Pagination page={current} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />}
    </section>
  );
}
