import {
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock,
  Hourglass,
  LoaderCircle,
  LogOut,
  Mail,
  Phone,
  Radius,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { formatShortDate, formatTimeOfDay, formatWorkdays } from '../lib/format.js';
import { stagger } from '../lib/motion.js';

export default function ProfilePage() {
  const { employee, office, schedule, company, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await logout();
    } catch (err) {
      setError(err.message);
      setSigningOut(false);
    }
  }

  return (
    <main className="page page--profile">
      <section className="profile-hero reveal">
        <Avatar name={employee.name} size="lg" />
        <div className="profile-hero__text">
          <h1 className="profile-hero__name">{employee.name}</h1>
          {employee.designation && <p className="profile-hero__role">{employee.designation}</p>}
          <p className="profile-hero__chips">
            <span className="hero__chip">{employee.id}</span>
            {company.name && <span className="hero__chip hero__chip--ghost">{company.name}</span>}
          </p>
        </div>
      </section>

      <section className="card list-card reveal" style={stagger(1)} aria-labelledby="contact-title">
        <h2 id="contact-title" className="list-card__title">
          Personal details
        </h2>
        <InfoRow Icon={Mail} label="Email" value={employee.email} />
        <InfoRow Icon={Phone} label="Phone" value={employee.phone} />
        <InfoRow Icon={Users} label="Department" value={employee.department} />
        <InfoRow Icon={CalendarDays} label="Joined on" value={formatShortDate(employee.joinedOn)} />
      </section>

      <section className="card list-card reveal" style={stagger(2)} aria-labelledby="office-title">
        <h2 id="office-title" className="list-card__title">
          Office &amp; schedule
        </h2>
        <InfoRow Icon={Building2} label={office.name} value={office.address} />
        <InfoRow
          Icon={Clock}
          label="Work hours"
          value={`${formatTimeOfDay(schedule.workStart)} – ${formatTimeOfDay(schedule.workEnd)}`}
        />
        <InfoRow Icon={Hourglass} label="Grace period" value={`${schedule.graceMinutes} minutes`} />
        <InfoRow Icon={CalendarCheck} label="Workdays" value={formatWorkdays(schedule.workdays)} />
        <InfoRow Icon={Radius} label="Clock-in radius" value={`Within ${office.radiusMeters} m of the office`} />
      </section>

      <p className="privacy-note reveal" style={stagger(3)}>
        <ShieldCheck aria-hidden="true" />
        <span>
          Your location is only read when you check it or clock in/out. GeoClockIN stores your distance from the
          office — never your exact coordinates.
        </span>
      </p>

      {error && (
        <p className="notice notice--error pop-in" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn--danger btn--block reveal"
        style={stagger(4)}
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
        Sign Out
      </button>
    </main>
  );
}

function InfoRow({ Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="info-line">
      <span className="info-line__icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="info-line__text">
        <span className="info-line__label">{label}</span>
        <span className="info-line__value">{value}</span>
      </span>
    </div>
  );
}
