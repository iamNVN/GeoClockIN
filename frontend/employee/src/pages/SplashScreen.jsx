import { RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Same look as the launch splash in index.html (and its styles). Shown when the
 * session check fails, and while retrying it.
 */
export default function SplashScreen() {
  const { status, error, retry } = useAuth();

  return (
    <main className="splash">
      <span className="splash__glow" aria-hidden="true" />
      <div className="splash__brand">
        <h1>
          <img
            className="splash__logo is-loaded"
            src="/brand/logo.webp"
            width="196"
            height="155"
            alt="GeoClockIN"
          />
        </h1>
        <p className="splash__motto">Right Place. Right Time.</p>
      </div>
      <img className="splash__scene" src="/brand/office-scene.svg" width="290" height="193" alt="" />
      <div className="splash__footer">
        <p className="splash__tagline">Employee Attendance Made Simple</p>
        {status === 'error' ? (
          <div className="splash__error" role="alert">
            <p>{error.message}</p>
            <button type="button" className="btn btn--primary" onClick={retry}>
              <RefreshCw aria-hidden="true" /> Try again
            </button>
          </div>
        ) : (
          <span className="splash__progress" role="status" aria-label="Loading">
            <span />
          </span>
        )}
      </div>
    </main>
  );
}
