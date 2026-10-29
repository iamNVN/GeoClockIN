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
import { Skeleton } from '../components/Skeleton.jsx';
import { useApi, useReloadOnVisible } from '../hooks/useApi.js';
import { useEntered } from '../hooks/useEntered.js';
import { useNow } from '../hooks/useNow.js';
import { useOfficeLocation } from '../hooks/useOfficeLocation.js';
import { syncWithServer } from '../lib/clock.js';
import {
  clockParts,
  dayParts,
  formatDistanceShort,
  formatDuration,
  formatTime,
  formatTimeOfDay,
  formatToday,
  greeting,
  minutesOfDay,
} from '../lib/format.js';
import { stagger } from '../lib/motion.js';

export default function HomePage() {
  const { employee } = useAuth();
  const overview = useApi('/attendance/overview');
  const location = useOfficeLocation();
  const now = useNow();
  const data = overview.data;

  useEffect(() => {
    if (data) syncWithServer(data.serverTime);
  }, [data]);
  useReloadOnVisible(overview.reload);

  const clock = clockParts(now);

  return (
    <main className="page page--home">
      <header className="home-header reveal">
        <div>
          <p className="home-header__hello">{greeting(now)},</p>
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

      <section className="card clock-card reveal" style={stagger(1)} aria-label="Current time and location">
        <p className="clock-card__date">{formatToday(now)}</p>
        <div className="clock-card__row">
          <p className="clock-card__time">
            <time dateTime={now.toISOString()}>
              {clock.time}
              <span className="clock-card__seconds">:{clock.seconds}</span>
            </time>
            <span className="clock-card__period">{clock.period}</span>
          </p>
          <LocationBadge location={location} />
        </div>
        <p className="clock-card__hint" aria-live="polite">
          {locationHint(location)}
        </p>
      </section>

      <section className="card status-card reveal" style={stagger(2)} aria-labelledby="today-status-title">
        {data ? (
          <TodayStatus day={data.today} now={now} />
        ) : overview.error ? (
          <ErrorState error={overview.error} onRetry={overview.reload} />
        ) : (
          <TodayStatusSkeleton />
        )}
      </section>

      <PrimaryAction day={data?.today} />

      <nav className="quick-links" aria-label="Shortcuts">
        <Link to="/history" className="card quick-link reveal" style={stagger(4)}>
          <span className="quick-link__icon">
            <CalendarDays aria-hidden="true" />
          </span>
          <span className="quick-link__label">
            <span className="quick-link__lead">
              View <ChevronRight className="quick-link__chevron" aria-hidden="true" />
            </span>
            Attendance History
          </span>
        </Link>
        <Link to="/summary" className="card quick-link reveal" style={stagger(5)}>
          <span className="quick-link__icon">
            <ChartNoAxesColumn aria-hidden="true" />
          </span>
          <span className="quick-link__label">
            <span className="quick-link__lead">
              View <ChevronRight className="quick-link__chevron" aria-hidden="true" />
            </span>
            Monthly Summary
          </span>
        </Link>
      </nav>

      {data ? <WeekCard week={data.week} today={data.today.date} /> : !overview.error && <WeekCardSkeleton />}
    </main>
  );
}

/* ---------------------------------------------------------------- Location */

const BADGES = {
  idle: { tone: 'neutral', label: 'Check location', Icon: MapPin },
  checking: { tone: 'neutral', label: 'Locating…', Icon: LoaderCircle },
  inside: { tone: 'success', label: 'Inside Office', Icon: MapPin },
  outside: { tone: 'danger', label: 'Outside Office', Icon: MapPinOff },
  imprecise: { tone: 'warning', label: 'Weak Signal', Icon: MapPin },
  denied: { tone: 'danger', label: 'Location Blocked', Icon: MapPinOff },
  error: { tone: 'warning', label: 'Unavailable', Icon: MapPinOff },
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
      {tone === 'success' && <span className="location-badge__pulse" aria-hidden="true" />}
    </button>
  );
}

function locationHint(location) {
  const { verification } = location;
  switch (location.status) {
    case 'checking':
      return 'Finding your location…';
    case 'inside':
      return `You are at the office location · ${formatDistanceShort(verification.distanceM)} away`;
    case 'outside':
      return `You are ${formatDistanceShort(verification.distanceM)} from the office`;
    case 'imprecise':
      return 'Location signal is weak. Move near a window and tap to retry.';
    case 'denied':
      return 'Allow location access in your browser settings to clock in.';
    case 'error':
      return location.error.message;
    default:
      return 'Your location is verified when you clock in.';
  }
}

/* ------------------------------------------------------------------- Today */

function statusChip(day) {
  const { record } = day;
  if (record?.checkOutAt) return { tone: 'present', label: 'Completed' };
  if (record) return record.isLate ? { tone: 'late', label: 'Late' } : { tone: 'present', label: 'On time' };
  if (!day.isWorkday) return { tone: 'muted', label: 'Day off' };
  return { tone: 'muted', label: 'Not checked in' };
}

