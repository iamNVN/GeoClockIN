import { ShieldCheck } from 'lucide-react';
import { stagger } from '../lib/motion.js';
import { BrandLogo } from './Logo.jsx';

/** Backdrop, logo and footer shared by the sign-in and password reset screens. */
export function AuthShell({ children }) {
  return (
    <main className="login route-enter">
      <div className="login__backdrop" aria-hidden="true">
        <span className="blob blob--one" />
        <span className="blob blob--two" />
        <span className="blob blob--three" />
      </div>

      <div className="login__brand reveal">
        <BrandLogo width={156} />
        <p>Employee Attendance</p>
      </div>

      {children}

      <p className="login__footer reveal" style={stagger(2)}>
        <ShieldCheck aria-hidden="true" /> Attendance is verified against your office location
      </p>
    </main>
  );
}

/** Centred icon, title and text for the outcome screens (email sent, link expired, done). */
export function AuthStatus({ Icon, tone = 'brand', title, children }) {
  return (
    <div className="login__status pop-in">
      <span className={`login__status-icon login__status-icon--${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <h1 className="login__title">{title}</h1>
      <div className="login__subtitle">{children}</div>
    </div>
  );
}
