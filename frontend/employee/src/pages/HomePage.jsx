import {
  ChevronRight,
  CircleCheck,
  Clock,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Timer,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { DayRow } from '../components/DayRow.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { BrandMark } from '../components/Logo.jsx';
import { ProgressRing } from '../components/ProgressRing.jsx';
import { DayRowsSkeleton, Skeleton } from '../components/Skeleton.jsx';
import { CountUp } from '../hooks/useCountUp.js';
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
  formatMonth,
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
      <section className="hero">
        <div className="hero__top reveal">
          <span className="hero__brand">
            <span className="hero__brand-mark">
              <BrandMark size={22} />
            </span>
            GeoClockIN
          </span>
          <Link to="/profile" className="hero__avatar" aria-label="Open profile">
            <Avatar name={employee.name} size="md" />
          </Link>
        </div>

        <div className="hero__greeting reveal" style={stagger(1)}>
          <p className="hero__hello">{greeting(now)},</p>
          <h1 className="hero__name">{employee.name}</h1>
          <p className="hero__meta">
            <span className="hero__chip">{employee.id}</span>
            {employee.designation}
          </p>
        </div>

        <div className="hero-clock reveal" style={stagger(2)}>
          <div className="hero-clock__row">
            <div>
              <p className="hero-clock__date">{formatToday(now)}</p>
              <p className="hero-clock__time">
                <time dateTime={now.toISOString()}>
                  {clock.time}
                  <span className="hero-clock__seconds">:{clock.seconds}</span>
                </time>
                <span className="hero-clock__period">{clock.period}</span>
              </p>
            </div>
            <LocationBadge location={location} />
          </div>
          <p className="hero-clock__hint" aria-live="polite">
            {locationHint(location)}
          </p>
        </div>
      </section>

      <div className="home-body">
        {data ? (
          <TodayCard day={data.today} now={now} />
        ) : overview.error ? (
          <section className="card">
            <ErrorState error={overview.error} onRetry={overview.reload} />
          </section>
        ) : (
          <TodayCardSkeleton />
        )}

        <PrimaryAction day={data?.today} />

        {data ? <WeekCard week={data.week} today={data.today.date} /> : !overview.error && <WeekCardSkeleton />}
        {data ? <MonthCard month={data.month} /> : !overview.error && <MonthCardSkeleton />}
        {data ? <RecentCard recent={data.recent} /> : !overview.error && <RecentCardSkeleton />}
      </div>
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
      {tone === 'success' ? (
        <span className="location-badge__pulse" aria-hidden="true" />
      ) : (
        <Icon className={checking ? 'spin' : undefined} aria-hidden="true" />
      )}
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
      return `You are at the office · ${formatDistanceShort(verification.distanceM)} away`;
    case 'outside':
      return `You are ${formatDistanceShort(verification.distanceM)} from the office`;
    case 'imprecise':
      return 'Location signal is weak. Move near a window and tap to retry.';
    case 'denied':
      return 'Allow location access in your browser settings to clock in.';
    case 'error':
      return location.error.message;
    default:
      return 'Tap “Check location” to see if you are at the office.';
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

function TodayCard({ day, now }) {
  const { record } = day;
  const chip = statusChip(day);
  const worked = record?.checkOutAt
    ? formatDuration(record.workedMinutes)
    : record
      ? formatDuration(Math.max(0, Math.floor((now - new Date(record.checkInAt)) / 60_000)))
      : '—';

  return (
    <section className="card today-card reveal" style={stagger(3)} aria-labelledby="today-title">
      <header className="card-head">
        <h2 id="today-title">Today&apos;s Status</h2>
        <span className={`badge badge--${chip.tone}`}>{chip.label}</span>
      </header>
      <div className="today-stats">
        <TodayStat Icon={LogIn} label="Check in" value={formatTime(record?.checkInAt)} done={Boolean(record)} />
        <TodayStat
          Icon={LogOut}
          label="Check out"
          value={formatTime(record?.checkOutAt)}
          done={Boolean(record?.checkOutAt)}
        />
        <TodayStat Icon={Timer} label="Worked" value={worked} done={Boolean(record)} live={record && !record.checkOutAt} />
      </div>
      <ShiftProgress day={day} now={now} />
    </section>
  );
}

function TodayStat({ Icon, label, value, done, live = false }) {
  return (
    <div className={`today-stat${done ? ' is-done' : ''}`}>
      <span className="today-stat__icon">
        <Icon aria-hidden="true" />
        {live && <span className="today-stat__live" aria-hidden="true" />}
      </span>
      <span className="today-stat__label">{label}</span>
      <span className="today-stat__value">{value}</span>
    </div>
  );
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const clamp = (n) => Math.min(100, Math.max(0, n));

function ShiftProgress({ day, now }) {
  const { schedule } = useAuth();
  const entered = useEntered(150);
  const start = toMinutes(schedule.workStart);
  const end = toMinutes(schedule.workEnd);
  const current = minutesOfDay(now);
  const nowPct = clamp(((current - start) / (end - start)) * 100);
  const checkInPct = day.record ? clamp(((minutesOfDay(new Date(day.record.checkInAt)) - start) / (end - start)) * 100) : null;

  let caption;
  if (!day.isWorkday) caption = 'No shift today';
  else if (current < start) caption = `Shift starts in ${formatDuration(start - current)}`;
  else if (current < end) caption = `${formatDuration(end - current)} left in shift`;
  else caption = 'Shift ended';

  return (
    <div className="shift">
      <div className="shift__track">
        <span className="shift__fill" style={{ width: `${entered ? nowPct : 0}%` }} />
        {checkInPct != null && (
          <span className="shift__mark" style={{ left: `${checkInPct}%` }} title="Checked in" />
        )}
        {day.isWorkday && current >= start && current < end && (
          <span className="shift__now" style={{ left: `${entered ? nowPct : 0}%` }} />
        )}
      </div>
      <div className="shift__labels">
        <span>{formatTimeOfDay(schedule.workStart)}</span>
        <span className="shift__caption">{caption}</span>
        <span>{formatTimeOfDay(schedule.workEnd)}</span>
      </div>
    </div>
  );
}

function TodayCardSkeleton() {
  return (
    <section className="card today-card" aria-label="Loading today's status">
      <header className="card-head">
        <Skeleton width={120} height={18} />
        <Skeleton width={84} height={24} radius={999} />
      </header>
      <div className="today-stats">
        {[0, 1, 2].map((i) => (
          <div key={i} className="today-stat">
            <Skeleton width={34} circle />
            <Skeleton width="70%" height={11} />
            <Skeleton width="85%" height={16} />
          </div>
        ))}
      </div>
      <Skeleton height={8} radius={999} />
    </section>
  );
}

function PrimaryAction({ day }) {
  if (day?.canCheckOut) {
    return (
      <Link to="/clock/out" className="btn btn--dark btn--block btn--xl btn--shine reveal" style={stagger(4)}>
        <LogOut aria-hidden="true" /> Clock Out
      </Link>
    );
  }
  if (day && !day.canCheckIn) {
    return (
      <p className="btn btn--done btn--block btn--xl reveal" style={stagger(4)} role="status">
        <CircleCheck aria-hidden="true" /> You&apos;re all done for today
      </p>
    );
  }
  if (!day) {
    return <Skeleton height={60} radius={18} />;
  }
  return (
    <Link to="/clock/in" className="btn btn--primary btn--block btn--xl btn--shine btn--glow reveal" style={stagger(4)}>
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
    <section className="card week-card reveal" style={stagger(5)} aria-labelledby="week-title">
      <header className="card-head">
        <h2 id="week-title">This Week</h2>
        <span className="card-head__meta">
          {attended}/{workdays} days
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
        <Skeleton width={56} height={14} />
      </header>
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="week__day">
            <Skeleton width={10} height={10} />
            <Skeleton width={36} circle />
          </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- Month */

function MonthCard({ month }) {
  const { summary } = month;
  return (
    <Link to="/summary" className="card month-card reveal" style={stagger(6)}>
      <ProgressRing value={summary.attendanceRate ?? 0} size={78} stroke={8}>
        <strong className="month-card__rate">
          <CountUp value={summary.attendanceRate} suffix="%" />
        </strong>
      </ProgressRing>
      <span className="month-card__body">
        <span className="month-card__title">{formatMonth(month.month).split(' ')[0]} Overview</span>
        <span className="mini-stats">
          <MiniStat tone="present" label="Present" value={summary.present} />
          <MiniStat tone="late" label="Late" value={summary.late} />
          <MiniStat tone="absent" label="Absent" value={summary.absent} />
        </span>
      </span>
      <ChevronRight className="month-card__chevron" aria-hidden="true" />
    </Link>
  );
}

function MiniStat({ tone, label, value }) {
  return (
    <span className="mini-stat">
      <strong>
        <CountUp value={value} />
      </strong>
      <span>
        <span className={`dot dot--${tone}`} aria-hidden="true" />
        {label}
      </span>
    </span>
  );
}

function MonthCardSkeleton() {
  return (
    <section className="card month-card" aria-hidden="true">
      <Skeleton width={78} circle />
      <span className="month-card__body">
        <Skeleton width={140} height={16} />
        <span className="mini-stats">
          {[0, 1, 2].map((i) => (
            <span key={i} className="mini-stat">
              <Skeleton width={26} height={20} />
              <Skeleton width={48} height={11} />
            </span>
          ))}
        </span>
      </span>
    </section>
  );
}

/* ------------------------------------------------------------------ Recent */

function RecentCard({ recent }) {
  const navigate = useNavigate();
  return (
    <section className="card list-card reveal" style={stagger(7)} aria-labelledby="recent-title">
      <header className="card-head">
        <h2 id="recent-title">Recent Activity</h2>
        <Link to="/history" className="card-head__link">
          See all
        </Link>
      </header>
      {recent.length ? (
        <div className="day-list">
          {recent.map((day, i) => (
            <DayRow key={day.date} day={day} style={stagger(i + 8)} onOpen={() => navigate('/history')} />
          ))}
        </div>
      ) : (
        <p className="empty-inline">No attendance yet. Your clock-ins will appear here.</p>
      )}
    </section>
  );
}

function RecentCardSkeleton() {
  return (
    <section className="card list-card" aria-hidden="true">
      <header className="card-head">
        <Skeleton width={130} height={18} />
        <Skeleton width={48} height={14} />
      </header>
      <div className="day-list">
        <DayRowsSkeleton rows={3} />
      </div>
    </section>
  );
}
