import express from 'express';
import { createGithubRepo, getGithubUser } from '../services/github.service.js';

const router = express.Router();

function readToken(req) {
  // Token arrives per-request only (header preferred, body fallback).
  // Never persisted — used for one GitHub call and dropped.
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (typeof req.body?.token === 'string' && req.body.token.trim()) return req.body.token.trim();
  return '';
}

// ── POST /api/github/verify ──────────────────────────────────
// Body: { token } — checks the token and returns the GitHub login.
router.post('/verify', async (req, res) => {
  try {
    const token = readToken(req);
    if (!token) return res.status(400).json({ success: false, error: 'Missing GitHub token. Paste a token to connect.' });
    const user = await getGithubUser({ token });
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message || 'GitHub verification failed.' });
  }
});

// ── POST /api/github/create-repo ─────────────────────────────
// Body: { token, name, description?, private? }
router.post('/create-repo', async (req, res) => {
  try {
    const token = readToken(req);
    const { name, description = '', private: isPrivate = false } = req.body || {};
    if (!token) return res.status(401).json({ success: false, code: 'NO_TOKEN', error: 'GitHub is not connected. Connect GitHub first, then retry.' });
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, code: 'MISSING_NAME', error: 'Repository name is required.' });
    }
    const repo = await createGithubRepo({ token, name, description, privateRepo: !!isPrivate });
    res.json({ success: true, repo });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, code: err.code || 'CREATE_FAILED', error: err.message });
  }
});

export default router;