function TodayStatus({ day, now }) {
  const { record } = day;
  const chip = statusChip(day);

  return (
    <>
      <header className="card-head">
        <h2 id="today-status-title">Today&apos;s Status</h2>
        <span className={`badge badge--${chip.tone} pop-in`}>{chip.label}</span>
      </header>
      <ol className={`timeline${record?.checkOutAt ? ' is-complete' : ''}`}>
        <li className={`timeline__item${record ? ' is-done' : ''}`}>
          <span className="timeline__dot">{record && <Check aria-hidden="true" />}</span>
          <span className="timeline__label">{record ? 'Checked In' : 'Check In'}</span>
          <span className="timeline__time">{formatTime(record?.checkInAt)}</span>
        </li>
        <li className={`timeline__item${record?.checkOutAt ? ' is-done' : ''}`}>
          <span className="timeline__dot">{record?.checkOutAt && <Check aria-hidden="true" />}</span>
          <span className="timeline__label">{record?.checkOutAt ? 'Checked Out' : 'Check Out'}</span>
          <span className="timeline__time">{formatTime(record?.checkOutAt)}</span>
        </li>
      </ol>
      <ShiftProgress day={day} now={now} />
    </>
  );
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const clamp = (n) => Math.min(100, Math.max(0, n));
const describeDuration = (minutes) => (minutes < 1 ? 'less than a minute' : formatDuration(minutes));

function ShiftProgress({ day, now }) {
  const { schedule } = useAuth();
  const entered = useEntered(250);
  const { record } = day;
  const start = toMinutes(schedule.workStart);
  const end = toMinutes(schedule.workEnd);
  const current = minutesOfDay(now);
  const nowPct = clamp(((current - start) / (end - start)) * 100);
  const inShift = day.isWorkday && current >= start && current < end;

  let caption;
  if (record?.checkOutAt) caption = `Worked ${describeDuration(record.workedMinutes)} today`;
  else if (record) caption = `Working for ${describeDuration(Math.floor((now - new Date(record.checkInAt)) / 60_000))}`;
  else if (!day.isWorkday) caption = 'No shift today';
  else if (current < start) caption = `Shift starts in ${formatDuration(start - current)}`;
  else if (current < end) caption = `${formatDuration(end - current)} left in shift`;
  else caption = 'Shift ended';

  return (
    <div className="shift">
      <div className="shift__track">
        <span className="shift__fill" style={{ width: `${entered && day.isWorkday ? nowPct : 0}%` }} />
        {inShift && <span className="shift__now" style={{ left: `${entered ? nowPct : 0}%` }} />}
      </div>
      <div className="shift__labels">
        <span>{formatTimeOfDay(schedule.workStart)}</span>
        <span className="shift__caption">{caption}</span>
        <span>{formatTimeOfDay(schedule.workEnd)}</span>
      </div>
    </div>
  );
}

function TodayStatusSkeleton() {
  return (
    <div aria-label="Loading today's status">
      <header className="card-head">
        <Skeleton width={120} height={18} />
        <Skeleton width={96} height={24} radius={999} />
      </header>
      <div className="timeline">
        {[0, 1].map((i) => (
          <div key={i} className="timeline__item">
            <Skeleton width={22} circle />
            <Skeleton width="45%" height={15} />
            <Skeleton width={70} height={15} />
          </div>
        ))}
      </div>
      <div className="shift">
        <Skeleton height={8} radius={999} />
      </div>
    </div>
  );
}

function PrimaryAction({ day }) {
  if (!day) return <Skeleton height={52} radius={15} />;
  if (day.canCheckOut) {
    return (
      <Link to="/clock/out" className="btn btn--dark btn--block btn--xl btn--shine reveal" style={stagger(3)}>
        <LogOut aria-hidden="true" /> Clock Out
      </Link>
    );
  }
  if (!day.canCheckIn) {
    return (
      <p className="btn btn--done btn--block btn--xl reveal" style={stagger(3)} role="status">
        <CircleCheck aria-hidden="true" /> You&apos;re all done for today
      </p>
    );
  }
  return (
    <Link to="/clock/in" className="btn btn--primary btn--block btn--xl btn--shine btn--glow reveal" style={stagger(3)}>
      <Clock aria-hidden="true" /> Clock In
    </Link>
  );
}

/* -------------------------------------------------------------------- Week */

const STATUS_WORDS = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  pending: 'upcoming',
  off: 'day off',
};

function WeekCard({ week, today }) {
  const attended = week.filter((d) => d.status === 'present' || d.status === 'late').length;
  const workdays = week.filter((d) => d.status !== 'off').length;

  return (
    <section className="card week-card reveal" style={stagger(6)} aria-labelledby="week-title">
      <header className="card-head">
        <h2 id="week-title">This Week</h2>
        <span className="card-head__meta">
          {attended} of {workdays} days
        </span>
      </header>
      <ol className="week">
        {week.map((d, i) => {
          const { day, weekday } = dayParts(d.date);
          const isToday = d.date === today;
          return (
            <li
              key={d.date}
              className={`week__day week__day--${d.status}${isToday ? ' is-today' : ''}`}
              style={stagger(i)}
              aria-label={`${weekday} ${day}: ${isToday ? 'today, ' : ''}${STATUS_WORDS[d.status]}`}
            >
              <span className="week__label">{weekday.slice(0, 1)}</span>
              <span className="week__dot">{day}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WeekCardSkeleton() {
  return (
    <section className="card week-card" aria-hidden="true">
      <header className="card-head">
        <Skeleton width={96} height={18} />
        <Skeleton width={70} height={14} />
      </header>
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="week__day">
            <Skeleton width={10} height={10} />
            <span className="week__dot week__dot--skeleton">
              <Skeleton width="100%" height="100%" radius={13} />
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
