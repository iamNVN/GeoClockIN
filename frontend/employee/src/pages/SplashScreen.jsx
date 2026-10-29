import { RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { OfficeScene } from '../components/Illustrations.jsx';
import { LogoMark, Wordmark } from '../components/Logo.jsx';

export default function SplashScreen() {
  const { status, error, retry } = useAuth();

  return (
    <main className="splash">
      <div className="splash__brand">
        <LogoMark size={88} />
        <h1>
          <Wordmark className="wordmark--xl" />
        </h1>
        <p className="splash__motto">Right Place. Right Time.</p>
      </div>

      <OfficeScene className="splash__scene" />

      <p className="splash__tagline">
        Employee Attendance
        <br />
        Made Simple
      </p>

      {status === 'error' ? (
        <div className="splash__error" role="alert">
          <p>{error.message}</p>
          <button type="button" className="btn btn--primary" onClick={retry}>
            <RefreshCw aria-hidden="true" /> Try again
          </button>
        </div>
      ) : (
        <div className="splash__dots" role="status" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
      )}
    </main>
  );
}
