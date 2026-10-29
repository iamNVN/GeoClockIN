import { CalendarCheck, ChevronRight, Clock, Hourglass, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState } from '../components/ErrorState.jsx';
import { MonthSelect, useSelectedMonth } from '../components/MonthSelect.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDuration, formatMinutesOfDay, formatMonth } from '../lib/format.js';

const SEGMENTS = [
  { key: 'present', label: 'Present' },
  { key: 'late', label: 'Late' },
  { key: 'absent', label: 'Absent' },
];

export default function SummaryPage() {
  const { month, months, setMonth } = useSelectedMonth();
  const history = useApi(`/attendance/history?month=${month}`);
  const summary = history.data?.month === month ? history.data.summary : null;

  return (
    <main className="page">
      <PageHeader title="Monthly Summary" />
      <MonthSelect value={month} months={months} onChange={setMonth} />

      {summary ? (
        <SummaryContent summary={summary} month={month} />
      ) : history.error ? (
        <ErrorState error={history.error} onRetry={history.reload} />
      ) : (
        <div className="day-list" aria-label="Loading summary">
          <span className="skeleton skeleton--hero" />
          <span className="skeleton skeleton--card" />
        </div>
      )}
    </main>
  );
}

function SummaryContent({ summary, month }) {
  const { trackedDays } = summary;
  return (
    <>
      <section className="card summary-hero" aria-labelledby="rate-title">
        <div className="summary-hero__top">
          <div>
            <h2 id="rate-title" className="summary-hero__label">
              Attendance rate
            </h2>
            <p className="summary-hero__value">{summary.attendanceRate == null ? '—' : `${summary.attendanceRate}%`}</p>
          </div>
          <p className="summary-hero__caption">
            {trackedDays} tracked {trackedDays === 1 ? 'day' : 'days'}
            <br />
            in {formatMonth(month)}
          </p>
        </div>

        {trackedDays > 0 && (
          <div className="stack-bar" role="img" aria-label={SEGMENTS.map((s) => `${summary[s.key]} ${s.label.toLowerCase()}`).join(', ')}>
            {SEGMENTS.filter((s) => summary[s.key] > 0).map((s) => (
              <span key={s.key} className={`stack-bar__seg stack-bar__seg--${s.key}`} style={{ flexGrow: summary[s.key] }} />
            ))}
          </div>
        )}

        <ul className="stat-grid">
          {SEGMENTS.map((s) => (
            <li key={s.key} className={`stat stat--${s.key}`}>
              <span className="stat__value">{summary[s.key]}</span>
              <span className="stat__label">
                <span className={`dot dot--${s.key}`} aria-hidden="true" />
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card metric-list" aria-label="Working hours">
        <Metric Icon={Hourglass} label="Total hours worked" value={formatDuration(summary.totalWorkedMinutes)} />
        <Metric Icon={Timer} label="Average per day" value={formatDuration(summary.averageWorkedMinutes)} />
        <Metric Icon={Clock} label="Average check-in" value={formatMinutesOfDay(summary.averageCheckInMinutes)} />
        <Metric
          Icon={CalendarCheck}
          label="Missing check-outs"
          value={String(summary.missingCheckOuts)}
          warn={summary.missingCheckOuts > 0}
        />
      </section>

      <Link to={`/history?month=${month}`} className="card quick-link quick-link--row">
        <span className="quick-link__label">View daily attendance</span>
        <ChevronRight className="quick-link__chevron" aria-hidden="true" />
      </Link>
    </>
  );
}

function Metric({ Icon, label, value, warn = false }) {
  return (
    <div className="metric">
      <Icon className="metric__icon" aria-hidden="true" />
      <span className="metric__label">{label}</span>
      <span className={`metric__value${warn ? ' metric__value--warn' : ''}`}>{value}</span>
    </div>
  );
}
