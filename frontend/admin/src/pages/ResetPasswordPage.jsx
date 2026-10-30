import { ArrowLeft, ArrowRight, CircleCheck, Eye, EyeOff, LinkIcon, LoaderCircle, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout, AuthStatus } from '../components/AuthLayout.jsx';
import { CompanyLogo } from '../components/CompanyLogo.jsx';
import { api } from '../lib/api.js';

const MIN_PASSWORD_LENGTH = 8;

/** Opened from the reset email: /admin/reset-password#token=… */
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
    api('/admin/auth/reset-password/check', { method: 'POST', body: { token } })
      .then(({ valid }) => active && setStage(valid ? 'ready' : 'invalid'))
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setStage('ready');
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The passwords don’t match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/admin/auth/reset-password', { method: 'POST', body: { token, password } });
      setStage('done');
      // The reset ends every session, including one open in this browser.
      if (status === 'authenticated') logout().catch(() => {});
    } catch (err) {
      if (err.code === 'INVALID_RESET_LINK') setStage('invalid');
      else setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth__card reveal" style={{ '--i': 1 }} onSubmit={submit} noValidate>
        {stage === 'checking' && (
          <p className="auth__checking" role="status">
            <LoaderCircle className="spin" aria-hidden="true" /> Checking your link…
          </p>
        )}

        {stage === 'invalid' && (
          <>
            <AuthStatus Icon={LinkIcon} tone="amber" title="This link has expired">
              Reset links work once and expire after 30 minutes. Request a new one to continue.
            </AuthStatus>
            <Link to="/forgot-password" className="btn btn--primary btn--lg btn--block">
              Request a New Link
            </Link>
          </>
        )}

        {stage === 'done' && (
          <>
            <AuthStatus Icon={CircleCheck} title="Password Changed">
              Sign in with your new password. You’ve been signed out everywhere else.
            </AuthStatus>
            <Link to="/login" replace className="btn btn--primary btn--lg btn--block">
              Sign In <ArrowRight aria-hidden="true" />
            </Link>
          </>
        )}

        {stage === 'ready' && (
          <>
            <CompanyLogo className="auth__card-logo" width="120" height="95" alt="" />
            <h2>New Password</h2>
            <p className="auth__card-sub">Use at least {MIN_PASSWORD_LENGTH} characters.</p>

            <label className="field" htmlFor="new-password">
              <span className="field__label">New Password</span>
              <span className="input input--icon">
                <Lock aria-hidden="true" />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter a new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(error) || undefined}
                />
                <button
                  type="button"
                  className="input__action"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </label>

            <label className="field" htmlFor="confirm-password">
              <span className="field__label">Confirm Password</span>
              <span className="input input--icon">
                <Lock aria-hidden="true" />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter it again"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={Boolean(error) || undefined}
                />
              </span>
            </label>

            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
              {submitting ? 'Saving…' : 'Save New Password'}
            </button>
          </>
        )}

        {stage !== 'done' && (
          <Link to="/login" className="link-btn auth__back">
            <ArrowLeft aria-hidden="true" /> Back to sign in
          </Link>
        )}
      </form>
    </AuthLayout>
  );
}
