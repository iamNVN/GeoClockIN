import { LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { formatShortDate, formatTimeOfDay, formatWorkdays } from '../lib/format.js';

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
    <main className="page">
      <header className="page-header page-header--plain">
        <h1 className="page-header__title">Profile</h1>
      </header>

      <section className="profile-hero">
        <Avatar name={employee.name} size="lg" />
        <h2 className="profile-hero__name">{employee.name}</h2>
        {employee.designation && <p className="profile-hero__role">{employee.designation}</p>}
        <span className="chip">{employee.id}</span>
      </section>

      <section className="card detail-card" aria-labelledby="personal-title">
        <h3 id="personal-title" className="card-title">
          Personal details
        </h3>
        <dl className="detail-list">
          <Detail label="Email" value={employee.email} />
          <Detail label="Phone" value={employee.phone} />
          <Detail label="Department" value={employee.department} />
          <Detail label="Joined on" value={formatShortDate(employee.joinedOn)} />
        </dl>
      </section>

      <section className="card detail-card" aria-labelledby="office-title">
        <h3 id="office-title" className="card-title">
          Office
        </h3>
        <dl className="detail-list">
          {company.name && <Detail label="Company" value={company.name} />}
          <Detail label="Office" value={office.name} />
          <Detail label="Address" value={office.address} />
          <Detail label="Work hours" value={`${formatTimeOfDay(schedule.workStart)} – ${formatTimeOfDay(schedule.workEnd)}`} />
          <Detail label="Grace period" value={`${schedule.graceMinutes} minutes`} />
          <Detail label="Workdays" value={formatWorkdays(schedule.workdays)} />
          <Detail label="Clock-in radius" value={`${office.radiusMeters} m from office`} />
        </dl>
      </section>

      <p className="privacy-note">
        <ShieldCheck aria-hidden="true" />
        <span>
          Your location is only read when you check your location or clock in/out. GeoClockIN stores your distance
          from the office and the reading&apos;s accuracy — never your exact coordinates.
        </span>
      </p>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn btn--danger btn--block" onClick={handleSignOut} disabled={signingOut}>
        {signingOut ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
        Sign Out
      </button>
    </main>
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
