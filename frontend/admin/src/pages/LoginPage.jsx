import { ArrowRight, Eye, EyeOff, Info, LoaderCircle, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { CompanyLogo } from '../components/CompanyLogo.jsx';
import { EMPLOYEE_APP_URL } from '../lib/links.js';

export default function LoginPage() {
  const { status, login, sessionExpired } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (status === 'authenticated') {
    const from = location.state?.from;
    return <Navigate to={from ? `${from.pathname}${from.search}` : '/'} replace />;
  }

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password, rememberMe });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth__card reveal" style={{ '--i': 1 }} onSubmit={submit} noValidate>
        <CompanyLogo className="auth__card-logo" width="120" height="95" alt="" />
        <h2>Welcome Back</h2>
        <p className="auth__card-sub">Sign in to the admin dashboard</p>

        {sessionExpired && !error && (
          <p className="notice notice--info">
            <Info aria-hidden="true" /> Your session has expired. Please sign in again.
          </p>
        )}

        <label className="field" htmlFor="email">
          <span className="field__label">Email Address</span>
          <span className="input input--icon">
            <Mail aria-hidden="true" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error) || undefined}
            />
          </span>
        </label>

        <label className="field" htmlFor="password">
          <span className="field__label">Password</span>
          <span className="input input--icon">
            <Lock aria-hidden="true" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
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

        <div className="auth__row">
          <label className="checkbox">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Remember me
          </label>
          <Link to="/forgot-password" state={{ email: email.trim() }} className="link-btn">
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={submitting}>
          {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
          {submitting ? 'Signing in…' : 'Sign In'}
          {!submitting && <ArrowRight aria-hidden="true" />}
        </button>
        <p className="auth__employee-link">
          Employee? <a href={EMPLOYEE_APP_URL}>Open the employee app</a>
        </p>
      </form>
    </AuthLayout>
  );
}
