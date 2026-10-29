import { CalendarX, ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '../components/ErrorState.jsx';
import { MonthSelect, useSelectedMonth } from '../components/MonthSelect.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useApi } from '../hooks/useApi.js';
import { dayParts, formatDistance, formatDuration, formatFullDate, formatMonth, formatTime } from '../lib/format.js';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
];

export default function HistoryPage() {
  const { month, months, setMonth } = useSelectedMonth();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const history = useApi(`/attendance/history?month=${month}`);

  const loadedMonth = history.data?.month === month;
  const days = loadedMonth ? history.data.days.filter((d) => filter === 'all' || d.status === filter) : [];

  return (
    <main className="page">
      <PageHeader title="Attendance History" />

      <div className="segmented" role="group" aria-label="Filter by status">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`segmented__option${filter === value ? ' is-active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <MonthSelect value={month} months={months} onChange={setMonth} />

      {history.error && !loadedMonth ? (
        <ErrorState error={history.error} onRetry={history.reload} />
      ) : !loadedMonth ? (
        <div className="day-list" aria-label="Loading attendance">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skeleton skeleton--card" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="empty-state">
          <CalendarX aria-hidden="true" />
          <p>
            {filter === 'all'
              ? `No attendance recorded for ${formatMonth(month)} yet.`
              : `No ${filter} days in ${formatMonth(month)}.`}
          </p>
        </div>
      ) : (
        <ul className="day-list">
          {days.map((day) => (
            <li key={day.date}>
              <DayCard day={day} onOpen={() => setSelected(day)} />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={Boolean(selected)} title="Attendance Details" onClose={() => setSelected(null)}>
        {selected && <DayDetails day={selected} />}
      </Sheet>
    </main>
  );
}

function DayCard({ day, onOpen }) {
  const { day: dayNumber, month } = dayParts(day.date);
  const { record } = day;
  return (
    <button type="button" className="card day-card" onClick={onOpen} aria-label={`${formatFullDate(day.date)}, ${day.status}. View details`}>
      <span className="day-card__date">
        <span className="day-card__day">{dayNumber}</span>
        <span className="day-card__month">{month}</span>
      </span>
      <span className="day-card__body">
        <span className="day-card__badges">
          <StatusBadge status={day.status} />
          {day.missingCheckOut && <span className="badge badge--muted">No check-out</span>}
        </span>
        <span className="day-card__times">
          <span>Check In</span>
          <span className="day-card__time">{formatTime(record?.checkInAt)}</span>
          <span>Check Out</span>
          <span className="day-card__time">{formatTime(record?.checkOutAt)}</span>
        </span>
      </span>
      <ChevronRight className="day-card__chevron" aria-hidden="true" />
    </button>
  );
}

function DayDetails({ day }) {
  const { record } = day;
  return (
    <div className="day-details">
      <div className="day-details__head">
        <p className="day-details__date">{formatFullDate(day.date)}</p>
        <StatusBadge status={day.status} />
      </div>

      {!record ? (
        <p className="day-details__empty">No attendance was recorded on this workday.</p>
      ) : (
        <dl className="detail-list">
          <div>
            <dt>Check in</dt>
            <dd>{formatTime(record.checkInAt)}</dd>
          </div>
          <div>
            <dt>Check out</dt>
            <dd>{formatTime(record.checkOutAt)}</dd>
          </div>
          <div>
            <dt>Hours worked</dt>
            <dd>{formatDuration(record.workedMinutes)}</dd>
          </div>
          <div>
            <dt>Check-in location</dt>
            <dd>
              {formatDistance(record.checkInDistanceM)} from office
              <span className="detail-list__sub">±{record.checkInAccuracyM} m accuracy</span>
            </dd>
          </div>
          {record.checkOutAt && (
            <div>
              <dt>Check-out location</dt>
              <dd>
                {formatDistance(record.checkOutDistanceM)} from office
                <span className="detail-list__sub">±{record.checkOutAccuracyM} m accuracy</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      {day.missingCheckOut && (
        <p className="notice notice--warning">
          <TriangleAlert aria-hidden="true" /> No check-out was recorded for this day. Contact your administrator if this needs
          correcting.
        </p>
      )}
    </div>
  );
}
