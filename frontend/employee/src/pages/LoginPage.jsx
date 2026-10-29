import { ArrowRight, Eye, EyeOff, Info, LoaderCircle, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { BrandLogo } from '../components/Logo.jsx';
import { stagger } from '../lib/motion.js';

export default function LoginPage() {
  const { status, login, sessionExpired } = useAuth();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [shaking, setShaking] = useState(false);

  if (status === 'authenticated') {
    const from = location.state?.from;
    return <Navigate to={from ? `${from.pathname}${from.search}` : '/'} replace />;
  }

  function fail(nextError) {
    setError(nextError);
    setShaking(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      fail({
        message: 'Enter your employee ID or email and your password.',
        field: !identifier.trim() ? 'identifier' : 'password',
      });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ identifier: identifier.trim(), password, rememberMe });
    } catch (err) {
      fail({ message: err.message });
      setSubmitting(false);
    }
  }

  const identifierInvalid = error && error.field !== 'password';
  const passwordInvalid = error && error.field !== 'identifier';

  return (
    <main className="login route-enter">
      <div className="login__backdrop" aria-hidden="true">
        <span className="blob blob--one" />
        <span className="blob blob--two" />
        <span className="blob blob--three" />
      </div>

      <div className="login__brand reveal">
        <BrandLogo width={188} />
        <p>Employee Attendance</p>
      </div>

      <form
        className={`card login__card reveal${shaking ? ' shake' : ''}`}
        style={stagger(1)}
        onSubmit={handleSubmit}
        onAnimationEnd={(event) => event.animationName === 'shake' && setShaking(false)}
        noValidate
      >
        <div>
          <h1 className="login__title">Welcome back</h1>
          <p className="login__subtitle">Sign in to clock in and track your attendance.</p>
        </div>

        {sessionExpired && !error && (
          <p className="notice notice--info" role="status">
            <Info aria-hidden="true" /> Your session has expired. Please sign in again.
          </p>
        )}

        <div className="field">
          <label className="field__label" htmlFor="identifier">
            Employee ID or Email
          </label>
          <div className={`input${identifierInvalid ? ' is-invalid' : ''}`}>
            <Mail aria-hidden="true" />
            <input
              id="identifier"
              name="username"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              placeholder="e.g. EMP001 or name@company.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={identifierInvalid || undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="password">
            Password
          </label>
          <div className={`input${passwordInvalid ? ' is-invalid' : ''}`}>
            <Lock aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={passwordInvalid || undefined}
              aria-describedby={error ? 'login-error' : undefined}
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

        <div className="login__row">
          <label className="checkbox">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Remember me
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowForgotHelp((v) => !v)}
            aria-expanded={showForgotHelp}
            aria-controls="forgot-help"
          >
            Forgot password?
          </button>
        </div>

        {showForgotHelp && (
          <p id="forgot-help" className="notice notice--info pop-in">
            <Info aria-hidden="true" /> Passwords are reset by your administrator. Please contact HR or your manager.
          </p>
        )}

        {error && (
          <p id="login-error" className="notice notice--error pop-in" role="alert">
            {error.message}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block btn--lg btn--shine" disabled={submitting}>
          {submitting ? (
            <>
              <LoaderCircle className="spin" aria-hidden="true" /> Signing in…
            </>
          ) : (
            <>
              Sign In <ArrowRight className="btn__arrow" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <p className="login__footer reveal" style={stagger(2)}>
        <ShieldCheck aria-hidden="true" /> Attendance is verified against your office location
      </p>
    </main>
  );
}
