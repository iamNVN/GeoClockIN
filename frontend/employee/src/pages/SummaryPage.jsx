import { CalendarX, ChevronRight, Clock, Hourglass, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState } from '../components/ErrorState.jsx';
import { MonthSwitcher, useSelectedMonth } from '../components/MonthSwitcher.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { ProgressRing } from '../components/ProgressRing.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { CountUp } from '../hooks/useCountUp.js';
import { useApi } from '../hooks/useApi.js';
import { addDays, formatDuration, formatFullDate, formatMinutesOfDay } from '../lib/format.js';
import { stagger } from '../lib/motion.js';

const SEGMENTS = [
  { key: 'present', label: 'Present' },
  { key: 'late', label: 'Late' },
  { key: 'absent', label: 'Absent' },
];

export default function SummaryPage() {
  const { month, months, setMonth } = useSelectedMonth();
  const history = useApi(`/attendance/history?month=${month}`);
  const loaded = history.data?.month === month ? history.data : null;

  return (
    <main className="page">
      <PageHeader title="Monthly Summary" />
      <MonthSwitcher value={month} months={months} onChange={setMonth} />

      {loaded ? (
        <SummaryContent key={month} data={loaded} />
      ) : history.error ? (
        <section className="card">
          <ErrorState error={history.error} onRetry={history.reload} />
        </section>
      ) : (
        <SummarySkeleton />
      )}
    </main>
  );
}

function SummaryContent({ data }) {
  const { summary } = data;
  return (
    <>
      <section className="card summary-hero reveal" aria-label="Attendance rate">
        <ProgressRing value={summary.attendanceRate ?? 0} size={128} stroke={12}>
          <strong className="summary-hero__rate">
            <CountUp value={summary.attendanceRate} suffix="%" />
          </strong>
          <span className="summary-hero__caption">attendance</span>
        </ProgressRing>
        <ul className="legend">
          {SEGMENTS.map((s, i) => (
            <li key={s.key} className="reveal" style={stagger(i + 1)}>
              <span className={`dot dot--${s.key}`} aria-hidden="true" />
              <span className="legend__label">{s.label}</span>
              <strong>
                <CountUp value={summary[s.key]} />
              </strong>
            </li>
          ))}
          <li className="legend__total reveal" style={stagger(4)}>
            <span className="legend__label">Tracked days</span>
            <strong>
              <CountUp value={summary.trackedDays} />
            </strong>
          </li>
        </ul>
      </section>

      <section className="card calendar-card reveal" style={stagger(1)} aria-labelledby="calendar-title">
        <header className="card-head">
          <h2 id="calendar-title">Calendar</h2>
          <span className="calendar-legend" aria-hidden="true">
            {SEGMENTS.map((s) => (
              <span key={s.key}>
                <span className={`dot dot--${s.key}`} />
                {s.label}
              </span>
            ))}
          </span>
        </header>
        <MonthCalendar month={data.month} days={data.days} today={data.today} />
      </section>

      <section className="tile-grid" aria-label="Working hours">
        <Tile index={2} Icon={Hourglass} label="Total hours" value={formatDuration(summary.totalWorkedMinutes)} />
        <Tile index={3} Icon={Timer} label="Average per day" value={formatDuration(summary.averageWorkedMinutes)} />
        <Tile index={4} Icon={Clock} label="Average check-in" value={formatMinutesOfDay(summary.averageCheckInMinutes)} />
        <Tile
          index={5}
          Icon={CalendarX}
          label="Missing check-outs"
          value={String(summary.missingCheckOuts)}
          warn={summary.missingCheckOuts > 0}
        />
      </section>

      <Link to={`/history?month=${data.month}`} className="card link-row reveal" style={stagger(6)}>
        View daily attendance
        <ChevronRight aria-hidden="true" />
      </Link>
    </>
  );
}

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid (Monday first) tinted by each day's attendance status. */
function MonthCalendar({ month, days, today }) {
  const byDate = new Map(days.map((d) => [d.date, d.status]));
  const first = `${month}-01`;
  const leading = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [];
  for (let date = first; date.startsWith(month); date = addDays(date, 1)) cells.push(date);

  return (
    <div className="calendar" role="grid" aria-label="Attendance calendar">
      {WEEKDAY_HEADERS.map((d, i) => (
        <span key={i} className="calendar__head" aria-hidden="true">
          {d}
        </span>
      ))}
      {Array.from({ length: leading }, (_, i) => (
        <span key={`blank-${i}`} aria-hidden="true" />
      ))}
      {cells.map((date, i) => {
        const status = byDate.get(date) ?? (date > today ? 'future' : 'none');
        return (
          <span
            key={date}
            className={`calendar__day calendar__day--${status}${date === today ? ' is-today' : ''}`}
            style={{ '--i': i }}
            role="gridcell"
            aria-label={`${formatFullDate(date)}${byDate.has(date) ? `: ${status}` : ''}`}
          >
            {Number(date.slice(8))}
          </span>
        );
      })}
    </div>
  );
}

function Tile({ index, Icon, label, value, warn = false }) {
  return (
    <div className={`card tile reveal${warn ? ' tile--warn' : ''}`} style={stagger(index)}>
      <span className="tile__icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="tile__value">{value}</span>
      <span className="tile__label">{label}</span>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <>
      <section className="card summary-hero" aria-label="Loading summary">
        <Skeleton width={128} circle />
        <div className="legend">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={16} width={i === 3 ? '80%' : '100%'} />
          ))}
        </div>
      </section>
      <section className="card calendar-card" aria-hidden="true">
        <Skeleton width={90} height={18} />
        <div className="calendar">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} height={34} radius={10} />
          ))}
        </div>
      </section>
      <section className="tile-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card tile">
            <Skeleton width={36} circle />
            <Skeleton width="60%" height={20} />
            <Skeleton width="80%" height={12} />
          </div>
        ))}
      </section>
    </>
  );
}
