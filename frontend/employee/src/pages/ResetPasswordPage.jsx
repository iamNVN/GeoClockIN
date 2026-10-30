import { ArrowLeft, ArrowRight, CircleCheck, Eye, EyeOff, LinkIcon, LoaderCircle, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthShell, AuthStatus } from '../components/AuthShell.jsx';
import { api } from '../lib/api.js';
import { stagger } from '../lib/motion.js';

const MIN_PASSWORD_LENGTH = 6;

/** Opened from the reset email: /reset-password#token=… */
export default function ResetPasswordPage() {
  const { status, logout } = useAuth();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [stage, setStage] = useState(token ? 'checking' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Keep the token out of the address bar and browser history.
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!token) return undefined;
    let active = true;
    api('/auth/reset-password/check', { method: 'POST', body: { token } })
      .then(({ valid }) => active && setStage(valid ? 'ready' : 'invalid'))
      .catch((err) => {
        if (!active) return;
        setError({ message: err.message });
        setStage('ready');
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError({ message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`, field: 'password' });
      return;
    }
    if (password !== confirm) {
      setError({ message: 'The passwords don’t match.', field: 'confirm' });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setStage('done');
      // The reset ends every session, including one open in this browser.
      if (status === 'authenticated') logout().catch(() => {});
    } catch (err) {
      if (err.code === 'INVALID_RESET_LINK') setStage('invalid');
      else setError({ message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="card login__card reveal" style={stagger(1)} onSubmit={handleSubmit} noValidate>
        {stage === 'checking' && (
          <p className="login__checking" role="status">
            <LoaderCircle className="spin" aria-hidden="true" /> Checking your link…
          </p>
        )}

        {stage === 'invalid' && (
          <>
            <AuthStatus Icon={LinkIcon} tone="amber" title="This link has expired">
              Reset links work once and expire after 30 minutes. Request a new one to continue.
            </AuthStatus>
            <Link to="/forgot-password" className="btn btn--primary btn--block btn--lg">
              Request a new link
            </Link>
          </>
        )}

        {stage === 'done' && (
          <>
            <AuthStatus Icon={CircleCheck} title="Password changed">
              Sign in with your new password. You’ve been signed out on your other devices.
            </AuthStatus>
            <Link to="/login" replace className="btn btn--primary btn--block btn--lg">
              Sign In <ArrowRight className="btn__arrow" aria-hidden="true" />
            </Link>
          </>
        )}

        {stage === 'ready' && (
          <>
            <div>
              <h1 className="login__title">Choose a new password</h1>
              <p className="login__subtitle">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="new-password">
                New Password
              </label>
              <div className={`input${error?.field === 'password' ? ' is-invalid' : ''}`}>
                <Lock aria-hidden="true" />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter a new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error?.field === 'password' || undefined}
                  aria-describedby={error ? 'reset-error' : undefined}
                />
                <button
                  type="button"
                  className="input__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="confirm-password">
                Confirm Password
              </label>
              <div className={`input${error?.field === 'confirm' ? ' is-invalid' : ''}`}>
                <Lock aria-hidden="true" />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter it again"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={error?.field === 'confirm' || undefined}
                  aria-describedby={error ? 'reset-error' : undefined}
                />
              </div>
            </div>

            {error && (
              <p id="reset-error" className="notice notice--error pop-in" role="alert">
                {error.message}
              </p>
            )}

            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
          </>
        )}

        {stage !== 'done' && (
          <Link to="/login" className="link-button login__back">
            <ArrowLeft aria-hidden="true" /> Back to sign in
          </Link>
        )}
      </form>
    </AuthShell>
  );
}
