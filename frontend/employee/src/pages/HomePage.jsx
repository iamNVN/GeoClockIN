import {
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  LoaderCircle,
  LogOut,
  MapPin,
  MapPinOff,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useApi, useReloadOnVisible } from '../hooks/useApi.js';
import { useNow } from '../hooks/useNow.js';
import { useOfficeLocation } from '../hooks/useOfficeLocation.js';
import { syncWithServer } from '../lib/clock.js';
import { formatDistance, formatDuration, formatTime, formatTimeOfDay, formatToday } from '../lib/format.js';

export default function HomePage() {
  const { employee } = useAuth();
  const today = useApi('/attendance/today');
  const location = useOfficeLocation();
  const now = useNow();

  useEffect(() => {
    if (today.data) syncWithServer(today.data.serverTime);
  }, [today.data]);
  useReloadOnVisible(today.reload);

  return (
    <main className="page page--home">
      <header className="home-header">
        <div>
          <p className="home-header__hello">Hello,</p>
          <h1 className="home-header__name">{employee.name}</h1>
          <p className="home-header__meta">
            {employee.id}
            {employee.designation && ` • ${employee.designation}`}
          </p>
        </div>
        <Link to="/profile" className="home-header__avatar" aria-label="Open profile">
          <Avatar name={employee.name} size="md" />
        </Link>
      </header>

      <section className="card clock-card" aria-label="Current time and location">
        <p className="clock-card__date">{formatToday(now)}</p>
        <div className="clock-card__row">
          <p className="clock-card__time">
            <time dateTime={now.toISOString()}>{formatTime(now)}</time>
          </p>
          <LocationBadge location={location} />
        </div>
        <p className="clock-card__hint" aria-live="polite">
          {locationHint(location)}
        </p>
      </section>

      <section className="card status-card" aria-labelledby="today-status-title">
        <h2 id="today-status-title" className="card-title">
          Today&apos;s Status
        </h2>
        {today.data ? (
          <TodayStatus day={today.data} now={now} />
        ) : today.error ? (
          <ErrorState error={today.error} onRetry={today.reload} />
        ) : (
          <div className="skeleton-stack" aria-label="Loading today's status">
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        )}
      </section>

      <PrimaryAction day={today.data} />

      <nav className="quick-links" aria-label="Shortcuts">
        <Link to="/history" className="card quick-link">
          <CalendarDays className="quick-link__icon" aria-hidden="true" />
          <span className="quick-link__label">
            <span className="quick-link__lead">
              View <ChevronRight className="quick-link__chevron" aria-hidden="true" />
            </span>
            Attendance History
          </span>
        </Link>
        <Link to="/summary" className="card quick-link">
          <ChartNoAxesColumn className="quick-link__icon" aria-hidden="true" />
          <span className="quick-link__label">
            <span className="quick-link__lead">
              View <ChevronRight className="quick-link__chevron" aria-hidden="true" />
            </span>
            Monthly Summary
          </span>
        </Link>
      </nav>
    </main>
  );
}

const BADGES = {
  idle: { tone: 'neutral', label: 'Check location', Icon: MapPin },
  checking: { tone: 'neutral', label: 'Locating…', Icon: LoaderCircle },
  inside: { tone: 'success', label: 'Inside Office', Icon: MapPin },
  outside: { tone: 'danger', label: 'Outside Office', Icon: MapPinOff },
  imprecise: { tone: 'warning', label: 'Low Accuracy', Icon: MapPin },
  denied: { tone: 'danger', label: 'Location Blocked', Icon: MapPinOff },
  error: { tone: 'warning', label: 'Location Unavailable', Icon: MapPinOff },
};

function LocationBadge({ location }) {
  const { tone, label, Icon } = BADGES[location.status];
  const checking = location.status === 'checking';
  return (
    <button
      type="button"
      className={`location-badge location-badge--${tone}`}
      onClick={() => location.check()}
      disabled={checking}
      aria-label={checking ? 'Checking your location' : `${label}. Tap to check your location again.`}
    >
      <Icon className={checking ? 'spin' : undefined} aria-hidden="true" />
      {label}
    </button>
  );
}

function locationHint(location) {
  const { verification } = location;
  switch (location.status) {
    case 'checking':
      return 'Finding your location…';
    case 'inside':
      return 'You are at the office location';
    case 'outside':
      return `You are ${formatDistance(verification.distanceM)} from the office`;
    case 'imprecise':
      return `Location accuracy is low (±${verification.accuracyM} m). Move near a window.`;
    case 'denied':
      return 'Allow location access in your browser settings to clock in.';
    case 'error':
      return location.error.message;
    default:
      return 'Your location is verified when you clock in.';
  }
}

const describeDuration = (minutes) => (minutes < 1 ? 'less than a minute' : formatDuration(minutes));

function TodayStatus({ day, now }) {
  const { record } = day;
  const { schedule } = useAuth();

  let footer;
  if (record?.checkOutAt) {
    footer = `Worked ${describeDuration(record.workedMinutes)} today`;
  } else if (record) {
    footer = `Working for ${describeDuration(Math.floor((now - new Date(record.checkInAt)) / 60_000))}`;
  } else if (!day.isWorkday) {
    footer = 'Today is not a scheduled workday.';
  } else {
    footer = `Work starts at ${formatTimeOfDay(schedule.workStart)} · ${schedule.graceMinutes} min grace period`;
  }

  return (
    <>
      <ol className="timeline">
        <li className={`timeline__item${record ? ' is-done' : ''}`}>
          <span className="timeline__dot">{record && <Check aria-hidden="true" />}</span>
          <span className="timeline__label">
            {record ? 'Checked In' : 'Check In'}
            {record?.isLate && <StatusBadge status="late" />}
          </span>
          <span className="timeline__time">{formatTime(record?.checkInAt)}</span>
        </li>
        <li className={`timeline__item${record?.checkOutAt ? ' is-done' : ''}`}>
          <span className="timeline__dot">{record?.checkOutAt && <Check aria-hidden="true" />}</span>
          <span className="timeline__label">{record?.checkOutAt ? 'Checked Out' : 'Check Out'}</span>
          <span className="timeline__time">{formatTime(record?.checkOutAt)}</span>
        </li>
      </ol>
      <p className="status-card__footer">{footer}</p>
    </>
  );
}

function PrimaryAction({ day }) {
  if (day?.canCheckOut) {
    return (
      <Link to="/clock/out" className="btn btn--primary btn--block btn--lg">
        <LogOut aria-hidden="true" /> Clock Out
      </Link>
    );
  }
  if (day && !day.canCheckIn) {
    return (
      <p className="btn btn--done btn--block btn--lg" role="status">
        <CircleCheck aria-hidden="true" /> You&apos;re all done for today
      </p>
    );
  }
  if (!day) {
    return (
      <button type="button" className="btn btn--primary btn--block btn--lg" disabled>
        <Clock aria-hidden="true" /> Clock In
      </button>
    );
  }
  return (
    <Link to="/clock/in" className="btn btn--primary btn--block btn--lg">
      <Clock aria-hidden="true" /> Clock In
    </Link>
  );
}
