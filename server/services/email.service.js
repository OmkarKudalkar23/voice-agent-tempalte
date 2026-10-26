/**
 * Email service — sending via the Resend HTTP API (zero extra deps).
 *
 * Auth is per-call only: the caller passes a short-lived Resend API key
 * that is used for exactly one API call and never persisted.
 * Nothing here writes keys to disk.
 */

const RESEND_API = 'https://api.resend.com/emails';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Turn spoken addresses ("priya at example dot com") into real ones. */
export function normalizeAddress(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+at\s+/g, '@')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s+/g, '');
}

export function validateEmailFields({ to, subject, body }) {
  const cleanTo = normalizeAddress(to);
  if (!EMAIL_RE.test(cleanTo)) {
    const err = new Error('That email address doesn\u2019t look valid. Please spell the recipient address.');
    err.code = 'BAD_ADDRESS';
    throw err;
  }
  const cleanSubject = String(subject || '').trim().slice(0, 200);
  if (!cleanSubject) {
    const err = new Error('I need a subject line for the email.');
    err.code = 'MISSING_SUBJECT';
    throw err;
  }
  const cleanBody = String(body || '').trim().slice(0, 5000);
  if (!cleanBody) {
    const err = new Error('I need something to say in the email body.');
    err.code = 'MISSING_BODY';
    throw err;
  }
  return { to: cleanTo, subject: cleanSubject, body: cleanBody };
}

export async function sendEmail({ key, to, subject, body, from }) {
  if (!key) {
    const err = new Error('Email is not connected for this call.');
    err.code = 'NO_KEY';
    throw err;
  }
  const fields = validateEmailFields({ to, subject, body });
  const fromAddr = (typeof from === 'string' && from.trim()) || 'AI Voice Agent <onboarding@resend.dev>';

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddr,
      to: [fields.to],
      subject: fields.subject,
      text: fields.body,
    }),
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (res.status === 401 || res.status === 403) {
    const err = new Error('The email key was rejected. Reconnect email and try again.');
    err.code = 'BAD_KEY'; err.status = res.status;
    throw err;
  }
  if (res.status === 422) {
    const err = new Error(data?.message || 'The email was rejected. Check the recipient address.');
    err.code = 'REJECTED'; err.status = 422;
    throw err;
  }
  if (res.status === 429) {
    const err = new Error('Email rate limit hit. Wait a moment and try again.');
    err.code = 'RATE_LIMITED'; err.status = 429;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Email send failed (${res.status}).`);
    err.code = 'SEND_FAILED'; err.status = res.status;
    throw err;
  }

  return { id: data?.id || null, to: fields.to, subject: fields.subject };
}
