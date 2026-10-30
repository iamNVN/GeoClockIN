// The password reset email and the link it carries.

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Reset page of the employee app (/) or the dashboard (/admin). APP_URL sets the
 * public address; on Vercel it defaults to the production domain.
 */
export function resetLink(role, token, env = process.env) {
  const origin =
    env.APP_URL?.replace(/\/+$/, '') || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  const base = role === 'admin' ? (origin ? `${origin}/admin` : 'http://localhost:5174/admin') : (origin ?? 'http://localhost:5173');
  // In the fragment, so the token never reaches server logs or Referer headers.
  return `${base}/reset-password#token=${token}`;
}

export function resetEmail({ companyName, name, link, minutes }) {
  const subject = 'Reset your GeoClockIN password';
  const text = [
    `Hi ${name},`,
    '',
    `We received a request to reset the password of your GeoClockIN account at ${companyName}.`,
    '',
    `Open this link to choose a new password. It works once and expires in ${minutes} minutes:`,
    link,
    '',
    "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:#f3f6f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
      <tr><td style="padding:28px 28px 8px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0f9d69">${escapeHtml(companyName)} · GeoClockIN</p>
        <h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.55">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.55">We received a request to reset the password of your GeoClockIN account. Choose a new one with the button below.</p>
        <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#0f9d69;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Choose a new password</a></p>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#4b5563">The link works once and expires in ${minutes} minutes. If the button doesn't work, copy this address into your browser:</p>
        <p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#0b7f55">${escapeHtml(link)}</a></p>
      </td></tr>
      <tr><td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">If you didn't ask for this, you can ignore this email. Your password stays the same.</td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
