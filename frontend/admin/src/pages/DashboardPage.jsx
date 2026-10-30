import { Clock, MapPin, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { DepartmentBars, Legend, TrendChart } from '../components/Charts.jsx';
import { AttendanceRow, ATTENDANCE_COLUMNS } from '../components/AttendanceTable.jsx';
import { DayKpis } from '../components/DayKpis.jsx';
import { EmptyState, PageHead, Skeleton, TableSkeleton } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { qs } from '../lib/api.js';
import { formatLongDate } from '../lib/format.js';

export default function DashboardPage() {
  const { date, today } = useAuth();
  const overview = useApi(`/admin/overview${qs({ date })}`);
  const data = overview.data?.date === date ? overview.data : null;
  const loading = !data;

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={date === today ? 'Overview of attendance and employee activity today' : `Overview for ${formatLongDate(date)}`}
      >
        <div className="office-chip reveal">
          <span className="office-chip__icon">
            <MapPin aria-hidden="true" />
          </span>
          <span>
            <strong>{data?.office.name ?? <Skeleton width={90} height={13} />}</strong>
            <span className="office-chip__meta">
              {data ? (
                <>
                  <span className="office-chip__live" /> Geofence {data.office.radiusMeters} m · {data.activeEmployees} active employees
                </>
              ) : (
                <Skeleton width={140} height={11} />
              )}
            </span>
          </span>
          <button type="button" className="icon-btn" onClick={overview.reload} aria-label="Refresh" title="Refresh">
            <RefreshCw className={overview.loading ? 'spin' : undefined} aria-hidden="true" />
          </button>
        </div>
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
          <DayKpis kpis={data?.kpis} loading={loading} />

          <div className="grid-2">
            <section className="card reveal" style={{ '--i': 4 }}>
              <header className="card__head">
                <h2 className="card__title">Attendance Trend</h2>
                <span className="card__meta">Last 7 days</span>
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
                <h2 className="card__title">Department Wise Attendance</h2>
                <span className="card__meta">{date === today ? 'Today' : formatLongDate(date)}</span>
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
              <h2 className="card__title">Recent Employee Activity</h2>
              <Link to="/attendance" className="link-btn">
                View All
              </Link>
            </header>
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
                  </tr>
                </thead>
                <tbody>
                  {!data ? (
                    <TableSkeleton columns={ATTENDANCE_COLUMNS.length + 1} rows={5} />
                  ) : data.recent.length === 0 ? (
                    <tr>
                      <td colSpan={ATTENDANCE_COLUMNS.length + 1}>
                        <EmptyState Icon={Clock} title="No check-ins yet">
                          Activity appears here as employees clock in and out.
                        </EmptyState>
                      </td>
                    </tr>
                  ) : (
                    data.recent.map((row, i) => <AttendanceRow key={row.employee.id} index={i + 1} row={row} />)
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
