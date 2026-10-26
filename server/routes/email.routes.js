import express from 'express';
import { sendEmail } from '../services/email.service.js';

const router = express.Router();

function readKey(req) {
  // Key arrives per-request only (header preferred, body fallback).
  // Never persisted — used for one send and dropped.
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (typeof req.body?.key === 'string' && req.body.key.trim()) return req.body.key.trim();
  return '';
}

// ── POST /api/email/send ─────────────────────────────────────
// Body: { key, to, subject, body, from? }
router.post('/send', async (req, res) => {
  try {
    const key = readKey(req);
    const { to, subject, body, from } = req.body || {};
    if (!key) {
      return res.status(401).json({ success: false, code: 'NO_KEY', error: 'Email is not connected. Connect email first, then retry.' });
    }
    const result = await sendEmail({ key, to, subject, body, from });
    res.json({ success: true, email: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, code: err.code || 'SEND_FAILED', error: err.message });
  }
});

export default router;
