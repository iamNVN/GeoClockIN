import { RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { OfficeScene } from '../components/Illustrations.jsx';
import { BrandLogo } from '../components/Logo.jsx';

export default function SplashScreen() {
  const { status, error, retry } = useAuth();

  return (
    <main className="splash">
      <span className="splash__glow" aria-hidden="true" />
      <div className="splash__brand">
        <h1>
          <BrandLogo width={232} className="splash__logo" />
        </h1>
        <p className="splash__motto">Right Place. Right Time.</p>
      </div>

      <OfficeScene className="splash__scene" />

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
