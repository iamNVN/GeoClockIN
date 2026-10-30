import { Clock, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmployeeCell, MobileDayCell } from '../components/AttendanceTable.jsx';
import { DepartmentBars, Legend, TrendChart } from '../components/Charts.jsx';
import { DayKpis } from '../components/DayKpis.jsx';
import { EmptyState, PageHead, Skeleton, StatusPill, TableSkeleton } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { qs } from '../lib/api.js';
import { formatLongDate, formatTime } from '../lib/format.js';

export default function DashboardPage() {
  const { date, today } = useAuth();
  const overview = useApi(`/admin/overview${qs({ date })}`);
  const data = overview.data?.date === date ? overview.data : null;

  return (
    <>
      <PageHead title="Dashboard" subtitle={date === today ? 'Today’s attendance at a glance' : formatLongDate(date)}>
        <button type="button" className="btn btn--secondary" onClick={overview.reload} disabled={overview.loading}>
          <RefreshCw className={overview.loading ? 'spin' : undefined} aria-hidden="true" /> Refresh
        </button>
      </PageHead>

      {overview.error && !data ? (
        <section className="card">
          <EmptyState title="Couldn’t load the dashboard">
            <p>{overview.error.message}</p>
            <button type="button" className="btn btn--secondary" onClick={overview.reload}>
              Try again
            </button>
          </EmptyState>
        </section>
      ) : (
        <>
          <DayKpis kpis={data?.kpis} loading={!data} />

          <div className="grid-2">
            <section className="card reveal" style={{ '--i': 4 }}>
              <header className="card__head">
                <h2 className="card__title">Attendance Trend</h2>
                <span className="muted">Last 7 days</span>
              </header>
              {data ? (
                <>
                  <TrendChart data={data.trend} />
                  <Legend />
                </>
              ) : (
                <Skeleton height={290} radius={12} />
              )}
            </section>

            <section className="card reveal" style={{ '--i': 5 }}>
              <header className="card__head">
                <h2 className="card__title">By Department</h2>
              </header>
              {data ? (
                <DepartmentBars departments={data.departments} />
              ) : (
                <div className="stack">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={14} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card card--flush reveal" style={{ '--i': 6 }}>
            <header className="card__head card__head--padded">
              <h2 className="card__title">Recent Activity</h2>
              <Link to="/attendance" className="link-btn">
                View all
              </Link>
            </header>
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Department</th>
                    <th scope="col">Check In</th>
                    <th scope="col">Check Out</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!data ? (
                    <TableSkeleton columns={5} rows={5} />
                  ) : data.recent.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState Icon={Clock} title="No check-ins yet">
                          Activity appears here as employees clock in and out.
                        </EmptyState>
                      </td>
                    </tr>
                  ) : (
                    data.recent.map((row, i) => (
                      <tr key={row.employee.id} className="reveal-row" style={{ '--i': i }}>
                        <MobileDayCell row={row} />
                        <td>
                          <EmployeeCell employee={row.employee} />
                        </td>
                        <td>{row.employee.department || '—'}</td>
                        <td className="tabular">{formatTime(row.record?.checkInAt)}</td>
                        <td className="tabular">{formatTime(row.record?.checkOutAt)}</td>
                        <td>
                          <StatusPill status={row.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
