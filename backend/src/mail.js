// Outgoing email over SMTP, so any provider works (Gmail, Brevo, Resend, Mailgun…).
import nodemailer from 'nodemailer';

const isProduction = process.env.NODE_ENV === 'production';
let transport;

const smtpConfigured = () => Boolean(process.env.SMTP_HOST);

/** Locally, without SMTP settings, emails are printed to the console instead of sent. */
export const canSendMail = () => smtpConfigured() || !isProduction;

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

/** Sends `message` ({ to, subject, text, html }) from MAIL_FROM, or from SMTP_USER as `senderName`. */
export async function sendMail(message, senderName) {
  if (!smtpConfigured()) {
    console.info(`\n[mail] SMTP is not configured, so this email was not sent.\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    return;
  }
  const from = process.env.MAIL_FROM || { name: senderName, address: process.env.SMTP_USER };
  await getTransport().sendMail({ ...message, from });
}
