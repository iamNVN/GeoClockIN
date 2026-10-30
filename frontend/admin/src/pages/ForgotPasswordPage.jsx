import { ArrowLeft, LoaderCircle, Mail, MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthLayout, AuthStatus } from '../components/AuthLayout.jsx';
import { CompanyLogo } from '../components/CompanyLogo.jsx';
import { api } from '../lib/api.js';

export default function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/admin/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth__card reveal" style={{ '--i': 1 }} onSubmit={submit} noValidate>
        {sent ? (
          <>
            <AuthStatus Icon={MailCheck} title="Check your email">
              If <strong>{email.trim()}</strong> belongs to an admin account, we’ve emailed it a link to choose a new
              password. The link expires in 30 minutes.
            </AuthStatus>
            <p className="notice notice--info">Nothing yet? Check your spam folder, or try again in a minute.</p>
            <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={() => setSent(false)}>
              Try again
            </button>
          </>
        ) : (
          <>
            <CompanyLogo className="auth__card-logo" width="120" height="95" alt="" />
            <h2>Forgot Password?</h2>
            <p className="auth__card-sub">Enter your admin email and we’ll send you a reset link.</p>

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

            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {submitting ? 'Sending…' : 'Send Reset Link'}
            </button>
          </>
        )}

        <Link to="/login" className="link-btn auth__back">
          <ArrowLeft aria-hidden="true" /> Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
