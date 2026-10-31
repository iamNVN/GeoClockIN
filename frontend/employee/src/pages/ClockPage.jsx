import { CircleCheck, Clock, LoaderCircle, LogOut, MapPin, QrCode, RefreshCw, Ruler, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { DistanceGauge } from '../components/DistanceGauge.jsx';
import { OfficeQrScanner } from '../components/OfficeQrScanner.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Radar } from '../components/Radar.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';
import { formatDistanceShort, formatDuration, formatTime, formatToday } from '../lib/format.js';
import { getCurrentPosition, LocationError, toCoordinates } from '../lib/geolocation.js';
import { stagger } from '../lib/motion.js';

const ACTIONS = {
  in: {
    title: 'Clock In',
    confirm: 'Confirm Clock In',
    done: 'Clocked In Successfully',
    endpoint: '/attendance/check-in',
    key: 'check_in',
    noun: 'clock-in',
    Icon: Clock,
  },
  out: {
    title: 'Clock Out',
    confirm: 'Confirm Clock Out',
    done: 'Clocked Out Successfully',
    endpoint: '/attendance/check-out',
    key: 'check_out',
    noun: 'clock-out',
    Icon: LogOut,
  },
};

const SEQUENCE_ERRORS = {
  ALREADY_CHECKED_IN: { title: 'Already Clocked In', message: 'You have already clocked in today.' },
  ALREADY_CHECKED_OUT: { title: 'Already Clocked Out', message: 'You have already clocked out today.' },
  NOT_CHECKED_IN: { title: 'Not Clocked In Yet', message: 'You need to clock in before you can clock out.' },
};

/** Which sequence error (if any) applies to `action` given today's status. */
function sequenceErrorFor(action, status) {
  if (action === 'in') {
    if (status === 'checked_in') return 'ALREADY_CHECKED_IN';
    if (status === 'checked_out') return 'ALREADY_CHECKED_OUT';
  } else {
    if (status === 'not_checked_in') return 'NOT_CHECKED_IN';
    if (status === 'checked_out') return 'ALREADY_CHECKED_OUT';
  }
  return null;
}

export default function ClockPage() {
  const { action } = useParams();
  if (!ACTIONS[action]) return <Navigate to="/" replace />;
  return <ClockFlow key={action} action={action} />;
}

/**
 * phase.name:
 *   locating  – reading GPS and verifying it with the server
 *   verified  – inside the geofence. `presence` is the server's signed proof
 *               of the check (its time is what gets recorded). When the office
 *               QR code is required, `qr` tracks the scan and confirming waits
 *               for it.
 *   rejected  – outside the geofence or the reading is too imprecise
 *   failed    – no position (permission, GPS off, timeout) or network error
 *   blocked   – the attendance sequence doesn't allow this action
 *   done      – recorded
 */
function ClockFlow({ action }) {
  const config = ACTIONS[action];
  const navigate = useNavigate();
  const today = useApi('/attendance/today');
  const [phase, setPhase] = useState({ name: 'locating' });
  const runRef = useRef(0);

  const locate = useCallback(async () => {
    const run = ++runRef.current;
    setPhase({ name: 'locating' });
    try {
      const position = await getCurrentPosition();
      const { verification, presence } = await api('/attendance/verify-location', {
        method: 'POST',
        body: { ...toCoordinates(position), action: config.key },
      });
      if (run === runRef.current) setPhase({ name: verification.ok ? 'verified' : 'rejected', verification, presence });
    } catch (error) {
      if (run === runRef.current) setPhase({ name: 'failed', error });
    }
  }, [config.key]);

  useEffect(() => {
    locate();
    return () => {
      runRef.current += 1;
    };
  }, [locate]);

  // A code seen by the scanner: the server checks its signature and age.
  async function checkCode(code) {
    const run = runRef.current;
    setPhase((p) => ({ ...p, qr: { status: 'verifying' } }));
    try {
      const { presence } = await api('/attendance/verify-qr', {
        method: 'POST',
        body: { action: config.key, presence: phase.presence.token, code },
      });
      if (run !== runRef.current) return;
      navigator.vibrate?.(40);
      setPhase((p) => ({ ...p, presence: { ...p.presence, token: presence.token }, qr: { status: 'verified', display: presence.qrDisplay } }));
    } catch (error) {
      if (run !== runRef.current) return;
      if (error.code === 'PRESENCE_EXPIRED') locate();
      else setPhase((p) => ({ ...p, qr: { status: 'scanning', error: error.message } }));
    }
  }

  async function confirm() {
    const run = ++runRef.current;
    setPhase((p) => ({ ...p, submitting: true, submitError: null }));
    try {
      const { record, verification } = await api(config.endpoint, { method: 'POST', body: { presence: phase.presence.token } });
      if (run === runRef.current) setPhase({ name: 'done', record, verification });
    } catch (error) {
      if (run !== runRef.current) return;
      if (error.code === 'PRESENCE_EXPIRED') locate();
      else if (error.code === 'QR_REQUIRED') {
        // Turned on while this screen was open.
        setPhase((p) => ({ ...p, submitting: false, presence: { ...p.presence, qrRequired: true }, qr: null }));
      } else if (SEQUENCE_ERRORS[error.code]) setPhase({ name: 'blocked', code: error.code });
      else setPhase((p) => ({ ...p, submitting: false, submitError: error.message }));
    }
  }

  const goHome = () => navigate('/', { replace: true });

  let content;
  if (phase.name === 'done') {
    content = <ClockSuccess action={action} record={phase.record} verification={phase.verification} onDone={goHome} />;
  } else {
    const blockedCode =
      phase.name === 'blocked' ? phase.code : today.data && sequenceErrorFor(action, today.data.status);
    content = blockedCode ? (
      <ClockBlocked code={blockedCode} onDone={goHome} />
    ) : (
      <ClockVerification action={action} phase={phase} onConfirm={confirm} onRetry={locate} onCancel={goHome} onCode={checkCode} />
    );
  }

  return (
    <main className="page page--no-nav page--clock route-enter">
      <PageHeader title={config.title} />
      {content}
    </main>
  );
}

function describe(phase, radius) {
  const { verification, error } = phase;
  switch (phase.name) {
    case 'locating':
      return { tone: 'pending', title: 'Checking your location…', text: 'Hold on while we confirm you are at the office.' };
    case 'verified':
      return { tone: 'success', title: 'Location Verified', text: 'You are within the office premises.' };
    case 'rejected':
      return verification.code === 'POOR_ACCURACY'
        ? {
            tone: 'warning',
            title: 'Weak Location Signal',
            text: 'We couldn’t pinpoint you precisely enough. Turn on precise location, move near a window or open area, and try again.',
          }
        : {
            tone: 'danger',
            title: 'Outside Office Area',
            text: `Move within ${radius} m of the office to continue.`,
          };
    default:
      if (error instanceof LocationError) {
        return error.code === 'PERMISSION_DENIED'
          ? { tone: 'danger', title: 'Location Access Needed', text: error.message }
          : { tone: 'warning', title: 'Location Unavailable', text: error.message };
      }
      return { tone: 'warning', title: 'Couldn’t Verify Location', text: error.message };
  }
}

function distanceCaption(phase, radius) {
  const { verification } = phase;
  if (!verification) return phase.name === 'locating' ? null : 'Distance unavailable';
  const { distanceM } = verification;
  if (verification.code === 'POOR_ACCURACY') return 'Signal too weak to confirm your position';
  if (distanceM <= radius) return `Inside the ${radius} m office radius`;
  return `${formatDistanceShort(distanceM - radius)} beyond the ${radius} m office radius`;
}

/** Step 2, once the location is verified: the office QR code. */
function QrStep({ action, phase, onCode }) {
  const verified = phase.qr?.status === 'verified';
  return (
    <>
      <ol className="clock-steps reveal">
        <li className="clock-step is-done">
          <CircleCheck aria-hidden="true" />
          <span>
            <strong>Location verified</strong>
            <small>
              {formatDistanceShort(phase.verification.distanceM)} from the office · {formatTime(phase.presence.at)}
            </small>
          </span>
        </li>
        <li className={`clock-step ${verified ? 'is-done' : 'is-current'}`}>
          {verified ? <CircleCheck aria-hidden="true" /> : <QrCode aria-hidden="true" />}
          <span>
            <strong>{verified ? 'Office QR verified' : 'Scan the office QR code'}</strong>
            <small>{verified ? phase.qr.display : 'Shown on the office display'}</small>
          </span>
        </li>
      </ol>
      {verified ? (
        <section className="card qr-done pop-in" aria-live="polite">
          <span className="qr-done__icon">
            <ShieldCheck aria-hidden="true" />
          </span>
          <h2>You’re at the office</h2>
          <p>
            Your {ACTIONS[action].noun} time will be <strong>{formatTime(phase.presence.at)}</strong>, when your location was
            verified.
          </p>
        </section>
      ) : (
        <OfficeQrScanner onCode={onCode} busy={phase.qr?.status === 'verifying'} message={phase.qr?.error} />
      )}
    </>
  );
}

function ClockVerification({ action, phase, onConfirm, onRetry, onCancel, onCode }) {
  const { office } = useAuth();
  const config = ACTIONS[action];
  const radius = office.radiusMeters;
  const { tone, title, text } = describe(phase, radius);
  const distance = phase.verification?.distanceM ?? null;
  const qrStep = phase.name === 'verified' && phase.presence?.qrRequired;
  const ready = phase.name === 'verified' && (!qrStep || phase.qr?.status === 'verified');

  return (
    <>
      {qrStep ? (
        <QrStep action={action} phase={phase} onCode={onCode} />
      ) : (
        <LocationStep phase={phase} tone={tone} title={title} text={text} distance={distance} radius={radius} office={office} />
      )}

      <div className="clock-actions">
        {phase.submitError && (
          <p className="notice notice--error pop-in" role="alert">
            <TriangleAlert aria-hidden="true" /> {phase.submitError}
          </p>
        )}
        {phase.name === 'locating' ? (
          <button type="button" className="btn btn--primary btn--block btn--xl" disabled>
            <LoaderCircle className="spin" aria-hidden="true" /> Verifying location…
          </button>
        ) : phase.name === 'verified' ? (
          <button
            type="button"
            className={`btn btn--block btn--xl btn--shine ${action === 'out' ? 'btn--dark' : 'btn--primary btn--glow'}`}
            onClick={onConfirm}
            disabled={phase.submitting || !ready}
          >
            {phase.submitting ? (
              <>
                <LoaderCircle className="spin" aria-hidden="true" /> Recording…
              </>
            ) : (
              <>
                <config.Icon aria-hidden="true" /> {config.confirm}
              </>
            )}
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--block btn--xl" onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Try Again
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--block" onClick={onCancel} disabled={phase.submitting}>
          Cancel
        </button>
      </div>
    </>
  );
}

/** Step 1: the location check, with the radar and the distance from the office. */
function LocationStep({ phase, tone, title, text, distance, radius, office }) {
  return (
    <>
      <section className="clock-status" aria-live="polite">
        <Radar tone={tone} distance={distance} radius={radius} />
        <h2 key={title} className="clock-status__title swap-in">
          {title}
        </h2>
        <p key={text} className="clock-status__text swap-in">
          {text}
        </p>
      </section>

      <ul className="info-list">
        <li className="card info-row reveal" style={stagger(1)}>
          <span className="info-row__icon">
            <MapPin aria-hidden="true" />
          </span>
          <div className="info-row__body">
            <p className="info-row__title">Office Location</p>
            <p className="info-row__text">
              {office.name}
              {office.address && (
                <>
                  <br />
                  {office.address}
                </>
              )}
            </p>
          </div>
        </li>
        <li className={`card info-row info-row--distance info-row--${tone} reveal`} style={stagger(2)}>
          <span className="info-row__icon">
            <Ruler aria-hidden="true" />
          </span>
          <div className="info-row__body">
            <div className="info-row__head">
              <p className="info-row__title">Distance from Office</p>
              {phase.name === 'locating' ? (
                <Skeleton width={52} height={20} />
              ) : (
                <p key={distance} className="info-row__value swap-in">
                  {distance == null
                    ? '—'
                    : `${phase.verification.code === 'POOR_ACCURACY' ? '≈ ' : ''}${formatDistanceShort(distance)}`}
                </p>
              )}
            </div>
            {phase.name === 'locating' ? (
              <>
                <Skeleton width="70%" height={12} />
                <Skeleton height={8} radius={999} style={{ marginTop: 14 }} />
              </>
            ) : (
              <>
                <p className="info-row__text">{distanceCaption(phase, radius)}</p>
                <DistanceGauge key={distance} distance={distance} radius={radius} tone={tone} />
              </>
            )}
          </div>
        </li>
      </ul>
    </>
  );
}

const CONFETTI = Array.from({ length: 18 }, (_, i) => i);

function SuccessMark() {
  return (
    <div className="success-mark" aria-hidden="true">
      <span className="success-mark__burst">
        {CONFETTI.map((i) => (
          <span key={i} style={{ '--n': i }} />
        ))}
      </span>
      <svg viewBox="0 0 96 96">
        <circle className="success-mark__circle" cx="48" cy="48" r="44" />
        <path className="success-mark__check" d="M29 49.5l12.5 12.5L67 36.5" />
      </svg>
    </div>
  );
}

function ClockSuccess({ action, record, verification, onDone }) {
  const isIn = action === 'in';
  const at = isIn ? record.checkInAt : record.checkOutAt;
  const distance = isIn ? record.checkInDistanceM : record.checkOutDistanceM;

  return (
    <section className="clock-result" aria-live="polite">
      <SuccessMark />
      <h2 className="clock-result__title reveal" style={stagger(3)}>
        {ACTIONS[action].done}
      </h2>
      <p className="clock-result__date reveal" style={stagger(4)}>
        {formatToday(new Date(at))}
      </p>

      <dl className="card receipt reveal" style={stagger(5)}>
        <div>
          <dt>{isIn ? 'Clock-in time' : 'Clock-out time'}</dt>
          <dd className="receipt__time">{formatTime(at)}</dd>
        </div>
        {isIn ? (
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={record.isLate ? 'late' : 'present'} />
            </dd>
          </div>
        ) : (
          <div>
            <dt>Worked today</dt>
            <dd>{formatDuration(record.workedMinutes)}</dd>
          </div>
        )}
        <div>
          <dt>Distance from office</dt>
          <dd>{formatDistanceShort(distance ?? verification?.distanceM)}</dd>
        </div>
      </dl>

      {isIn && record.isLate && (
        <p className="notice notice--warning reveal" style={stagger(6)}>
          <TriangleAlert aria-hidden="true" /> This check-in is after the grace period and is marked late.
        </p>
      )}

      <button
        type="button"
        className="btn btn--primary btn--block btn--xl reveal"
        style={stagger(7)}
        onClick={onDone}
        autoFocus
      >
        Back to Home
      </button>
    </section>
  );
}

function ClockBlocked({ code, onDone }) {
  const { title, message } = SEQUENCE_ERRORS[code];
  return (
    <section className="clock-result">
      <Radar tone="neutral" />
      <h2 className="clock-result__title reveal">{title}</h2>
      <p className="clock-result__text reveal" style={stagger(1)}>
        {message}
      </p>
      <button type="button" className="btn btn--primary btn--block btn--xl reveal" style={stagger(2)} onClick={onDone}>
        Back to Home
      </button>
    </section>
  );
}
