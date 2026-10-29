import { ArrowRight, ChevronRight, LogIn, LogOut, Timer, TriangleAlert } from 'lucide-react';
import { dayParts, formatDistanceShort, formatDuration, formatFullDate, formatTime } from '../lib/format.js';
import { StatusBadge } from './StatusBadge.jsx';

function subtitle(day) {
  const { record } = day;
  if (!record) return 'No attendance recorded';
  if (record.checkOutAt) return `${formatDuration(record.workedMinutes)} worked`;
  if (day.missingCheckOut) return 'No check-out recorded';
  return 'Shift in progress';
}

/** One attendance day: date tile, times, status. */
export function DayRow({ day, onOpen, style }) {
  const { day: dayNumber, weekday } = dayParts(day.date);
  const { record } = day;

  return (
    <button
      type="button"
      className={`day-row day-row--${day.status} reveal`}
      style={style}
      onClick={onOpen}
      aria-label={`${formatFullDate(day.date)}, ${day.status}. View details`}
    >
      <span className="day-row__date">
        <span className="day-row__num">{dayNumber}</span>
        <span className="day-row__weekday">{weekday}</span>
      </span>
      <span className="day-row__body">
        <span className="day-row__times">
          {record ? (
            <>
              {formatTime(record.checkInAt)}
              <ArrowRight aria-hidden="true" />
              {formatTime(record.checkOutAt)}
            </>
          ) : (
            'Absent'
          )}
        </span>
        <span className={`day-row__sub${day.missingCheckOut ? ' is-warn' : ''}`}>{subtitle(day)}</span>
      </span>
      <StatusBadge status={day.status} />
      <ChevronRight className="day-row__chevron" aria-hidden="true" />
    </button>
  );
}

/** Bottom-sheet content for one day. */
export function DayDetails({ day }) {
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
        <ol className="detail-timeline">
          <li className="is-done">
            <span className="detail-timeline__icon">
              <LogIn aria-hidden="true" />
            </span>
            <span className="detail-timeline__label">
              Checked in
              <small>{formatDistanceShort(record.checkInDistanceM)} from office</small>
            </span>
            <span className="detail-timeline__value">{formatTime(record.checkInAt)}</span>
          </li>
          <li className={record.checkOutAt ? 'is-done' : ''}>
            <span className="detail-timeline__icon">
              <LogOut aria-hidden="true" />
            </span>
            <span className="detail-timeline__label">
              {record.checkOutAt ? 'Checked out' : 'Check out'}
              {record.checkOutAt && <small>{formatDistanceShort(record.checkOutDistanceM)} from office</small>}
            </span>
            <span className="detail-timeline__value">{formatTime(record.checkOutAt)}</span>
          </li>
          <li className="detail-timeline__total">
            <span className="detail-timeline__icon">
              <Timer aria-hidden="true" />
            </span>
            <span className="detail-timeline__label">Hours worked</span>
            <span className="detail-timeline__value">{formatDuration(record.workedMinutes)}</span>
          </li>
        </ol>
      )}

      {day.missingCheckOut && (
        <p className="notice notice--warning">
          <TriangleAlert aria-hidden="true" /> No check-out was recorded for this day. Contact your administrator if this
          needs correcting.
        </p>
      )}
    </div>
  );
}
