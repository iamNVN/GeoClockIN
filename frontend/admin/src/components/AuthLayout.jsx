import { ChartNoAxesColumn, MapPin, Smartphone, Users } from 'lucide-react';
import { CompanyLogo } from './CompanyLogo.jsx';

const FEATURES = [
  { Icon: MapPin, title: 'Location Verified', text: 'Accurate attendance with GPS geofencing' },
  { Icon: Smartphone, title: 'Mobile Check-In', text: 'Easy and secure for your team' },
  { Icon: ChartNoAxesColumn, title: 'Detailed Reports', text: 'Get insights and export anytime' },
  { Icon: Users, title: 'Manage Employees', text: 'Add, manage and control access' },
];

/** Brand panel beside the sign-in and password reset cards. */
export function AuthLayout({ children }) {
  return (
    <main className="auth">
      <section className="auth__aside">
        <CompanyLogo className="auth__logo reveal" width="170" height="134" />
        <h1 className="auth__headline reveal" style={{ '--i': 1 }}>
          Simple Attendance
          <br />
          for Modern Teams
        </h1>
        <p className="auth__lead reveal" style={{ '--i': 2 }}>
          Location-based attendance, easy management and powerful insights — all in one place.
        </p>
        <ul className="features">
          {FEATURES.map(({ Icon, title, text }, i) => (
            <li key={title} className="feature reveal" style={{ '--i': i + 3 }}>
              <span className="feature__icon">
                <Icon aria-hidden="true" />
              </span>
              <span>
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="auth__panel">{children}</section>
    </main>
  );
}

/** Icon, title and text for the outcome screens (email sent, link expired, done). */
export function AuthStatus({ Icon, tone = 'brand', title, children }) {
  return (
    <div className="auth__status">
      <span className={`auth__status-icon auth__status-icon--${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p className="auth__card-sub">{children}</p>
    </div>
  );
}
