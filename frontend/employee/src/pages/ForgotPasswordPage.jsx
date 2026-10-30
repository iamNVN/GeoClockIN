import { ArrowLeft, LoaderCircle, Mail, MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthShell, AuthStatus } from '../components/AuthShell.jsx';
import { api } from '../lib/api.js';
import { stagger } from '../lib/motion.js';

export default function ForgotPasswordPage() {
  const location = useLocation();
  const [identifier, setIdentifier] = useState(location.state?.identifier ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!identifier.trim()) {
      setError('Enter your employee ID or email.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { identifier: identifier.trim() } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="card login__card reveal" style={stagger(1)} onSubmit={handleSubmit} noValidate>
        {sent ? (
          <>
            <AuthStatus Icon={MailCheck} title="Check your email">
              If an active account matches <strong>{identifier.trim()}</strong>, we’ve emailed it a link to choose a
              new password. The link expires in 30 minutes.
            </AuthStatus>
            <p className="notice notice--info">Nothing yet? Check your spam folder, or try again in a minute.</p>
            <button type="button" className="btn btn--secondary btn--block" onClick={() => setSent(false)}>
              Try again
            </button>
          </>
        ) : (
          <>
            <div>
              <h1 className="login__title">Forgot your password?</h1>
              <p className="login__subtitle">Enter your employee ID or email and we’ll email you a reset link.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="identifier">
                Employee ID or Email
              </label>
              <div className={`input${error ? ' is-invalid' : ''}`}>
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
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'forgot-error' : undefined}
                />
              </div>
            </div>

            {error && (
              <p id="forgot-error" className="notice notice--error pop-in" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}

        <Link to="/login" className="link-button login__back">
          <ArrowLeft aria-hidden="true" /> Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
