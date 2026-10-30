import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signedBeforePasswordChange } from '../src/auth.js';
import { resetEmail, resetLink } from '../src/lib/resetEmail.js';

describe('resetLink', () => {
  it('points at the reset page of each app, with the token in the fragment', () => {
    const env = { APP_URL: 'https://attendance.example.com/' };
    assert.equal(resetLink('employee', 'abc', env), 'https://attendance.example.com/reset-password#token=abc');
    assert.equal(resetLink('admin', 'abc', env), 'https://attendance.example.com/admin/reset-password#token=abc');
  });

  it('uses the Vercel production domain when APP_URL is not set', () => {
    const env = { VERCEL_PROJECT_PRODUCTION_URL: 'geoclockin.vercel.app' };
    assert.equal(resetLink('employee', 't', env), 'https://geoclockin.vercel.app/reset-password#token=t');
    assert.equal(resetLink('admin', 't', env), 'https://geoclockin.vercel.app/admin/reset-password#token=t');
  });

  it('falls back to the local dev servers', () => {
    assert.equal(resetLink('employee', 't', {}), 'http://localhost:5173/reset-password#token=t');
    assert.equal(resetLink('admin', 't', {}), 'http://localhost:5174/admin/reset-password#token=t');
  });
});

describe('resetEmail', () => {
  const link = 'https://geoclockin.vercel.app/reset-password#token=abc';

  it('includes the link and expiry in both parts', () => {
    const email = resetEmail({ companyName: 'ABC Tech', name: 'John Doe', link, minutes: 30 });
    for (const part of [email.text, email.html]) {
      assert.ok(part.includes(link));
      assert.ok(part.includes('30 minutes'));
    }
    assert.ok(email.text.startsWith('Hi John Doe,'));
  });

  it('escapes names in the HTML part', () => {
    const { html } = resetEmail({ companyName: 'A&B <Co>', name: '<script>x</script>', link, minutes: 30 });
    assert.ok(html.includes('A&amp;B &lt;Co&gt;'));
    assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));
  });
});

describe('signedBeforePasswordChange', () => {
  const changedAt = new Date('2026-10-30T10:00:05.700Z');
  const seconds = (iso) => Math.floor(new Date(iso).getTime() / 1000);

  it('rejects sessions signed before the reset', () => {
    assert.equal(signedBeforePasswordChange(seconds('2026-10-30T09:59:00Z'), changedAt), true);
  });

  it('keeps sessions signed after it, including later in the same second', () => {
    assert.equal(signedBeforePasswordChange(seconds('2026-10-30T10:00:05.900Z'), changedAt), false);
    assert.equal(signedBeforePasswordChange(seconds('2026-10-30T10:01:00Z'), changedAt), false);
  });

  it('accepts every session when the password was never reset', () => {
    assert.equal(signedBeforePasswordChange(seconds('2020-01-01T00:00:00Z'), null), false);
  });
});
